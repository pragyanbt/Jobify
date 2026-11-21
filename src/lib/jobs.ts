import { parseJson } from "./json";
import type { MatchReport } from "./types";

// Job rules shared by the dashboard, Top matches, the tailored-resume page and
// Junu's tools. Client-safe: no server imports.

/** Tailoring pipeline states that mean "still working". */
export const TAILOR_RUNNING = new Set(["queued", "analyzing", "tailoring", "compiling", "validating"]);

/** The slice of a job (from /api/jobs) these helpers need. */
export interface JobScoreFields {
  baseScore: number | null;
  tailored: { status: string; match: string | null }[];
  applications: { status: string }[];
}

export function isApplied(j: Pick<JobScoreFields, "applications">) {
  return j.applications.some((a) => a.status === "submitted");
}

/** Latest tailored resume's match report, if any. */
export function latestMatch(j: Pick<JobScoreFields, "tailored">): MatchReport | null {
  return parseJson<MatchReport | null>(j.tailored[0]?.match, null);
}

/** The score shown for a job: the latest tailored resume's, else the master resume's. */
export function bestScore(j: JobScoreFields): number | null {
  return latestMatch(j)?.tailored.score ?? j.baseScore;
}
