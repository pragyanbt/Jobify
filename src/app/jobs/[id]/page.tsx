"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, buttonClass, Card, ErrorNote, Loading, PageHeader, ScoreBar, ScorePill, Spinner, StatusBadge } from "@/components/ui";
import { IconChevronRight, IconClock, IconExternal, IconMapPin, IconRefresh, IconSend, IconSparkles } from "@/components/icons";
import { api, useApi } from "@/lib/fetcher";
import type { JobAnalysis, MatchReport } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { trackApply } from "@/lib/applyTracker";

interface JobDetail {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  status: string;
  error: string | null;
  analysis: string | null;
  baseScore: number | null;
  postedAt: string | null;
  remote: boolean;
  source: string;
  tailored: { id: string; status: string; match: string | null; createdAt: string; mode: string; error: string | null }[];
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: job, error, reload } = useApi<JobDetail>(`/api/jobs/${id}`, {
    poll: (j) => j.status === "new" || j.status === "analyzing",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function apply() {
    setBusy("apply");
    setActionError(null);
    try {
      const { tailoredId } = await api<{ tailoredId: string }>(`/api/jobs/${id}/apply`, { method: "POST" });
      router.push(`/studio/tailored/${tailoredId}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(null);
    }
  }

  async function reanalyze() {
    setBusy("analyze");
    setActionError(null);
    try {
      await api(`/api/jobs/${id}/analyze`, { method: "POST" });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorNote error={error} />;
  if (!job) return <Loading />;
  const a = job.analysis ? (JSON.parse(job.analysis) as JobAnalysis) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/home", label: "Home" }}
        title={job.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-slate-700">{job.company}</span>
            {job.location && <span className="flex items-center gap-1"><IconMapPin className="size-3.5" />{job.location}</span>}
            {job.postedAt && <span className="flex items-center gap-1"><IconClock className="size-3.5" />Posted {timeAgo(job.postedAt)}</span>}
            {job.remote && <Badge tone="indigo">Remote</Badge>}
          </span>
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="primary" onClick={apply} disabled={!!busy || job.status === "analyzing"} className="sm:order-last">
          {busy === "apply" ? <Spinner /> : <IconSparkles />}
          {busy === "apply" ? "Starting…" : "Tailor my resume"}
        </Button>
        <Link href={`/jobs/${job.id}/application`} className={buttonClass("secondary", "md", "sm:order-last")}>
          <IconSend /> Prepare application
        </Link>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button onClick={reanalyze} disabled={!!busy}>
            {busy === "analyze" ? <Spinner /> : <IconRefresh />}
            {busy === "analyze" ? "Analyzing…" : a ? "Re-analyze" : "Analyze"}
          </Button>
          {job.url ? (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")} onClick={() => trackApply(job)}>
              Apply on site <IconExternal />
            </a>
          ) : <span />}
        </div>
      </div>
      <ErrorNote error={actionError ?? job.error} />

      {!a && job.status === "discovered" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Not analyzed yet" className="lg:col-span-1">
            <p className="text-sm leading-relaxed text-slate-600">
              Jobify found this posting automatically. Tap <b>Analyze</b> to extract its requirements and see how your
              resume matches, or <b>Tailor my resume</b> to analyze and tailor in one step.
            </p>
          </Card>
          <Card title="Job description" className="lg:col-span-2">
            <Description text={job.description} />
          </Card>
        </div>
      )}
      {!a && job.status !== "discovered" && (
        <Card>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {job.status === "error" ? <StatusBadge status="error" /> : <Spinner className="text-brand-600" />}
            {job.status === "error" ? "Analysis failed. Try again." : "Analyzing the job description with Claude…"}
          </div>
        </Card>
      )}

      {a && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:order-last">
            <Card title="Your fit">
              <div className="flex items-end gap-3">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {job.baseScore != null ? `${job.baseScore.toFixed(0)}%` : "—"}
                </p>
                <span className="pb-1.5 text-sm text-slate-500">keyword alignment</span>
              </div>
              {job.baseScore != null && <div className="mt-3"><ScoreBar label="Best master resume" score={job.baseScore} /></div>}
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                How well your best master resume covers this job&apos;s terms. An estimate of alignment, not a prediction
                of ATS acceptance or hiring outcome.
              </p>
            </Card>
            <Card title="Tailored resumes" padded={job.tailored.length === 0}>
              {job.tailored.length === 0 ? (
                <p className="text-sm text-slate-500">None yet. Tap <b>Tailor my resume</b> to create one.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {job.tailored.map((t) => {
                    const m = t.match ? (JSON.parse(t.match) as MatchReport) : null;
                    return (
                      <li key={t.id}>
                        <Link href={`/studio/tailored/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                          <span className="min-w-0">
                            <span className="block text-slate-800">{new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                            <span className="mt-1 flex flex-wrap gap-1.5"><StatusBadge status={t.status} />{t.mode === "auto" && <Badge>auto</Badge>}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            {m && <ScorePill score={m.tailored.score} />}
                            <IconChevronRight className="size-4 text-slate-400" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-5 lg:col-span-2">
            <Card title="Role summary" actions={<Badge tone="indigo">{a.seniority}</Badge>}>
              <p className="text-sm leading-relaxed text-slate-700">{a.summary}</p>
              {a.minYearsExperience != null && (
                <p className="mt-3 text-xs text-slate-500">Minimum experience: {a.minYearsExperience}+ years</p>
              )}
            </Card>
            <Card title="Skills & keywords">
              <TermList label="Required" terms={a.requiredSkills.map((t) => t.name)} tone="indigo" />
              <TermList label="Preferred" terms={a.preferredSkills.map((t) => t.name)} tone="slate" />
              <TermList label="ATS keywords" terms={a.atsKeywords.map((t) => t.name)} tone="slate" />
            </Card>
            <Card title="Qualifications">
              <ul className="space-y-2.5 text-sm">
                {a.qualifications.map((q, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-px"><Badge tone={q.required ? "amber" : "slate"}>{q.required ? "required" : "preferred"}</Badge></span>
                    <span className="leading-relaxed text-slate-700">{q.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Responsibilities">
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 marker:text-slate-300">
                {a.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Card>
            <Card title="Full description">
              <Description text={job.description} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 1200;
  return (
    <div>
      <div className={`relative whitespace-pre-wrap text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] ${long && !open ? "max-h-72 overflow-hidden" : ""}`}>
        {text}
        {long && !open && <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />}
      </div>
      {long && (
        <button className="link mt-2 text-sm" onClick={() => setOpen((o) => !o)}>{open ? "Show less" : "Show full description"}</button>
      )}
    </div>
  );
}

function TermList({ label, terms, tone }: { label: string; terms: string[]; tone: "indigo" | "slate" }) {
  if (!terms.length) return null;
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {terms.map((t) => <Badge key={t} tone={tone}>{t}</Badge>)}
      </div>
    </div>
  );
}
