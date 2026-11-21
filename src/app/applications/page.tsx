"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClass, Card, Empty, ErrorNote, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { IconCheck, IconDownload, IconExternal, IconSend, IconSparkles } from "@/components/icons";
import { api, useApi } from "@/lib/fetcher";
import { trackApply } from "@/lib/applyTracker";

interface App {
  id: string;
  status: string;
  outcome: string;
  channel: string;
  notes: string;
  reviewReason: string;
  submittedAt: string | null;
  createdAt: string;
  job: { id: string; title: string; company: string; url: string };
  version: { id: string; number: number; tailoredId: string; hasPdf: boolean } | null;
}

const OUTCOMES = ["pending", "no_response", "rejected", "interview", "offer"];

export default function ApplicationsPage() {
  const { data, error, reload } = useApi<App[]>("/api/applications");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, string>) {
    setErr(null);
    try {
      await api(`/api/applications/${id}`, { method: "PATCH", json: body });
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function runAuto() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await api<{ started: number; skipped: string }>("/api/auto-apply", { method: "POST" });
      setMsg(r.skipped || `Auto-apply tailored ${r.started} job(s).`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const queue = data?.filter((a) => a.status === "awaiting_approval") ?? [];
  const rest = data?.filter((a) => a.status !== "awaiting_approval") ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Applications"
        description="Each application records the exact resume version used."
        actions={<Button onClick={runAuto} disabled={busy}>{busy ? <Spinner /> : <IconSparkles />}{busy ? "Running…" : "Run auto-apply"}</Button>}
      />
      <ErrorNote error={error ?? err} />
      {msg && <Notice tone="neutral">{msg}</Notice>}

      {data && (
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="To review" value={queue.length} tone={queue.length ? "amber" : undefined} />
          <MiniStat label="Ready to submit" value={rest.filter((a) => a.status === "ready_manual").length} />
          <MiniStat label="Applied" value={rest.filter((a) => a.status === "submitted").length} />
        </div>
      )}

      {queue.length > 0 && (
        <Card title="Needs your approval" description="Review these tailored resumes before they're used." padded={false}>
          <ul className="divide-y divide-slate-100">
            {queue.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{a.job.title}</div>
                  <div className="truncate text-sm text-slate-600">{a.job.company}</div>
                  <div className="mt-1 text-xs text-amber-700">{a.reviewReason || "Pending approval"}</div>
                </div>
                {a.version && (
                  <Link href={`/studio/tailored/${a.version.tailoredId}`} className={buttonClass("primary", "md", "w-full sm:w-auto")}>
                    Review v{a.version.number}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!data && !error && <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />}
      {data && data.length === 0 && (
        <Empty icon={<IconSend />} title="No applications yet">
          Approve a tailored resume and it shows up here, ready to submit.
        </Empty>
      )}
      {rest.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {rest.map((a) => (
            <li key={a.id} className="px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/jobs/${a.job.id}`} className="line-clamp-2 font-medium leading-snug text-slate-900 hover:text-brand-700">{a.job.title}</Link>
                  <div className="mt-0.5 truncate text-sm text-slate-600">{a.job.company}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {a.version ? (
                      <>
                        <Link className="link" href={`/studio/tailored/${a.version.tailoredId}`}>Resume v{a.version.number}</Link>
                        {a.version.hasPdf && (
                          <a className="link inline-flex items-center gap-1" href={`/api/versions/${a.version.id}/pdf?download`}><IconDownload className="size-3.5" />PDF</a>
                        )}
                      </>
                    ) : (
                      <span>Applied on the employer&apos;s site</span>
                    )}
                    {a.submittedAt && <span>· Submitted {new Date(a.submittedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Outcome
                  <select
                    className="input h-8 w-auto py-0 text-[13px] sm:text-[13px]"
                    value={a.outcome}
                    onChange={(e) => patch(a.id, { outcome: e.target.value })}
                  >
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
                  </select>
                </label>
                <div className="ml-auto flex flex-wrap gap-2">
                  {a.status === "ready_manual" && a.job.url && (
                    <a className={buttonClass("secondary", "sm")} href={a.job.url} target="_blank" rel="noreferrer" onClick={() => trackApply(a.job)}>Posting <IconExternal /></a>
                  )}
                  {a.status === "ready_manual" && (
                    <Button size="sm" variant="primary" onClick={() => patch(a.id, { status: "submitted" })}><IconCheck /> Mark submitted</Button>
                  )}
                  {a.status !== "withdrawn" && (
                    <Button size="sm" variant="ghost" onClick={() => patch(a.id, { status: "withdrawn" })}>Withdraw</Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "amber" }) {
  return (
    <div className={`rounded-2xl border bg-white px-3 py-3 sm:px-4 ${tone === "amber" ? "border-amber-200" : "border-slate-200/80"}`}>
      <div className={`text-2xl font-semibold tabular-nums ${tone === "amber" ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      <div className="mt-0.5 text-xs leading-tight text-slate-500">{label}</div>
    </div>
  );
}
