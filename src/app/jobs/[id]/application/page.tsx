"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, buttonClass, Card, Empty, ErrorNote, Loading, Notice, PageHeader, Spinner, StickyActionBar } from "@/components/ui";
import { IconCheck, IconDownload, IconExternal, IconFile, IconRefresh, IconSparkles } from "@/components/icons";
import { trackApply } from "@/lib/applyTracker";
import { api, useApi } from "@/lib/fetcher";
import { answerText, needsAttention, type AnswerSource, type DraftAnswer, type FormQuestion, type Section } from "@/lib/applicationTypes";
import type { PreparedDraft } from "@/lib/prepareApplication";

interface Job { id: string; title: string; company: string; url: string }

const SECTIONS: { id: Section; title: string; description?: string }[] = [
  { id: "details", title: "Your details" },
  { id: "eligibility", title: "Work eligibility" },
  { id: "questions", title: "Questions" },
  { id: "attachments", title: "Attachments" },
  { id: "consent", title: "Consent", description: "Jobify never agrees or opts in for you. Decide these on the employer's form." },
  { id: "self_id", title: "Voluntary self-identification", description: "Optional. Answered “decline” unless you opted in under Settings → Autopilot." },
];

const SOURCE: Record<AnswerSource, { label: string; tone: "green" | "indigo" | "amber" | "slate" | "red" }> = {
  profile: { label: "From your profile", tone: "green" },
  resume: { label: "From your resume", tone: "green" },
  drafted: { label: "Drafted by Junu · review", tone: "indigo" },
  attachment: { label: "Attachment", tone: "slate" },
  decline: { label: "Declined", tone: "slate" },
  self_id: { label: "Your choice", tone: "slate" },
  user: { label: "Edited by you", tone: "green" },
  needs_you: { label: "Needs your answer", tone: "amber" },
};

const hasValue = (a?: DraftAnswer) => !!a && (Array.isArray(a.value) ? a.value.length > 0 : a.value.trim() !== "");

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const job = useApi<Job>(`/api/jobs/${id}`);
  const draftApi = useApi<{ draft: PreparedDraft | null }>(`/api/jobs/${id}/application`);
  const draft = draftApi.data?.draft ?? null;
  const [answers, setAnswers] = useState<DraftAnswer[]>([]);
  const [busy, setBusy] = useState<"prepare" | "save" | "review" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { if (draft) setAnswers(draft.answers); }, [draft]);

  const byId = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers]);
  const dirty = !!draft && JSON.stringify(answers) !== JSON.stringify(draft.answers);

  async function prepare() {
    if (dirty && !confirm("Re-preparing replaces your edits. Continue?")) return;
    setBusy("prepare");
    setErr(null);
    try {
      const r = await api<{ draft: PreparedDraft }>(`/api/jobs/${id}/application`, { method: "POST" });
      draftApi.setData(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(status: "draft" | "reviewed") {
    setBusy(status === "reviewed" ? "review" : "save");
    setErr(null);
    try {
      const r = await api<{ draft: PreparedDraft }>(`/api/jobs/${id}/application`, { method: "PUT", json: { answers, status } });
      draftApi.setData(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function edit(q: FormQuestion, value: string | string[]) {
    setAnswers((all) => {
      const next = all.filter((a) => a.questionId !== q.id);
      const empty = Array.isArray(value) ? value.length === 0 : value.trim() === "";
      next.push({ questionId: q.id, value, source: empty ? "needs_you" : "user" });
      return draft!.questions.map((x) => next.find((a) => a.questionId === x.id)).filter((a): a is DraftAnswer => !!a);
    });
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setErr("Couldn't copy. Select the text and copy it manually.");
    }
  }

  if (job.error) return <ErrorNote error={job.error} />;
  if (!job.data || !draftApi.data) return <Loading />;
  const j = job.data;

  const header = (
    <PageHeader
      back={{ href: `/jobs/${j.id}`, label: j.title }}
      title="Prepare application"
      description={<>{j.title} at <b className="font-medium text-slate-700">{j.company}</b>. Junu fills in the form; you review it and submit on the employer&apos;s site.</>}
      badges={draft ? (
        <>
          <Badge tone={draft.formSource === "greenhouse" ? "green" : "slate"}>{draft.formSource === "greenhouse" ? "Employer's actual questions" : "Common questions"}</Badge>
          {draft.status === "reviewed" && !dirty ? <Badge tone="green" dot>Reviewed</Badge> : <Badge tone="amber" dot>Draft</Badge>}
        </>
      ) : undefined}
    />
  );

  if (!draft) {
    return (
      <div className="space-y-5">
        {header}
        <ErrorNote error={err} />
        <Empty
          icon={<IconSparkles />}
          title="Let Junu fill in this application"
          action={
            <Button variant="primary" onClick={prepare} disabled={!!busy}>
              {busy ? <Spinner /> : <IconSparkles />} {busy ? "Junu is filling in the form… (up to a minute)" : "Prepare application"}
            </Button>
          }
        >
          Junu answers from your application profile and your resume, and marks anything it can&apos;t answer truthfully for you to fill in.
          Nothing is submitted.
        </Empty>
      </div>
    );
  }

  const qs = draft.questions;
  const counts = { ready: 0, drafted: 0, needs: 0 };
  for (const q of qs) {
    const a = byId.get(q.id);
    if (!a || a.source === "needs_you") {
      if (needsAttention(q, a)) counts.needs++;
    }
    else if (a.source === "drafted") counts.drafted++;
    else counts.ready++;
  }
  const requiredMissing = qs.filter((q) => q.required && q.section !== "consent" && q.kind !== "file" && !hasValue(byId.get(q.id))).length;

  const allText = qs
    .filter((q) => q.kind !== "file")
    .map((q) => ({ q, t: answerText(q, byId.get(q.id)) }))
    .filter((x) => x.t)
    .map(({ q, t }) => `${q.label}\n${t}`)
    .join("\n\n");

  return (
    <div className="space-y-5 pb-24 sm:pb-0">
      {header}
      <ErrorNote error={err} />

      <div className="grid grid-cols-3 gap-3">
        <Count n={counts.ready} label="Ready" tone="text-neutral-950" />
        <Count n={counts.drafted} label="Drafted · review" tone="text-neutral-950" />
        <Count n={counts.needs} label="Need you" tone="text-neutral-950" />
      </div>

      {draft.formSource === "standard" && (
        <Notice tone="neutral">
          Jobify can&apos;t read this employer&apos;s exact form, so these are the questions most applications ask. Copy what matches the real form.
        </Notice>
      )}

      <Card title="Resume to attach" padded>
        {draft.resume ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500"><IconFile className="size-5" /></span>
              <div>
                <div className="text-sm font-medium text-slate-900">Tailored resume v{draft.resume.number}</div>
                <div className="mt-0.5">{draft.resume.approved ? <Badge tone="green" dot>Approved</Badge> : <Badge tone="amber" dot>Not approved yet</Badge>}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Link href={`/studio/tailored/${draft.resume.tailoredId}`} className={buttonClass("secondary", "sm")}>Review resume</Link>
              <a href={`/api/versions/${draft.resume.versionId}/pdf?download`} className={buttonClass("secondary", "sm")}><IconDownload /> PDF</a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">No tailored resume for this job yet, so answers are based on your master resume. Tailor one for a better match.</p>
            <Link href={`/jobs/${j.id}`} className={buttonClass("secondary", "sm")}><IconSparkles /> Tailor resume</Link>
          </div>
        )}
      </Card>

      {SECTIONS.map((s) => {
        const list = qs.filter((q) => q.section === s.id);
        if (!list.length) return null;
        return (
          <Card key={s.id} title={s.title} description={s.description} padded={false}>
            <ul className="divide-y divide-slate-100">
              {list.map((q) => {
                const a = byId.get(q.id);
                const src = SOURCE[a?.source ?? "needs_you"];
                const text = answerText(q, a);
                return (
                  <li key={q.id} className="space-y-2 px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm font-medium text-slate-800">
                        {q.label}{q.required && <span className="text-neutral-950"> *</span>}
                      </div>
                      <Badge tone={src.tone}>{src.label}</Badge>
                    </div>
                    {q.description && s.id !== "self_id" && (
                      <p className="line-clamp-3 text-xs leading-relaxed text-slate-500">{q.description}</p>
                    )}
                    <AnswerInput q={q} a={a} onChange={(v) => edit(q, v)} />
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs leading-relaxed text-slate-500">{a?.note}</p>
                      {text && q.kind !== "file" && (
                        <button onClick={() => copy(q.id, text)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
                          {copied === q.id ? "Copied ✓" : "Copy"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <StickyActionBar className="sm:static sm:rounded-2xl sm:border sm:p-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {requiredMissing > 0 && <p className="text-xs text-neutral-700 sm:mr-auto">{requiredMissing} required answer(s) still empty.</p>}
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
            <Button onClick={prepare} disabled={!!busy} title="Ask Junu to fill in the form again">
              {busy === "prepare" ? <Spinner /> : <IconRefresh />} Redo
            </Button>
            <Button onClick={() => copy("all", allText)} disabled={!allText}>{copied === "all" ? "Copied ✓" : "Copy all"}</Button>
            {dirty && <Button onClick={() => save("draft")} disabled={!!busy}>{busy === "save" && <Spinner />} Save</Button>}
            <Button variant={draft.status === "reviewed" && !dirty ? "secondary" : "primary"} onClick={() => save("reviewed")} disabled={!!busy || (draft.status === "reviewed" && !dirty)}>
              {busy === "review" ? <Spinner /> : <IconCheck />} {draft.status === "reviewed" && !dirty ? "Reviewed" : "Mark reviewed"}
            </Button>
            {j.url && (
              <a href={j.url} target="_blank" rel="noopener noreferrer" onClick={() => trackApply(j)} className={buttonClass(draft.status === "reviewed" && !dirty ? "primary" : "secondary", "md", "col-span-2")}>
                Open application form <IconExternal />
              </a>
            )}
          </div>
        </div>
      </StickyActionBar>
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3 sm:px-4">
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{n}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function AnswerInput({ q, a, onChange }: { q: FormQuestion; a: DraftAnswer | undefined; onChange: (v: string | string[]) => void }) {
  const v = a?.value ?? (q.kind === "multiselect" ? [] : "");
  if (q.kind === "file") {
    return a?.source === "attachment"
      ? <div className="flex items-center gap-2 text-sm text-slate-700"><IconFile className="size-4 text-slate-400" /> Attach the resume PDF above</div>
      : <div className="text-sm text-slate-500">{q.required ? "Upload on the employer's form." : "Optional."}</div>;
  }
  if (q.kind === "select") {
    return (
      <select className="input" value={Array.isArray(v) ? v[0] ?? "" : v} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {q.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (q.kind === "multiselect") {
    const sel = new Set(Array.isArray(v) ? v : v ? [v] : []);
    return (
      <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
        {q.options?.map((o) => {
          const on = sel.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => { const n = new Set(sel); if (on) n.delete(o.value); else n.add(o.value); onChange([...n]); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.kind === "textarea") {
    return <textarea className="input min-h-28" value={Array.isArray(v) ? v.join(", ") : v} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input className="input" value={Array.isArray(v) ? v.join(", ") : v} onChange={(e) => onChange(e.target.value)} />;
}
