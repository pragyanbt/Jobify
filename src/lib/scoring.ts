import type {
  AnalyzedTerm,
  JobAnalysis,
  MatchReport,
  ScoreBreakdown,
  TermHit,
} from "./types";

// Deterministic, explainable match scoring. A score is the weighted share of
// the job's extracted terms that appear in the resume text:
//   required skill = 3, preferred skill = 1.5, ATS keyword = its importance (1-3)
// Terms appearing in more than one group are counted once, in the heaviest group.
// It estimates job-description alignment only — not ATS acceptance or hiring odds.

const WEIGHTS = { required: 3, preferred: 1.5 } as const;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count whole-term occurrences of any of the term's surface forms. */
export function countTerm(text: string, term: AnalyzedTerm): number {
  const hay = normalize(text);
  const forms = [term.name, ...term.aliases]
    .map((f) => normalize(f).trim())
    .filter((f) => f.length > 0);
  let total = 0;
  for (const f of new Set(forms)) {
    const re = new RegExp(`(?<![a-z0-9+#])${escapeRe(f)}(?![a-z0-9+#])`, "g");
    total += (hay.match(re) ?? []).length;
  }
  return total;
}

interface WeightedTerm {
  term: AnalyzedTerm;
  group: TermHit["group"];
  weight: number;
}

export function weightedTerms(a: JobAnalysis): WeightedTerm[] {
  const seen = new Set<string>();
  const out: WeightedTerm[] = [];
  const push = (t: AnalyzedTerm, group: TermHit["group"], weight: number) => {
    const key = normalize(t.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ term: t, group, weight });
  };
  a.requiredSkills.forEach((t) => push(t, "required", WEIGHTS.required));
  a.preferredSkills.forEach((t) => push(t, "preferred", WEIGHTS.preferred));
  a.atsKeywords.forEach((t) => push(t, "keyword", t.importance));
  return out;
}

export function scoreText(text: string, analysis: JobAnalysis): ScoreBreakdown {
  const terms = weightedTerms(analysis);
  const hits: TermHit[] = terms.map(({ term, group, weight }) => {
    const count = countTerm(text, term);
    return { term: term.name, group, weight, matched: count > 0, count };
  });
  const total = hits.reduce((s, h) => s + h.weight, 0);
  const got = hits.filter((h) => h.matched).reduce((s, h) => s + h.weight, 0);
  const byGroup = {
    required: { matched: 0, total: 0 },
    preferred: { matched: 0, total: 0 },
    keyword: { matched: 0, total: 0 },
  };
  for (const h of hits) {
    byGroup[h.group].total++;
    if (h.matched) byGroup[h.group].matched++;
  }
  return { score: total ? Math.round((got / total) * 1000) / 10 : 0, hits, byGroup };
}

export function buildMatchReport(
  originalText: string,
  tailoredText: string,
  evidenceText: string,
  analysis: JobAnalysis,
): MatchReport {
  const original = scoreText(originalText, analysis);
  const tailored = scoreText(tailoredText, analysis);
  const evidence = scoreText(evidenceText, analysis);
  const byTerm = (b: ScoreBreakdown) => new Map(b.hits.map((h) => [h.term, h]));
  const o = byTerm(original);
  const ev = byTerm(evidence);

  const matching = tailored.hits.filter((h) => h.matched).map((h) => h.term);
  // "Missing" = not demonstrable from anything the user has told us.
  const missing = tailored.hits
    .filter((h) => !h.matched && !ev.get(h.term)?.matched && h.group !== "keyword")
    .map((h) => h.term);
  const added = tailored.hits.filter((h) => h.matched && !o.get(h.term)?.matched).map((h) => h.term);
  const emphasized = tailored.hits
    .filter((h) => o.get(h.term)?.matched && h.count > (o.get(h.term)?.count ?? 0))
    .map((h) => h.term);

  return {
    original,
    tailored,
    matching,
    missing,
    added,
    emphasized,
    requiredQualifications: analysis.qualifications.filter((q) => q.required).map((q) => q.text),
  };
}
