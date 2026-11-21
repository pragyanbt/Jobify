import { htmlToText } from "./html";

// Job sources. Every source here is a public, documented API that employers or
// job boards publish for third-party display:
//  - Greenhouse / Lever / Ashby: the companies' own career-site feeds.
//  - Remotive: public remote-jobs API (attribution: links go back to Remotive).
//  - Adzuna: aggregator API, requires a free app id/key.
// We don't scrape sites whose terms prohibit it (LinkedIn, Indeed, ...).

export interface Listing {
  externalKey: string;
  source: string; // e.g. "greenhouse:stripe"
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  postedAt: Date | null;
  description?: string;
  /** Fetch the full description lazily (only for listings that pass filters). */
  hydrate?: () => Promise<string>;
}

const UA = "Jobify/0.1 (personal job search tool)";
const TIMEOUT_MS = 20_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error(`Unexpected response (${type || "no content type"})`);
  return (await res.json()) as T;
}

const NAMES: Record<string, string> = {
  doordashusa: "DoorDash", openai: "OpenAI", posthog: "PostHog", gitlab: "GitLab", mongodb: "MongoDB",
  okta: "Okta", zoox: "Zoox", axon: "Axon",
};
export function companyName(slug: string): string {
  return NAMES[slug] ?? slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const date = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};
const looksRemote = (...parts: (string | undefined | null)[]) => parts.some((p) => p && /remote/i.test(p));

// ---------------------------------------------------------------- Greenhouse

interface GhJob {
  id: number;
  title: string;
  company_name?: string;
  absolute_url: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
}

export async function greenhouse(board: string): Promise<Listing[]> {
  const { jobs } = await getJson<{ jobs: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs`);
  return jobs.map((j) => {
    const location = j.location?.name ?? "";
    return {
      externalKey: `greenhouse:${board}:${j.id}`,
      source: `greenhouse:${board}`,
      company: j.company_name || companyName(board),
      title: j.title.trim(),
      location,
      remote: looksRemote(location, j.title),
      url: j.absolute_url,
      postedAt: date(j.first_published ?? j.updated_at),
      hydrate: async () => {
        const d = await getJson<{ content?: string }>(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${j.id}`,
        );
        return htmlToText(d.content ?? "");
      },
    };
  });
}

// -------------------------------------------------------------------- Lever

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
}

export async function lever(company: string): Promise<Listing[]> {
  const jobs = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`);
  return jobs.map((j) => {
    const location = j.categories?.allLocations?.join(" / ") || j.categories?.location || "";
    const description = [
      j.descriptionPlain ?? "",
      ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      j.additionalPlain ?? "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return {
      externalKey: `lever:${company}:${j.id}`,
      source: `lever:${company}`,
      company: companyName(company),
      title: j.text.trim(),
      location,
      remote: j.workplaceType === "remote" || looksRemote(location),
      url: j.hostedUrl,
      postedAt: date(j.createdAt),
      description,
    };
  });
}

// -------------------------------------------------------------------- Ashby

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
}

export async function ashby(org: string): Promise<Listing[]> {
  const { jobs } = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`);
  return jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join(" / ");
      return {
        externalKey: `ashby:${org}:${j.id}`,
        source: `ashby:${org}`,
        company: companyName(org),
        title: j.title.trim(),
        location,
        remote: j.workplaceType === "Remote" || looksRemote(location),
        url: j.jobUrl,
        postedAt: date(j.publishedAt),
        description: (j.descriptionPlain ?? "").trim(),
      };
    });
}

// ----------------------------------------------------------------- Remotive

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  description?: string;
}

/** One request per keyword (Remotive asks clients to keep request volume low). */
export async function remotive(keywords: string[]): Promise<Listing[]> {
  const out = new Map<string, Listing>();
  for (const kw of keywords.slice(0, 6)) {
    const { jobs } = await getJson<{ jobs: RemotiveJob[] }>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(kw)}&limit=100`,
    );
    for (const j of jobs) {
      out.set(String(j.id), {
        externalKey: `remotive:${j.id}`,
        source: "remotive",
        company: j.company_name,
        title: j.title.trim(),
        location: `Remote (${j.candidate_required_location || "Anywhere"})`,
        remote: true,
        url: j.url,
        postedAt: date(j.publication_date),
        description: htmlToText(j.description ?? ""),
      });
    }
  }
  return [...out.values()];
}

// ------------------------------------------------------------------- Adzuna

interface AdzunaJob {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  created?: string;
  redirect_url: string;
  description?: string;
}

export function adzunaConfigured() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

/** US search per keyword × location. Adzuna returns description snippets only. */
export async function adzuna(keywords: string[], locations: string[], maxAgeDays: number): Promise<Listing[]> {
  if (!adzunaConfigured()) throw new Error("Set ADZUNA_APP_ID and ADZUNA_APP_KEY to enable Adzuna.");
  const out = new Map<string, Listing>();
  const wheres = locations.length ? locations : [""];
  for (const kw of keywords.slice(0, 5)) {
    for (const where of wheres.slice(0, 3)) {
      const q = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID!,
        app_key: process.env.ADZUNA_APP_KEY!,
        what_phrase: kw,
        max_days_old: String(maxAgeDays),
        sort_by: "date",
        results_per_page: "50",
        "content-type": "application/json",
      });
      if (where) q.set("where", where);
      const { results } = await getJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/us/search/1?${q}`);
      for (const j of results) {
        const title = htmlToText(j.title);
        const location = j.location?.display_name ?? "";
        out.set(j.id, {
          externalKey: `adzuna:${j.id}`,
          source: "adzuna",
          company: j.company?.display_name ?? "Unknown company",
          title,
          location,
          remote: looksRemote(location, title),
          url: j.redirect_url,
          postedAt: date(j.created),
          description: htmlToText(j.description ?? ""),
        });
      }
    }
  }
  return [...out.values()];
}
