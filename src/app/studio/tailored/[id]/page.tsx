"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LatexEditor } from "@/components/LatexEditor";
import { PdfPreview } from "@/components/PdfPreview";
import { SideBySideDiff } from "@/components/SideBySideDiff";
import { Badge, Button, buttonClass, Card, ErrorNote, Loading, Notice, PageHeader, ScoreBar, ScorePill, Segmented, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { IconCheck, IconDownload, IconRefresh, IconX } from "@/components/icons";
import { api, useApi } from "@/lib/fetcher";
import { TAILOR_RUNNING } from "@/lib/jobs";
import type { ChangeRecord, MatchReport, PipelineStep, ValidationReport } from "@/lib/types";

interface Version {
  id: string;
  number: number;
  origin: string;
  note: string;
  compileOk: boolean;
  pageCount: number | null;
  hasPdf: boolean;
  createdAt: string;
  latex: string;
  compileLog: string;
  applications: { id: string; status: string }[];
}
interface Tailored {
  id: string;
  status: string;
  mode: string;
  steps: string;
  changes: string;
  match: string | null;
  validation: string | null;
  summary: string;
  error: string | null;
  masterSnapshot: string;
  job: { id: string; title: string; company: string; url: string };
  master: { id: string; name: string };
  versions: Version[];
  applications: { id: string; status: string; outcome: string; version: { number: number } }[];
}

type Tab = "preview" | "changes" | "match" | "compare" | "editor" | "versions";

export default function TailoredPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, error, reload } = useApi<Tailored>(`/api/tailored/${id}`, {
    poll: (d) => TAILOR_RUNNING.has(d.status),
    intervalMs: 1500,
  });
  const [tab, setTab] = useState<Tab>("preview");

  if (error) return <ErrorNote error={error} />;
  if (!t) return <Loading />;

  const steps = JSON.parse(t.steps) as PipelineStep[];
  const running = TAILOR_RUNNING.has(t.status);
  const latest = t.versions[0] ?? null;
  const match = t.match ? (JSON.parse(t.match) as MatchReport) : null;
  const validation = t.validation ? (JSON.parse(t.validation) as ValidationReport) : null;
  const changes = JSON.parse(t.changes) as ChangeRecord[];

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/jobs/${t.job.id}`, label: t.job.company }}
        title={t.job.title}
        badges={
          <>
            <StatusBadge status={t.status} />
            {t.mode === "auto" && <Badge>auto-apply</Badge>}
            {match && <ScorePill score={match.tailored.score} from={match.original.score} />}
          </>
        }
        description={
          <>
            From master “{t.master.name}” · {t.versions.length} version(s)
            {latest && ` · showing v${latest.number}`}
          </>
        }
      />
      {latest && !running && <ActionBar t={t} latest={latest} validation={validation} onDone={reload} />}

      <ErrorNote error={t.error} />
      <Workflow steps={steps} collapsed={!running && t.status !== "failed"} />
      {validation && !running && <ValidationPanel v={validation} />}

      {!running && latest && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "preview", label: "Preview" },
              { id: "changes", label: `Changes (${changes.filter((c) => c.status === "applied").length})` },
              { id: "match", label: "Match" },
              { id: "compare", label: "Compare" },
              { id: "editor", label: "Editor" },
              { id: "versions", label: `Versions (${t.versions.length})` },
            ]}
          />
          {tab === "preview" && <Preview t={t} latest={latest} />}
          {tab === "changes" && <Changes summary={t.summary} changes={changes} />}
          {tab === "match" && match && <MatchAnalysis m={match} />}
          {tab === "compare" && <Compare t={t} />}
          {tab === "editor" && <Editor t={t} latest={latest} onSaved={reload} />}
          {tab === "versions" && <Versions t={t} onChanged={reload} />}
        </>
      )}
    </div>
  );
}

function Preview({ t, latest }: { t: Tailored; latest: Version }) {
  const [side, setSide] = useState<"tailored" | "original">("tailored");
  return (
    <div className="space-y-3">
      <Segmented
        className="w-full lg:hidden"
        value={side}
        onChange={setSide}
        options={[["tailored", `Tailored v${latest.number}`], ["original", "Original"]] as const}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={side === "original" ? "" : "hidden lg:block"}>
          <PdfPreview src={`/api/tailored/${t.id}/original-pdf`} title="Original (master)" height="80vh" />
        </div>
        <div className={side === "tailored" ? "" : "hidden lg:block"}>
          <PdfPreview src={latest.hasPdf ? `/api/versions/${latest.id}/pdf` : null} title={`Tailored v${latest.number}`} height="80vh" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Workflow({ steps, collapsed }: { steps: PipelineStep[]; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => setOpen(!collapsed), [collapsed]);
  const done = steps.filter((s) => s.status === "done").length;
  const dot = (st: PipelineStep["status"]) => {
    if (st === "done") return <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white"><IconCheck className="size-3" strokeWidth={3} /></span>;
    if (st === "running") return <Spinner className="size-5 text-brand-600" />;
    if (st === "error") return <span className="grid size-5 place-items-center rounded-full bg-red-500 text-white"><IconX className="size-3" strokeWidth={3} /></span>;
    return <span className={`size-5 rounded-full border-2 ${st === "skipped" ? "border-slate-200 bg-slate-100" : "border-slate-200"}`} />;
  };
  return (
    <Card
      title="Tailoring workflow"
      description={`${done} of ${steps.length} steps complete`}
      actions={<Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</Button>}
      padded={open}
    >
      {open ? (
        <ol className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key} className="flex gap-3">
              <span className="mt-px shrink-0">{dot(s.status)}</span>
              <span className={s.status === "pending" ? "text-slate-400" : "text-slate-800"}>
                {s.label}
                {s.detail && <span className="block text-xs leading-relaxed text-slate-500 [overflow-wrap:anywhere]">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="h-1.5 bg-slate-100"><div className="h-1.5 bg-emerald-500" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} /></div>
      )}
    </Card>
  );
}

function ValidationPanel({ v }: { v: ValidationReport }) {
  if (v.issues.length === 0) {
    return (
      <Notice tone="success" title="Validation passed">
        The template is preserved, it compiles, and every skill and figure traces to your master resume or approved facts.
      </Notice>
    );
  }
  return (
    <Notice tone={v.ok ? "warning" : "error"} title={v.ok ? "Validation warnings" : "Validation errors: fix before approving"}>
      <ul className="mt-1 space-y-2">
        {v.issues.map((i, k) => (
          <li key={k} className="flex items-start gap-2">
            <span className="mt-px"><Badge tone={i.severity === "error" ? "red" : "amber"}>{i.severity}</Badge></span>
            <span className="text-slate-800">
              {i.message}
              {i.detail && <span className="block text-xs text-slate-600">{i.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

function ActionBar({ t, latest, validation, onDone }: {
  t: Tailored;
  latest: Version;
  validation: ValidationReport | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const app = t.applications[0];
  const approvedCurrent = t.status === "approved" && app?.version.number === latest.number;

  async function approve() {
    let override = false;
    if (validation && !validation.ok) {
      override = confirm(
        "Validation found errors. Approve only if every statement in this resume is accurate.\n\nI confirm this resume is truthful.",
      );
      if (!override) return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/tailored/${t.id}/approve`, { method: "POST", json: { override } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="primary" className="sm:order-last" onClick={approve} disabled={busy || !latest.compileOk || approvedCurrent}>
          {approvedCurrent ? <IconCheck /> : busy ? <Spinner /> : null}
          {approvedCurrent ? "Approved" : busy ? "Approving…" : `Approve v${latest.number}`}
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {latest.hasPdf ? (
            <a className={buttonClass("secondary")} href={`/api/versions/${latest.id}/pdf?download`}><IconDownload /> PDF</a>
          ) : <span />}
          <a className={buttonClass("secondary")} href={`/api/versions/${latest.id}/tex`}><IconDownload /> LaTeX</a>
        </div>
      </div>
      {app && (
        <Notice tone={app.status === "ready_manual" ? "info" : "neutral"}>
          <span className="inline-flex flex-wrap items-center gap-1.5">Application uses v{app.version.number} <StatusBadge status={app.status} /></span>
          {app.status === "ready_manual" && (
            <span className="block pt-1">
              Download the PDF and submit it on the{" "}
              {t.job.url ? <a className="font-medium underline" href={t.job.url} target="_blank" rel="noreferrer">employer&apos;s site</a> : "employer's site"}
              , then mark it submitted in <Link className="font-medium underline" href="/applications">Applications</Link>.
            </span>
          )}
        </Notice>
      )}
      <ErrorNote error={err} />
    </div>
  );
}

function Changes({ summary, changes }: { summary: string; changes: ChangeRecord[] }) {
  const applied = changes.filter((c) => c.status === "applied");
  const rejected = changes.filter((c) => c.status === "rejected");
  return (
    <div className="space-y-4">
      {summary && (
        <Card title="Summary of modifications">
          <p className="text-sm text-slate-700">{summary}</p>
        </Card>
      )}
      <div className="space-y-3">
        {applied.map((c, i) => <ChangeCard key={i} c={c} />)}
      </div>
      {rejected.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            {rejected.length} proposed edit(s) rejected or reverted by validation
          </summary>
          <div className="mt-3 space-y-3">{rejected.map((c, i) => <ChangeCard key={i} c={c} />)}</div>
        </details>
      )}
    </div>
  );
}

function ChangeCard({ c }: { c: ChangeRecord }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="indigo">{c.kind}</Badge>
        {c.status === "rejected" && <Badge tone="red">{c.rejectReason ?? "rejected"}</Badge>}
        <span className="text-slate-600">{c.reason}</span>
      </div>
      <SideBySideMini before={c.before} after={c.after} />
      {c.evidence && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-medium">Evidence:</span> {c.evidence}
        </p>
      )}
    </div>
  );
}

function SideBySideMini({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-red-700/80">Before</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-red-50/70 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{before}</pre>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">After</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-50/70 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{after}</pre>
      </div>
    </div>
  );
}

function MatchAnalysis({ m }: { m: MatchReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Match score">
        <div className="space-y-3">
          <ScoreBar label="Original resume" score={m.original.score} muted />
          <ScoreBar label="Tailored resume" score={m.tailored.score} />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Weighted share of the job&apos;s required skills (×3), preferred skills (×1.5) and ATS keywords (×1–3) found in
          the resume. It&apos;s an explainable estimate of job-description alignment, not a guarantee of ATS acceptance or
          hiring success.
        </p>
        <table className="mt-3 w-full text-xs">
          <thead className="text-slate-500"><tr><th className="text-left">Group</th><th>Original</th><th>Tailored</th></tr></thead>
          <tbody>
            {(["required", "preferred", "keyword"] as const).map((g) => (
              <tr key={g}>
                <td className="py-0.5 capitalize">{g}</td>
                <td className="text-center tabular-nums">{m.original.byGroup[g].matched}/{m.original.byGroup[g].total}</td>
                <td className="text-center tabular-nums">{m.tailored.byGroup[g].matched}/{m.tailored.byGroup[g].total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Skills & keywords">
        <Terms label="Matching" terms={m.matching} tone="green" />
        <Terms label="Added (surfaced from your resume or facts)" terms={m.added} tone="indigo" />
        <Terms label="Emphasized (mentioned more)" terms={m.emphasized} tone="indigo" />
        <Terms label="Missing (not in your resume or approved facts)" terms={m.missing} tone="red" />
        {m.missing.length > 0 && (
          <p className="text-xs text-slate-500">
            Jobify won&apos;t add these. If you genuinely have one, add it as an approved fact in Settings and re-tailor.
          </p>
        )}
      </Card>
      <Card title="Required qualifications — check yourself">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {m.requiredQualifications.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Degrees, years of experience and work authorization can&apos;t be verified by keyword matching.</p>
      </Card>
      <Card title="Term-by-term breakdown" className="lg:col-span-3">
        <div className="grid gap-x-6 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {m.tailored.hits.map((h) => {
            const o = m.original.hits.find((x) => x.term === h.term);
            return (
              <div key={h.term} className="flex justify-between border-b border-slate-100 py-1">
                <span>
                  <span className={h.matched ? "text-emerald-700" : "text-slate-400"}>{h.matched ? "●" : "○"}</span> {h.term}{" "}
                  <span className="text-slate-400">({h.group}, ×{h.weight})</span>
                </span>
                <span className="tabular-nums text-slate-500">{o?.count ?? 0} → {h.count}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Terms({ label, terms, tone }: { label: string; terms: string[]; tone: "green" | "indigo" | "red" }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      {terms.length ? (
        <div className="flex flex-wrap gap-1">{terms.map((t) => <Badge key={t} tone={tone}>{t}</Badge>)}</div>
      ) : (
        <span className="text-xs text-slate-400">none</span>
      )}
    </div>
  );
}

function Compare({ t }: { t: Tailored }) {
  const options = useMemo(
    () => [
      { id: "master", label: "Original (master)", latex: t.masterSnapshot },
      ...t.versions.map((v) => ({ id: v.id, label: `v${v.number} (${v.origin})`, latex: v.latex })),
    ],
    [t],
  );
  const [left, setLeft] = useState("master");
  const [right, setRight] = useState(t.versions[0]?.id ?? "master");
  const L = options.find((o) => o.id === left)!;
  const R = options.find((o) => o.id === right) ?? options[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm sm:flex">
        <select className="input sm:w-auto" value={left} onChange={(e) => setLeft(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <span className="text-slate-400">vs</span>
        <select className="input sm:w-auto" value={right} onChange={(e) => setRight(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <SideBySideDiff left={L.latex} right={R.latex} leftLabel={L.label} rightLabel={R.label} />
    </div>
  );
}

function Editor({ t, latest, onSaved }: { t: Tailored; latest: Version; onSaved: () => void }) {
  const [src, setSrc] = useState(latest.latex);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  useEffect(() => setSrc(latest.latex), [latest.id, latest.latex]);
  const dirty = src !== latest.latex;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const out = await api<{ compile: { ok: boolean; error?: { message: string; line?: number } } }>(`/api/tailored/${t.id}`, {
        method: "PUT",
        json: { latex: src, note: "Edited in LaTeX editor" },
      });
      if (!out.compile.ok) setErr(`Saved as a new version, but it didn't compile: ${out.compile.error?.message ?? ""}${out.compile.error?.line ? ` (line ${out.compile.error.line})` : ""}`);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-slate-500">Saving creates a new version, recompiles it, and re-runs validation. Earlier versions are kept.</p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button onClick={() => setSrc(latest.latex)} disabled={!dirty || busy}>Discard</Button>
          <Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy && <Spinner />}{busy ? "Compiling…" : "Save & compile"}</Button>
        </div>
      </div>
      <ErrorNote error={err} />
      <Segmented className="w-full lg:hidden" value={pane} onChange={setPane} options={[["edit", dirty ? "Edit •" : "Edit"], ["preview", "Preview"]] as const} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={pane === "edit" ? "" : "hidden lg:block"}>
          <LatexEditor value={src} onChange={setSrc} />
        </div>
        <div className={`space-y-2 ${pane === "preview" ? "" : "hidden lg:block"}`}>
          <PdfPreview src={latest.hasPdf ? `/api/versions/${latest.id}/pdf` : null} title={`v${latest.number} preview`} />
          {!latest.compileOk && (
            <details className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-red-700">Compile log</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{latest.compileLog.slice(-4000)}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function Versions({ t, onChanged }: { t: Tailored; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function restore(v: Version) {
    setBusy(v.id);
    setErr(null);
    try {
      await api(`/api/versions/${v.id}/restore`, { method: "POST" });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      <ErrorNote error={err} />
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {t.versions.map((v, i) => (
          <li key={v.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
            <div className="flex min-w-0 flex-1 gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold ${i === 0 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
                v{v.number}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{v.origin}</Badge>
                  {v.compileOk ? <span className="text-xs text-slate-500">{v.pageCount ?? "?"} page(s)</span> : <Badge tone="red">compile failed</Badge>}
                  {v.applications.length > 0 && <Badge tone="green">used in application</Badge>}
                </div>
                <div className="mt-1 text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</div>
                {v.note && <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{v.note}</div>}
              </div>
            </div>
            <div className="flex gap-2 pl-[3.25rem] sm:pl-0">
              {v.hasPdf && <a className={buttonClass("secondary", "sm")} href={`/api/versions/${v.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>}
              <a className={buttonClass("secondary", "sm")} href={`/api/versions/${v.id}/tex`}>.tex</a>
              {i > 0 && (
                <Button size="sm" disabled={!!busy} onClick={() => restore(v)}>
                  {busy === v.id ? <Spinner /> : <IconRefresh />}
                  {busy === v.id ? "Restoring…" : "Restore"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
