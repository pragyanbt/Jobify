"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, ScorePill, Segmented, Spinner, StatusBadge, Tabs } from "@/components/ui";
import { IconChevronRight, IconFile, IconPlus, IconSparkles, IconStar, IconUpload } from "@/components/icons";
import { api, useApi } from "@/lib/fetcher";
import type { MatchReport } from "@/lib/types";

interface Master {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: string;
  sourceFormat: string;
  _count: { tailored: number };
}
interface TailoredRow {
  id: string;
  status: string;
  mode: string;
  match: string | null;
  createdAt: string;
  job: { id: string; title: string; company: string };
  master: { name: string };
  _count: { versions: number };
}

export default function StudioPage() {
  const [tab, setTab] = useState<"master" | "tailored">("master");
  return (
    <div className="space-y-5">
      <PageHeader
        title="Resume Studio"
        description="Master resumes are never changed by tailoring. Every tailored resume is versioned and linked to its job."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "master", label: "Master resumes" },
          { id: "tailored", label: "Tailored resumes" },
        ]}
      />
      {tab === "master" ? <Masters /> : <Tailored />}
    </div>
  );
}

function Masters() {
  const { data, error, reload } = useApi<Master[]>("/api/masters");
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      <ErrorNote error={error} />
      {!adding && (data?.length ?? 0) > 0 && (
        <div className="flex justify-end">
          <Button variant="primary" className="w-full sm:w-auto" onClick={() => setAdding(true)}><IconPlus /> Add master resume</Button>
        </div>
      )}
      {adding && <AddMaster onCancel={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} />}
      {!data && !error && <div className="h-28 animate-pulse rounded-2xl bg-slate-200/50" />}
      {data && data.length === 0 && !adding && (
        <Empty
          icon={<IconFile />}
          title="Add your master resume"
          action={<Button variant="primary" onClick={() => setAdding(true)}><IconUpload /> Upload resume</Button>}
        >
          Upload a PDF, Word (.docx) or LaTeX (.tex) file. Jobify tailors copies of it for each job.
        </Empty>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((m) => (
          <Link
            key={m.id}
            href={`/studio/master/${m.id}`}
            className="group flex gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-brand-300 hover:shadow-md hover:shadow-brand-900/5"
          >
            <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 group-hover:text-brand-600">
              <IconFile className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-900">{m.name}</span>
                {m.isDefault && <IconStar className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Default" />}
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Badge>{m.sourceFormat === "latex" ? "LaTeX" : `from ${m.sourceFormat.toUpperCase()}`}</Badge>
                {m.isDefault && <Badge tone="indigo">default</Badge>}
              </span>
              <span className="mt-2 block text-xs text-slate-500">
                Updated {new Date(m.updatedAt).toLocaleDateString()} · {m._count.tailored} tailored
              </span>
            </span>
            <IconChevronRight className="mt-1 size-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}

const ACCEPT = ".pdf,.docx,.tex,.txt,.md";

function AddMaster({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"upload" | "latex" | "text">("upload");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ext = file?.name.split(".").pop()?.toLowerCase() ?? "";
  const converts = mode === "text" || (mode === "upload" && file && ext !== "tex");

  function pick(f: File | undefined | null) {
    if (!f) return;
    setError(null);
    if (f.size > 10 * 1024 * 1024) return setError("The file is larger than 10 MB.");
    if (!ACCEPT.split(",").some((e) => f.name.toLowerCase().endsWith(e))) {
      return setError("Upload a PDF, Word (.docx), LaTeX (.tex) or text file.");
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "upload") {
        if (!file) throw new Error("Choose a file first.");
        const fd = new FormData();
        fd.set("file", file);
        fd.set("name", name);
        const res = await fetch("/api/masters/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
      } else {
        await api("/api/masters", {
          method: "POST",
          json: mode === "latex" ? { name: name || "Master resume", latex: content } : { name: name || "Master resume", plainText: content },
        });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = mode === "upload" ? !!file : content.trim().length >= 20;

  return (
    <Card title="Add master resume" actions={<Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}>
      <div className="space-y-4">
        <Segmented
          className="w-full sm:w-auto"
          value={mode}
          onChange={setMode}
          options={[["upload", "Upload file"], ["latex", "Paste LaTeX"], ["text", "Paste text"]] as const}
        />
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Backend resume" />
        </Field>

        {mode === "upload" ? (
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center text-sm transition ${
              dragging ? "border-brand-400 bg-brand-50" : file ? "border-brand-300 bg-brand-50/40" : "border-slate-300 bg-slate-50 hover:bg-slate-100"
            }`}
          >
            <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <span className={`grid size-11 place-items-center rounded-full ${file ? "bg-brand-100 text-brand-700" : "bg-white text-slate-500 shadow-sm"}`}>
              {file ? <IconFile className="size-5" /> : <IconUpload className="size-5" />}
            </span>
            {file ? (
              <>
                <span className="max-w-full truncate font-medium text-slate-800">{file.name}</span>
                <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · tap to choose another file</span>
              </>
            ) : (
              <>
                <span className="font-medium text-slate-700"><span className="hidden sm:inline">Drop your resume here, or </span><span className="text-brand-700">choose a file</span></span>
                <span className="text-xs text-slate-500">PDF, Word (.docx), LaTeX (.tex) or text · up to 10 MB</span>
              </>
            )}
          </label>
        ) : (
          <textarea
            className="input min-h-64 font-mono text-xs sm:text-xs"
            placeholder={mode === "latex" ? "Paste your full .tex document (\\documentclass … \\end{document})" : "Paste your resume text"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          {mode === "upload" && ext === "tex"
            ? "LaTeX is used as-is, and tailoring preserves your exact template."
            : "PDF, Word and text resumes are transcribed by Claude into Jobify's ATS-friendly LaTeX template. Every figure is checked against your file, and anything that looks added or dropped is flagged for you to review. Uploading LaTeX keeps your own template."}
        </p>

        <ErrorNote error={error} />
        <Button variant="primary" className="w-full sm:w-auto" onClick={save} disabled={busy || !ready}>
          {busy && <Spinner />}
          {busy ? (converts ? "Converting… (up to a minute)" : "Saving…") : "Add resume"}
        </Button>
      </div>
    </Card>
  );
}

function Tailored() {
  const { data, error } = useApi<TailoredRow[]>("/api/tailored");
  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200/50" />;
  if (data.length === 0) {
    return (
      <Empty icon={<IconSparkles />} title="No tailored resumes yet">
        Open a job and tap <b>Tailor my resume</b>.
      </Empty>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {data.map((t) => {
        const m = t.match ? (JSON.parse(t.match) as MatchReport) : null;
        return (
          <li key={t.id}>
            <Link href={`/studio/tailored/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">{t.job.title}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {t.job.company} · {new Date(t.createdAt).toLocaleDateString()}
                  <span className="hidden sm:inline"> · from {t.master.name} · {t._count.versions} version(s)</span>
                  {t.mode === "auto" && " · auto"}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
                  <StatusBadge status={t.status} />
                  {m && <ScorePill score={m.tailored.score} from={m.original.score} />}
                </div>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
                {m && <ScorePill score={m.tailored.score} from={m.original.score} />}
                <StatusBadge status={t.status} />
              </div>
              <IconChevronRight className="size-4 shrink-0 text-slate-300" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
