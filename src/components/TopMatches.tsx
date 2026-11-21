"use client";

import Link from "next/link";
import { trackApply } from "@/lib/applyTracker";
import { bestScore, isApplied, type JobScoreFields } from "@/lib/jobs";
import { IconExternal, IconFile, IconSparkles, IconStar } from "./icons";
import { openJunu } from "./Junu";
import { buttonClass, ScorePill } from "./ui";

/** Jobs scoring above this are "top matches". */
const TOP_MATCH_MIN = 70;

interface JobRow extends JobScoreFields {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  tailored: { id: string; status: string; match: string | null }[];
}

export interface TopMatch {
  job: JobRow;
  score: number;
  tailoredId: string | null;
}

/** Unapplied jobs whose match is above 70%, best first. */
export function topMatchesFrom(rows: JobRow[]): TopMatch[] {
  const matches: TopMatch[] = [];
  for (const j of rows) {
    if (isApplied(j)) continue;
    const score = bestScore(j);
    if (score == null || score <= TOP_MATCH_MIN) continue;
    const t = j.tailored[0];
    matches.push({ job: j, score, tailoredId: t && t.status !== "failed" ? t.id : null });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function Actions({ m }: { m: TopMatch }) {
  const j = m.job;
  return (
    <div className="mt-2 flex gap-1.5">
      {m.tailoredId ? (
        <Link href={`/studio/tailored/${m.tailoredId}`} className={buttonClass("secondary", "sm", "flex-1")}>
          <IconFile /> My resume
        </Link>
      ) : (
        <button onClick={() => openJunu({ prompt: `Tailor my resume for "${j.title}" at ${j.company} (job id ${j.id}).` })} className={buttonClass("primary", "sm", "flex-1")}>
          <IconSparkles /> Tailor
        </button>
      )}
      {j.url && (
        <a href={j.url} target="_blank" rel="noopener noreferrer" onClick={() => trackApply(j)} className={buttonClass("secondary", "sm", "flex-1")}>
          Apply <IconExternal />
        </a>
      )}
    </div>
  );
}

/** Horizontal strip of top matches, shown at the top of Home. */
export function TopMatchesStrip({ matches }: { matches: TopMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-1.5 px-4 pb-2.5 text-sm font-semibold text-slate-800">
        <IconStar className="size-3.5 fill-amber-400 text-amber-400" /> Top matches
        <span className="font-normal text-slate-500">· {matches.length} above {TOP_MATCH_MIN}%</span>
      </div>
      <ul className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-4">
        {matches.map((m) => (
          <li key={m.job.id} className="w-64 shrink-0 snap-start rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/jobs/${m.job.id}`} className="line-clamp-1 text-sm font-medium text-slate-900">{m.job.title}</Link>
              <ScorePill score={m.score} />
            </div>
            <div className="truncate text-xs text-slate-500">{m.job.company}{m.job.location && ` · ${m.job.location}`}</div>
            <Actions m={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}
