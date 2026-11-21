"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, buttonClass, Card, Empty, ErrorNote, Field, Notice, ScorePill, Segmented, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { IconBriefcase, IconClock, IconExternal, IconFile, IconLink, IconMapPin, IconPlus, IconSearch, IconSparkles, IconX } from "@/components/icons";
import { ImportLocalBanner } from "@/components/ImportLocalBanner";
import { topMatchesFrom, TopMatchesStrip } from "@/components/TopMatches";
import { api, useApi } from "@/lib/fetcher";
import { trackApply } from "@/lib/applyTracker";
import { isApplied, latestMatch, TAILOR_RUNNING } from "@/lib/jobs";
import { timeAgo } from "@/lib/time";
import type { JobSearchSettings, JobSearchStatus } from "@/lib/types";

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  status: string;
  baseScore: number | null;
  error: string | null;
  source: string;
  createdAt: string;
  postedAt: string | null;
  remote: boolean;
  relevance: number;
  tailored: { id: string; status: string; match: string | null }[];
  applications: { id: string; status: string; outcome: string }[];
}

interface SearchInfo {
  settings: JobSearchSettings;
  status: JobSearchStatus;
  adzunaConfigured: boolean;
}

const AGE_OPTIONS = [
  { v: 1, label: "Last 24 hours" },
  { v: 3, label: "Last 3 days" },
  { v: 7, label: "Last 7 days" },
  { v: 14, label: "Last 14 days" },
  { v: 0, label: "Any time" },
];

function sourceLabel(src: string): string {
  if (src === "manual") return "Added by you";
  if (src === "link") return "Added from link";
  if (src.startsWith("discovery:")) return src.slice(10);
  const [kind] = src.split(":");
  return { greenhouse: "Company site", lever: "Company site", ashby: "Company site", remotive: "Remotive", adzuna: "Adzuna" }[kind] ?? kind;
}

/** The jobs dashboard shown on Home: search status, filters, and the job list. */
export function JobsDashboard({ topSlot }: { topSlot?: React.ReactNode }) {
  const search = useApi<SearchInfo>("/api/job-search", { poll: (d) => !!d.status.running, intervalMs: 3000 });
  const running = !!search.data?.status.running;
  const jobs = useApi<JobRow[]>("/api/jobs", {
    poll: (d) => running || d.some((j) => j.status === "new" || j.status === "analyzing" || TAILOR_RUNNING.has(j.tailored[0]?.status ?? "")),
    intervalMs: 4000,
  });
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The sidebar search sends ?q=… here.
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);
  const [age, setAge] = useState(7);
  const [jobType, setJobType] = useState<"any" | "remote" | "onsite">("any");
  const [view, setView] = useState<View>("all");

  const [err, setErr] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<string | null>(null);

  async function tailor(jobId: string) {
    setErr(null);
    setTailoring(jobId);
    try {
      const { tailoredId } = await api<{ tailoredId: string }>(`/api/jobs/${jobId}/apply`, { method: "POST" });
      router.push(`/studio/tailored/${tailoredId}`);
    } catch (e) {
      setErr((e as Error).message);
      setTailoring(null);
    }
  }

  async function searchNow() {
    setErr(null);
    try {
      await api("/api/job-search/run", { method: "POST" });
      await search.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Search, job type and time frame apply to every tab; the tab then picks a status.
  const searched = useMemo(() => {
    const now = Date.now();
    const needle = q.trim().toLowerCase();
    return (jobs.data ?? []).filter((j) => {
      const when = new Date(j.postedAt ?? j.createdAt).getTime();
      // Applied jobs stay visible however old the posting is.
      if (age && now - when > age * 86_400_000 && !isApplied(j)) return false;
      if (jobType === "remote" && !j.remote) return false;
      if (jobType === "onsite" && j.remote) return false;
      if (needle && !`${j.title} ${j.company} ${j.location}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [jobs.data, q, age, jobType]);
  const counts = useMemo(() => {
    const c: Record<View, number> = { all: 0, new: 0, applied: 0, analyzed: 0 };
    for (const j of searched) {
      c.all++;
      c[jobStage(j)]++;
    }
    return c;
  }, [searched]);
  const filtered = view === "all" ? searched : searched.filter((j) => jobStage(j) === view);

  const topMatches = useMemo(() => topMatchesFrom(jobs.data ?? []), [jobs.data]);
  const topCount = topMatches.length;
  const newCount = useMemo(() => (jobs.data ?? []).filter((j) => jobStage(j) === "new").length, [jobs.data]);
  const headline = !jobs.data
    ? "Welcome back."
    : topCount
      ? `${topCount} strong ${topCount === 1 ? "match is" : "matches are"} waiting for you.`
      : newCount
        ? `${newCount} new ${newCount === 1 ? "job" : "jobs"} to look through.`
        : running
          ? "Looking for new jobs…"
          : "Nothing needs you today.";

  const st = search.data?.status;
  const settings = search.data?.settings;
  const errors = st?.reports?.filter((r) => r.error) ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium text-slate-500" suppressHydrationWarning>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[32px]">{headline}</h1>
          </div>
          <div className="flex shrink-0 gap-2.5 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button onClick={() => setOpen((o) => !o)}>
              {open ? <IconX /> : <IconPlus />} {open ? "Close" : "Add job"}
            </Button>
            <Button variant="primary" onClick={searchNow} disabled={running}>
              {running ? <Spinner /> : <IconSearch />} {running ? "Searching…" : "Find new jobs"}
            </Button>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-500">
          {settings ? (
            <>
              Searching for <b className="font-medium text-slate-700">{settings.keywords.join(", ") || "—"}</b>
              {settings.locations.length > 0 && <> in <b className="font-medium text-slate-700">{settings.locations.join(", ")}</b></>}
              {settings.includeRemote && <> {settings.locations.length ? "or" : "including"} <b className="font-medium text-slate-700">remote</b></>}
              {" · "}
              <Link href="/settings#job-search" className="link">Change</Link>
            </>
          ) : (
            "Recently posted jobs matching your search."
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500">
        {running ? (
          <span className="flex items-center gap-2 text-brand-700">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-brand-600" /></span>
            Searching {settings ? settings.sources.greenhouse.length + settings.sources.lever.length + settings.sources.ashby.length : ""} company career sites and job boards…
          </span>
        ) : st?.lastRunAt ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <IconClock className="size-3.5 text-slate-400" />
            Last search {timeAgo(st.lastRunAt)}: <b className="font-semibold text-slate-700">{st.added ?? 0} new</b> from {st.reports?.length ?? 0} sources
            {settings && settings.intervalHours > 0 && <span className="text-slate-400">· auto every {settings.intervalHours}h</span>}
          </span>
        ) : (
          <span>No search has run yet. Tap <b className="font-medium text-slate-700">Search now</b>.</span>
        )}
        {errors.length > 0 && !running && (
          <details className="w-full sm:w-auto">
            <summary className="cursor-pointer font-medium text-neutral-950">{errors.length} source(s) failed</summary>
            <ul className="mt-1 space-y-0.5 [overflow-wrap:anywhere]">
              {errors.map((r) => <li key={r.source}>{r.source}: {r.error}</li>)}
            </ul>
          </details>
        )}
      </div>

      {topSlot}
      <TopMatchesStrip matches={topMatches} />
      <ImportLocalBanner onImported={() => { void jobs.reload(); void search.reload(); }} />
      {open && <AddJob onAdded={(id) => { setOpen(false); router.push(`/jobs/${id}`); }} />}
      <ErrorNote error={err ?? jobs.error ?? search.error} />

      <div className="space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" type="search" placeholder="Search title, company, location" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:flex">
            <select className="input sm:w-40" value={jobType} onChange={(e) => setJobType(e.target.value as typeof jobType)} aria-label="Job type">
              <option value="any">All job types</option>
              <option value="remote">Remote</option>
              <option value="onsite">On-site / hybrid</option>
            </select>
            <select className="input sm:w-44" value={age} onChange={(e) => setAge(Number(e.target.value))} aria-label="Posted within">
              {AGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          tabs={TABS.map((t) => ({
            id: t.id,
            label: (
              <span className="flex items-center gap-1.5">
                {t.label}
                <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${view === t.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                  {counts[t.id]}
                </span>
              </span>
            ),
          }))}
        />
      </div>

      {!jobs.data && !jobs.error && <ListSkeleton />}
      {jobs.data && jobs.data.length === 0 && !running && (
        <Empty
          icon={<IconBriefcase />}
          title="No jobs yet"
          action={<Button variant="primary" onClick={searchNow}><IconSearch /> Search now</Button>}
        >
          Find recently posted jobs that match your search, or add one from a link.
        </Empty>
      )}
      {jobs.data && jobs.data.length > 0 && filtered.length === 0 && (
        view === "applied" && !q && jobType === "any" ? (
          <Empty icon={<IconBriefcase />} title="Nothing applied yet">
            Tap <b>Apply</b> on a job. When you come back, Jobify asks whether you applied and moves it here.
          </Empty>
        ) : (
          <Empty icon={<IconSearch />} title="No matches">Try a different search or loosen the filters.</Empty>
        )
      )}

      {filtered.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {filtered.map((j) => {
            const latest = j.tailored[0];
            const m = latestMatch(j);
            const status = j.applications[0] ? (
              <StatusBadge status={j.applications[0].status} />
            ) : latest ? (
              <StatusBadge status={latest.status} />
            ) : jobStage(j) === "new" ? (
              <Badge tone="indigo" dot>New</Badge>
            ) : (
              <StatusBadge status={j.status} />
            );
            const score = m ? <ScorePill score={m.tailored.score} from={m.original.score} /> : j.baseScore != null ? <ScorePill score={j.baseScore} /> : null;
            const applied = isApplied(j);
            const apply = j.url ? (
              <a
                href={j.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { if (!applied) trackApply(j); }}
                className={buttonClass(applied ? "ghost" : "secondary", "sm", "relative z-10")}
                title={applied ? "Open the posting" : `Open the ${j.company} application page`}
              >
                {applied ? "Posting" : "Apply"} <IconExternal />
              </a>
            ) : null;
            // Unapplied jobs: tailor a resume, or open the one already made.
            const tailorBtn = applied ? null : latest && latest.status !== "failed" ? (
              <Link href={`/studio/tailored/${latest.id}`} className={buttonClass("secondary", "sm", "relative z-10")}>
                {TAILOR_RUNNING.has(latest.status) ? <Spinner className="size-3.5" /> : <IconFile />}
                {TAILOR_RUNNING.has(latest.status) ? "Tailoring…" : "My resume"}
              </Link>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="relative z-10"
                disabled={tailoring !== null}
                onClick={() => tailor(j.id)}
                title="Create a resume tailored to this job"
              >
                {tailoring === j.id ? <Spinner className="size-3.5" /> : <IconSparkles />}
                {tailoring === j.id ? "Starting…" : "Tailor resume"}
              </Button>
            );
            return (
              <li key={j.id} className="relative px-4 py-5 transition hover:bg-slate-50/80 sm:px-5">
                <div className="flex gap-3.5">
                  <CompanyMark name={j.company} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${j.id}`} className="line-clamp-2 font-medium leading-snug text-slate-900 after:absolute after:inset-0 hover:text-brand-700">
                      {j.title}
                    </Link>
                    <div className="mt-1 truncate text-sm text-slate-600">{j.company}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                      {j.location && (
                        <span className="flex min-w-0 max-w-full items-center gap-1">
                          <IconMapPin className="size-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{j.location}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1" title={j.postedAt ? "Posted" : "Date found (source gives no posting date)"}>
                        <IconClock className="size-3.5 text-slate-400" />
                        {timeAgo(j.postedAt ?? j.createdAt)}{!j.postedAt && "*"}
                      </span>
                      <span className="hidden md:inline">{sourceLabel(j.source)}</span>
                      {j.remote && <Badge tone="indigo">Remote</Badge>}
                    </div>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                    <div className="flex items-center gap-2">{score}{status}</div>
                    <div className="flex items-center gap-2">{tailorBtn}{apply}</div>
                  </div>
                </div>
                <div className="mt-3.5 space-y-3 pl-[3.25rem] sm:hidden">
                  {(score || status) && <div className="flex flex-wrap items-center gap-2">{score}{status}</div>}
                  {(tailorBtn || apply) && <div className="grid grid-cols-2 gap-2.5 [&>*:only-child]:col-span-2">{tailorBtn}{apply}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        Sources: companies&apos; own career sites (via Greenhouse, Lever and Ashby), Remotive
        {search.data?.adzunaConfigured ? ", Adzuna" : ""}. Listings link back to the original posting. * = date found, when the source doesn&apos;t give a posting date.
      </p>
    </div>
  );
}

type View = "all" | "new" | "applied" | "analyzed";

const TABS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "applied", label: "Applied" },
  { id: "analyzed", label: "Analyzed" },
];

/** Which status tab a job belongs to. Applied wins; then analyzed; anything else is newly added. */
function jobStage(j: JobRow): Exclude<View, "all"> {
  if (isApplied(j)) return "applied";
  if (j.status === "analyzed") return "analyzed";
  return "new";
}

function CompanyMark({ name }: { name: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-semibold text-neutral-800">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3.5 p-4">
          <div className="size-10 animate-pulse rounded-xl bg-slate-100" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FetchedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  remote: boolean;
  postedAt: string | null;
  externalKey: string | null;
  via: "greenhouse" | "lever" | "ashby" | "structured-data" | "ai" | "pasted";
}
type Dup = { id: string; title: string };
type FromUrlResponse =
  | { job: FetchedJob; duplicate: Dup | null }
  | { duplicate: Dup }
  | { manual: true; url: string; error: string };

const VIA_LABEL: Record<FetchedJob["via"], string> = {
  greenhouse: "Read from the company's Greenhouse job board",
  lever: "Read from the company's Lever job board",
  ashby: "Read from the company's Ashby job board",
  "structured-data": "Read from the posting's structured job data",
  ai: "Extracted from the page by Claude. Double-check the details",
  pasted: "Extracted by Claude from the text you pasted. Double-check the details",
};

type Mode = "link" | "paste" | "details";

function AddJob({ onAdded }: { onAdded: (id: string) => void }) {
  const [mode, setMode] = useState<Mode>("link");
  const [link, setLink] = useState("");
  const [paste, setPaste] = useState({ text: "", url: "" });
  const [form, setForm] = useState({ title: "", company: "", location: "", url: "", description: "" });
  const [meta, setMeta] = useState<{ externalKey: string | null; postedAt: string | null; remote: boolean; via: FetchedJob["via"] } | null>(null);
  const [fetched, setFetched] = useState(false);
  const [busy, setBusy] = useState<"fetch" | "paste" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dup, setDup] = useState<Dup | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  function switchMode(m: Mode, keepNotice = false) {
    setMode(m);
    setError(null);
    setDup(null);
    setFetched(false);
    setMeta(null);
    if (!keepNotice) setNotice(null);
  }

  function fill(j: FetchedJob, duplicate: Dup | null) {
    setForm({ title: j.title, company: j.company, location: j.location, url: j.url, description: j.description });
    setMeta({ externalKey: j.externalKey, postedAt: j.postedAt, remote: j.remote, via: j.via });
    setDup(duplicate);
    setFetched(true);
  }

  async function readLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("fetch");
    setError(null);
    setNotice(null);
    setDup(null);
    try {
      const r = await api<FromUrlResponse>("/api/jobs/from-url", { method: "POST", json: { url: link.trim() } });
      if ("manual" in r) {
        // The site can't be read automatically: let the user paste the posting instead.
        setPaste({ text: "", url: r.url });
        setForm((f) => ({ ...f, url: r.url }));
        switchMode("paste", true);
        setNotice(r.error);
      } else if (!("job" in r)) {
        setDup(r.duplicate);
      } else {
        fill(r.job, r.duplicate);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function readPaste(e: React.FormEvent) {
    e.preventDefault();
    setBusy("paste");
    setError(null);
    setDup(null);
    try {
      const r = await api<{ job: FetchedJob; duplicate: Dup | null }>("/api/jobs/from-text", { method: "POST", json: paste });
      setNotice(null);
      fill(r.job, r.duplicate);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const fromLink = mode !== "details" && !!meta && !!form.url;
      const job = await api<{ id: string; duplicate?: boolean }>("/api/jobs", {
        method: "POST",
        json: { ...form, ...(meta ? { externalKey: meta.externalKey, postedAt: meta.postedAt, remote: meta.remote } : {}), fromLink },
      });
      onAdded(job.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const showForm = mode === "details" || fetched;

  return (
    <Card title="Add a job">
      <div className="space-y-4">
        <Segmented
          className="w-full sm:w-auto"
          value={mode}
          onChange={(m) => {
            if (m === "paste") setPaste((p) => ({ ...p, url: p.url || link.trim() }));
            if (m === "details") setForm((f) => ({ ...f, url: f.url || paste.url || link.trim() }));
            switchMode(m);
          }}
          options={[["link", "From link"], ["paste", "Paste text"], ["details", "Enter details"]] as const}
        />

        {mode === "link" && (
          <form onSubmit={readLink} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconLink className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                type="url"
                inputMode="url"
                placeholder="Paste a job posting link"
                value={link}
                onChange={(e) => { setLink(e.target.value); setFetched(false); setDup(null); setNotice(null); }}
                required
              />
            </div>
            <Button variant="primary" disabled={busy !== null || link.trim().length < 8}>
              {busy === "fetch" && <Spinner />}
              {busy === "fetch" ? "Reading…" : fetched ? "Read again" : "Get details"}
            </Button>
          </form>
        )}
        {mode === "link" && !fetched && !dup && (
          <p className="text-xs leading-relaxed text-slate-500">
            Works best with company career pages (Greenhouse, Lever, Ashby and most others). Some sites, including LinkedIn,
            Indeed and many large employers, block automated reading. For those, use <b className="font-medium">Paste text</b>.
          </p>
        )}

        {notice && <Notice tone="warning">{notice}</Notice>}

        {mode === "paste" && !fetched && (
          <form onSubmit={readPaste} className="space-y-3">
            <ol className="list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-slate-500">
              <li>Open the job posting in your browser.</li>
              <li>
                Select the whole page (<kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans">⌘A</kbd> on a Mac,{" "}
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans">Ctrl+A</kbd> on Windows; on a phone, press and hold, then Select All) and copy it.
              </li>
              <li>Paste it below. Extra menus and footers are fine; Claude picks out the posting.</li>
            </ol>
            <Field label="Posting text" hint={paste.text ? `${paste.text.length.toLocaleString()} characters` : undefined}>
              <textarea
                className="input min-h-48 text-sm"
                placeholder="Paste the job posting here"
                value={paste.text}
                onChange={(e) => setPaste({ ...paste, text: e.target.value })}
                required
              />
            </Field>
            <Field label="Posting link" hint="Optional. Kept so you can apply from Jobify.">
              <input className="input" type="url" inputMode="url" value={paste.url} onChange={(e) => setPaste({ ...paste, url: e.target.value })} placeholder="https://…" />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="primary" disabled={busy !== null || paste.text.trim().length < 200}>
                {busy === "paste" ? <Spinner /> : <IconSparkles />}
                {busy === "paste" ? "Reading…" : "Fill in details"}
              </Button>
              {paste.text.trim().length > 0 && paste.text.trim().length < 200 && (
                <span className="text-xs text-slate-500">Paste the whole posting (at least a few paragraphs).</span>
              )}
            </div>
          </form>
        )}

        {dup && (
          <Notice tone="warning">
            This job is already in your list: <Link className="font-medium underline" href={`/jobs/${dup.id}`}>{dup.title}</Link>
          </Notice>
        )}
        {fetched && meta && (
          <Notice
            tone="success"
            action={mode === "paste" ? <button className="text-xs font-medium underline" onClick={() => { setFetched(false); setMeta(null); }}>Paste again</button> : undefined}
          >
            {VIA_LABEL[meta.via]}. Review and edit below, then add.
          </Notice>
        )}

        {showForm && (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title"><input className="input" value={form.title} onChange={set("title")} required /></Field>
            <Field label="Company"><input className="input" value={form.company} onChange={set("company")} required /></Field>
            <Field label="Location"><input className="input" value={form.location} onChange={set("location")} placeholder="Optional" /></Field>
            <Field label="Posting URL"><input className="input" inputMode="url" value={form.url} onChange={set("url")} placeholder="Optional" /></Field>
            <Field label="Job description" hint={`${form.description.length.toLocaleString()} characters`} className="sm:col-span-2">
              <textarea
                className="input min-h-48 font-mono text-xs sm:text-xs"
                placeholder="Paste the complete job description"
                value={form.description}
                onChange={set("description")}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Button variant="primary" className="w-full sm:w-auto" disabled={busy !== null}>
                {busy === "save" && <Spinner />}
                {busy === "save" ? "Adding…" : "Add & analyze"}
              </Button>
            </div>
          </form>
        )}
        <ErrorNote error={error} />
      </div>
    </Card>
  );
}
