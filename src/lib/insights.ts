import { prisma } from "./db";
import { parseJson } from "./json";
import type { JobAnalysis, MatchReport } from "./types";

// Continuous improvement (spec §8). Everything here is descriptive: it reports
// what co-occurred with outcomes and never claims a resume version caused an
// interview or a rejection. Small samples are labelled as such.

export const MIN_SAMPLE = 8;

const POSITIVE = new Set(["interview", "offer"]);
const RESOLVED = new Set(["interview", "offer", "rejected", "no_response"]);

export interface Insights {
  totals: { applications: number; resolved: number; positive: number };
  byScoreBucket: { bucket: string; n: number; positive: number }[];
  recurringGaps: { term: string; jobs: number }[];
  underusedFacts: { term: string; jobs: number }[];
  suggestions: { title: string; body: string; confidence: "low" | "moderate" }[];
  caveat: string;
}

export async function computeInsights(userId: string): Promise<Insights> {
  const apps = await prisma.application.findMany({
    where: { userId },
    include: { version: { include: { tailored: true } }, job: true },
  });

  const resolved = apps.filter((a) => RESOLVED.has(a.outcome));
  const positive = resolved.filter((a) => POSITIVE.has(a.outcome));

  const buckets = ["<50", "50–69", "70–84", "85+"];
  const bucketOf = (s: number) => (s < 50 ? 0 : s < 70 ? 1 : s < 85 ? 2 : 3);
  const byScoreBucket = buckets.map((bucket) => ({ bucket, n: 0, positive: 0 }));
  for (const a of resolved) {
    if (!a.version) continue; // applied externally: no tailored resume to score
    const m = parseJson<MatchReport | null>(a.version.tailored.match, null);
    if (!m) continue;
    const b = byScoreBucket[bucketOf(m.tailored.score)];
    b.n++;
    if (POSITIVE.has(a.outcome)) b.positive++;
  }

  // Requirements the user's materials couldn't support, across all analyzed jobs.
  const tailored = await prisma.tailoredResume.findMany({ where: { userId }, select: { match: true, jobId: true } });
  const gapCount = new Map<string, Set<string>>();
  const addedCount = new Map<string, Set<string>>();
  for (const t of tailored) {
    const m = parseJson<MatchReport | null>(t.match, null);
    if (!m) continue;
    for (const term of m.missing) (gapCount.get(term) ?? gapCount.set(term, new Set()).get(term)!).add(t.jobId);
    for (const term of m.added) (addedCount.get(term) ?? addedCount.set(term, new Set()).get(term)!).add(t.jobId);
  }
  const top = (m: Map<string, Set<string>>) =>
    [...m.entries()]
      .map(([term, s]) => ({ term, jobs: s.size }))
      .filter((x) => x.jobs >= 2)
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 12);
  const recurringGaps = top(gapCount);
  const underusedFacts = top(addedCount);

  const suggestions: Insights["suggestions"] = [];
  if (recurringGaps.length) {
    suggestions.push({
      title: "Requirements you keep running into",
      body:
        `Jobs you've targeted repeatedly ask for ${recurringGaps.slice(0, 5).map((g) => g.term).join(", ")}. ` +
        "If you genuinely have experience with any of these, add it as an approved profile fact so tailoring can use it. " +
        "If you don't, these are candidates for learning, not for your resume.",
      confidence: "moderate",
    });
  }
  if (underusedFacts.length) {
    suggestions.push({
      title: "Content your master resume under-emphasizes",
      body:
        `Tailoring frequently had to surface ${underusedFacts.slice(0, 5).map((g) => g.term).join(", ")} ` +
        "from your profile facts. Consider featuring these in your master resume directly.",
      confidence: "moderate",
    });
  }
  const enough = byScoreBucket.filter((b) => b.n >= MIN_SAMPLE);
  if (enough.length >= 2) {
    const rates = enough.map((b) => ({ ...b, rate: b.positive / b.n }));
    const best = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
    suggestions.push({
      title: "Match score vs. responses",
      body:
        `Applications in the ${best.bucket} match range had the highest interview/offer rate ` +
        `(${best.positive}/${best.n}). This is a correlation across different jobs; it doesn't show the resume caused the outcome.`,
      confidence: "low",
    });
  } else if (resolved.length > 0) {
    suggestions.push({
      title: "Not enough outcomes yet",
      body: `Record outcomes for at least ${MIN_SAMPLE} applications per score range before reading anything into response rates.`,
      confidence: "low",
    });
  }

  return {
    totals: { applications: apps.length, resolved: resolved.length, positive: positive.length },
    byScoreBucket,
    recurringGaps,
    underusedFacts,
    suggestions,
    caveat:
      "Hiring outcomes depend on many things a resume doesn't control (timing, referrals, internal candidates, budgets). " +
      "These figures show what happened alongside each resume version, not why.",
  };
}

export type { JobAnalysis };
