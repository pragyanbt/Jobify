import { extractJobFromPage } from "../ai/operations";
import { safeFetchText } from "../net";
import { decodeEntities, htmlToText } from "./html";
import { companyName } from "./sources";

// "Add job from link": turn a posting URL into editable job details.
// Order of preference: official ATS APIs → schema.org JobPosting data embedded
// in the page → Claude extraction from the page text.

export interface FetchedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  remote: boolean;
  postedAt: string | null;
  externalKey: string | null;
  via: "greenhouse" | "lever" | "ashby" | "structured-data" | "ai" | "pasted";
}

/** Sites whose terms prohibit automated access; we keep the link but don't fetch. */
const NO_FETCH = [
  { re: /(^|\.)linkedin\.com$/i, name: "LinkedIn" },
  { re: /(^|\.)indeed\.com$/i, name: "Indeed" },
  { re: /(^|\.)glassdoor\.[a-z.]+$/i, name: "Glassdoor" },
  { re: /(^|\.)ziprecruiter\.com$/i, name: "ZipRecruiter" },
];

export class ManualEntryNeeded extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const r = await safeFetchText(url, "application/json");
  return JSON.parse(r.text) as T;
}

const remoteIn = (...s: (string | undefined)[]) => s.some((x) => x && /remote/i.test(x));

// ------------------------------------------------------------------ ATS APIs

async function fromGreenhouse(u: URL): Promise<FetchedJob | null> {
  let board: string | undefined;
  let id: string | undefined;
  const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (/(^|\.)greenhouse\.io$/.test(u.hostname) && m) [, board, id] = m;
  if (u.pathname.includes("/embed/job_app")) {
    board = u.searchParams.get("for") ?? undefined;
    id = u.searchParams.get("token") ?? undefined;
  }
  if (!board || !id) return null;
  const j = await getJson<{
    title: string; company_name?: string; location?: { name?: string }; content?: string;
    absolute_url?: string; first_published?: string; updated_at?: string;
  }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`);
  const location = j.location?.name ?? "";
  return {
    title: j.title.trim(),
    company: j.company_name || companyName(board),
    location,
    description: htmlToText(j.content ?? ""),
    url: j.absolute_url || u.toString(),
    remote: remoteIn(location, j.title),
    postedAt: j.first_published ?? j.updated_at ?? null,
    externalKey: `greenhouse:${board}:${id}`,
    via: "greenhouse",
  };
}

async function fromLever(u: URL): Promise<FetchedJob | null> {
  if (!/^jobs\.(eu\.)?lever\.co$/.test(u.hostname)) return null;
  const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
  if (!m) return null;
  const [, co, id] = m;
  const api = u.hostname.startsWith("jobs.eu.") ? "api.eu.lever.co" : "api.lever.co";
  const j = await getJson<{
    text: string; hostedUrl: string; createdAt?: number; workplaceType?: string;
    categories?: { location?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[]; additionalPlain?: string;
  }>(`https://${api}/v0/postings/${encodeURIComponent(co)}/${id}`);
  const location = j.categories?.location ?? "";
  return {
    title: j.text.trim(),
    company: companyName(co),
    location,
    description: [j.descriptionPlain ?? "", ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain ?? ""]
      .filter(Boolean).join("\n\n").trim(),
    url: j.hostedUrl,
    remote: j.workplaceType === "remote" || remoteIn(location),
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    externalKey: `lever:${co}:${id}`,
    via: "lever",
  };
}

async function fromAshby(u: URL): Promise<FetchedJob | null> {
  if (u.hostname !== "jobs.ashbyhq.com") return null;
  const m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
  if (!m) return null;
  const [, org, id] = m;
  const { jobs } = await getJson<{ jobs: { id: string; title: string; location?: string; workplaceType?: string; publishedAt?: string; jobUrl: string; descriptionPlain?: string }[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`,
  );
  const j = jobs.find((x) => x.id === id);
  if (!j) throw new ManualEntryNeeded("That Ashby posting is no longer listed.");
  return {
    title: j.title.trim(),
    company: companyName(org),
    location: j.location ?? "",
    description: (j.descriptionPlain ?? "").trim(),
    url: j.jobUrl,
    remote: j.workplaceType === "Remote" || remoteIn(j.location),
    postedAt: j.publishedAt ?? null,
    externalKey: `ashby:${org}:${id}`,
    via: "ashby",
  };
}

// ------------------------------------------------------- schema.org JobPosting

interface LdJob {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: LdPlace | LdPlace[];
  jobLocationType?: string;
  applicantLocationRequirements?: unknown;
  url?: string;
}
interface LdPlace {
  address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string | { name?: string } } | string;
}

function findJobPosting(node: unknown): LdJob | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findJobPosting(n);
      if (f) return f;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return o as LdJob;
  return findJobPosting(o["@graph"]);
}

function placeText(p: LdPlace): string {
  if (typeof p.address === "string") return p.address;
  const a = p.address ?? {};
  const country = typeof a.addressCountry === "string" ? a.addressCountry : a.addressCountry?.name;
  return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(", ");
}

export function parseJsonLdJob(html: string, url: string): FetchedJob | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    const j = findJobPosting(data);
    if (!j?.title || !j.description) continue;
    const places = Array.isArray(j.jobLocation) ? j.jobLocation : j.jobLocation ? [j.jobLocation] : [];
    const remote = j.jobLocationType === "TELECOMMUTE";
    const location = places.map(placeText).filter(Boolean).join(" / ") || (remote ? "Remote" : "");
    const org = typeof j.hiringOrganization === "string" ? j.hiringOrganization : j.hiringOrganization?.name;
    return {
      title: decodeEntities(j.title).trim(),
      company: decodeEntities(org ?? "").trim() || new URL(url).hostname.replace(/^www\./, ""),
      location,
      description: htmlToText(j.description),
      url: j.url || url,
      remote: remote || remoteIn(location),
      postedAt: j.datePosted ?? null,
      externalKey: null,
      via: "structured-data",
    };
  }
  return null;
}

// ------------------------------------------------------------------- entry

export async function fetchJobFromUrl(raw: string): Promise<FetchedJob> {
  const u = new URL(raw.trim());
  const blocked = NO_FETCH.find((s) => s.re.test(u.hostname));
  if (blocked) {
    throw new ManualEntryNeeded(
      `${blocked.name} doesn't allow automated access, so Jobify can't read this link. Open the posting, copy the job details into the form below, and keep the link for applying.`,
    );
  }

  const ats = (await fromGreenhouse(u)) ?? (await fromLever(u)) ?? (await fromAshby(u));
  if (ats) return ats;

  let page: Awaited<ReturnType<typeof safeFetchText>>;
  try {
    page = await safeFetchText(u.toString());
  } catch (e) {
    // Bot protection / sign-in walls. We don't try to get around these; the user
    // pastes the posting from their own browser instead.
    const status = Number((e as Error).message.match(/HTTP (\d{3})/)?.[1]);
    if ([401, 403, 429, 999].includes(status)) {
      throw new ManualEntryNeeded(
        `${u.hostname.replace(/^www\./, "")} blocks automated reading. Open the posting in your browser, copy the whole page, and paste it below. Jobify will fill in the details.`,
      );
    }
    throw e;
  }
  const ld = parseJsonLdJob(page.text, page.url);
  if (ld && ld.description.length >= 80) return ld;

  const text = htmlToText(page.text.replace(/<(nav|header|footer|svg|noscript)[\s\S]*?<\/\1>/gi, " "));
  if (text.length < 300) {
    throw new ManualEntryNeeded(
      "This page loads its content with JavaScript, so Jobify couldn't read it. Open the posting in your browser, copy the whole page, and paste it below.",
    );
  }
  const ai = await extractJobFromPage(text.slice(0, 60_000), page.url);
  if (!ai.isJobPosting || ai.description.length < 80) {
    throw new ManualEntryNeeded("That page doesn't look like a single job posting. Open the posting in your browser, copy it, and paste it below.");
  }
  return {
    title: ai.title,
    company: ai.company,
    location: ai.location,
    description: ai.description,
    url: page.url,
    remote: ai.remote,
    postedAt: null,
    externalKey: null,
    via: "ai",
  };
}

/**
 * "Paste the posting": the user copied the page text from their own browser
 * (for sites that block automated reading). Claude extracts the fields and
 * copies the description verbatim.
 */
export async function jobFromPastedText(text: string, url: string): Promise<FetchedJob> {
  const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < 200) {
    throw new ManualEntryNeeded("That's too short to be a job posting. Copy the whole page (title, company and description) and paste it again.");
  }
  const ai = await extractJobFromPage(clean.slice(0, 60_000), url || "(pasted by the user; no URL)");
  if (!ai.isJobPosting || ai.description.length < 80) {
    throw new ManualEntryNeeded("That text doesn't look like a single job posting. Make sure you copied the posting itself, not a search results page.");
  }
  return {
    title: ai.title,
    company: ai.company,
    location: ai.location,
    description: ai.description,
    url,
    remote: ai.remote,
    postedAt: null,
    externalKey: null,
    via: "pasted",
  };
}
