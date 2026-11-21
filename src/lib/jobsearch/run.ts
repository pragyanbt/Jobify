import { prisma } from "../db";
import { parseJson } from "../json";
import { getProfile } from "../profile";
import { ensureAnalysis } from "../pipeline";
import { runAutoApply } from "../discovery";
import type { JobSearchSettings, JobSearchStatus, SourceReport } from "../types";
import { filterAndScore, normalizeTitle, type Scored } from "./match";
import { adzuna, adzunaConfigured, ashby, greenhouse, lever, remotive, type Listing } from "./sources";

// One job-search run: fetch every enabled source, keep recent postings whose
// title/location match the user's search, de-duplicate, and save them as
// "discovered" jobs. Claude analysis is NOT run here (it would cost money per
// job); it happens when the user opens a job — or for the top few matches when
// auto-apply is on.

const FETCH_CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

interface SourceTask {
  name: string;
  run: () => Promise<Listing[]>;
}

function tasksFor(s: JobSearchSettings): SourceTask[] {
  const t: SourceTask[] = [
    ...s.sources.greenhouse.map((b) => ({ name: `greenhouse:${b}`, run: () => greenhouse(b) })),
    ...s.sources.lever.map((c) => ({ name: `lever:${c}`, run: () => lever(c) })),
    ...s.sources.ashby.map((o) => ({ name: `ashby:${o}`, run: () => ashby(o) })),
  ];
  if (s.sources.remotive && s.includeRemote) t.push({ name: "remotive", run: () => remotive(s.keywords) });
  if (s.sources.adzuna && adzunaConfigured())
    t.push({ name: "adzuna", run: () => adzuna(s.keywords, s.locations, s.maxAgeDays) });
  return t;
}

// Shared via globalThis: in dev, each route bundle gets its own module copy.
const g = globalThis as unknown as { jobifySearches?: Map<string, Promise<JobSearchStatus>> };
const runs = (g.jobifySearches ??= new Map());

export async function getSearchStatus(userId: string): Promise<JobSearchStatus> {
  const row = await prisma.profile.findUnique({ where: { id: userId }, select: { jobSearchStatus: true } });
  return { ...parseJson<JobSearchStatus>(row?.jobSearchStatus, {}), running: runs.has(userId) };
}

async function saveStatus(userId: string, st: JobSearchStatus) {
  await prisma.profile.update({ where: { id: userId }, data: { jobSearchStatus: JSON.stringify(st) } });
}

/** Start a search (or join the one in progress). */
export function runJobSearch(userId: string): Promise<JobSearchStatus> {
  let run = runs.get(userId);
  if (!run) {
    run = doRun(userId).finally(() => runs.delete(userId));
    runs.set(userId, run);
  }
  return run;
}

async function doRun(userId: string): Promise<JobSearchStatus> {
  const started = Date.now();
  const { jobSearch: s, autoApply } = await getProfile(userId);
  if (s.keywords.length === 0) throw new Error("Add at least one target job title in Settings → Job search.");

  // 1. Fetch + filter per source.
  const tasks = tasksFor(s);
  const perSource = await mapLimit(tasks, FETCH_CONCURRENCY, async (task) => {
    const report: SourceReport = { source: task.name, fetched: 0, matched: 0, added: 0 };
    try {
      const listings = await task.run();
      report.fetched = listings.length;
      const scored = filterAndScore(listings, s);
      report.matched = scored.length;
      return { report, scored };
    } catch (e) {
      report.error = (e as Error).message;
      return { report, scored: [] as Scored[] };
    }
  });

  // 2. De-duplicate: within this run (same company + title → keep best),
  //    then against jobs already saved.
  const best = new Map<string, Scored & { report: SourceReport }>();
  for (const { report, scored } of perSource) {
    for (const sc of scored) {
      const key = `${sc.listing.company.toLowerCase()}|${normalizeTitle(sc.listing.title)}`;
      const prev = best.get(key);
      if (!prev || sc.relevance > prev.relevance) best.set(key, { ...sc, report });
    }
  }
  let candidates = [...best.values()];
  const existing = await prisma.job.findMany({
    where: {
      userId,
      OR: [
        { externalKey: { in: candidates.map((c) => c.listing.externalKey) } },
        { createdAt: { gte: new Date(Date.now() - 45 * 86_400_000) } },
      ],
    },
    select: { externalKey: true, company: true, title: true },
  });
  const seenKeys = new Set(existing.map((e) => e.externalKey).filter(Boolean));
  const seenTitles = new Set(existing.map((e) => `${e.company.toLowerCase()}|${normalizeTitle(e.title)}`));
  candidates = candidates.filter(
    (c) =>
      !seenKeys.has(c.listing.externalKey) &&
      !seenTitles.has(`${c.listing.company.toLowerCase()}|${normalizeTitle(c.listing.title)}`),
  );

  // 3. Newest first, capped.
  candidates.sort((a, b) => (b.listing.postedAt?.getTime() ?? 0) - (a.listing.postedAt?.getTime() ?? 0));
  candidates = candidates.slice(0, s.maxNewPerRun);

  // 4. Fetch full descriptions where needed, then save.
  const added: { id: string; relevance: number }[] = [];
  await mapLimit(candidates, FETCH_CONCURRENCY, async (c) => {
    const l = c.listing;
    let description = l.description ?? "";
    if (!description && l.hydrate) {
      try {
        description = await l.hydrate();
      } catch {
        return;
      }
    }
    if (description.length < 80) return;
    try {
      const job = await prisma.job.create({
        data: {
          userId,
          title: l.title,
          company: l.company,
          location: l.location,
          url: l.url,
          description: description.slice(0, 60_000),
          source: l.source,
          externalKey: l.externalKey,
          postedAt: l.postedAt,
          remote: l.remote,
          relevance: c.relevance,
          status: "discovered",
        },
      });
      c.report.added++;
      added.push({ id: job.id, relevance: c.relevance });
    } catch {
      /* unique race — already saved */
    }
  });

  const status: JobSearchStatus = {
    lastRunAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    added: added.length,
    reports: perSource.map((p) => p.report),
  };
  await saveStatus(userId, status);

  // 5. Auto-apply: analyze only the most relevant few, then let it run.
  if (autoApply.enabled && added.length) {
    const top = added.sort((a, b) => b.relevance - a.relevance).slice(0, Math.min(10, autoApply.dailyLimit));
    void (async () => {
      for (const j of top) await ensureAnalysis(userId, j.id).catch(() => undefined);
      await runAutoApply(userId).catch((e) => console.error("[jobify] auto-apply failed", e));
    })();
  }
  return status;
}
