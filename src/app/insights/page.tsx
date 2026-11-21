"use client";

import { Badge, Card, ErrorNote, Loading, PageHeader, Stat } from "@/components/ui";
import { IconCheck, IconSend, IconSparkles, IconStar } from "@/components/icons";
import { useApi } from "@/lib/fetcher";
import type { Insights } from "@/lib/insights";

export default function InsightsPage() {
  const { data, error } = useApi<Insights>("/api/insights");
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-5">
      <PageHeader title="Insights" description={<span className="block max-w-3xl">{data.caveat}</span>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Applications" value={data.totals.applications} icon={<IconSend />} />
        <Stat label="Outcome recorded" value={data.totals.resolved} icon={<IconCheck />} />
        <Stat label="Interviews / offers" value={data.totals.positive} icon={<IconStar />} />
      </div>

      <Card title="Suggestions">
        {data.suggestions.length === 0 ? (
          <p className="text-sm text-slate-500">Tailor a few resumes and record application outcomes to see suggestions.</p>
        ) : (
          <ul className="space-y-4">
            {data.suggestions.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><IconSparkles className="size-4" /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {s.title} <Badge tone={s.confidence === "low" ? "slate" : "indigo"}>{s.confidence} confidence</Badge>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Outcomes by match score">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-100"><th className="pb-2 text-left font-medium">Score</th><th className="pb-2 text-right font-medium">Resolved</th><th className="pb-2 text-right font-medium">Interview/offer</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.byScoreBucket.map((b) => (
                <tr key={b.bucket}>
                  <td className="py-2">{b.bucket}</td>
                  <td className="text-right tabular-nums">{b.n}</td>
                  <td className="text-right tabular-nums">{b.n ? `${b.positive} (${Math.round((b.positive / b.n) * 100)}%)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Correlation across different jobs, not causation. Rows with fewer than 8 outcomes are too small to read into.</p>
        </Card>
        <TermCard title="Requirements you couldn't evidence" items={data.recurringGaps} empty="None recurring yet." />
        <TermCard title="Facts tailoring often surfaced" items={data.underusedFacts} empty="None recurring yet." />
      </div>
    </div>
  );
}

function TermCard({ title, items, empty }: { title: string; items: { term: string; jobs: number }[]; empty: string }) {
  const max = Math.max(1, ...items.map((i) => i.jobs));
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {items.map((i) => (
            <li key={i.term}>
              <div className="flex justify-between gap-3">
                <span className="truncate text-slate-800">{i.term}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{i.jobs} jobs</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(i.jobs / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
