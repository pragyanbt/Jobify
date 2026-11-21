"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/fetcher";
import { timeAgo } from "@/lib/time";
import { IconCheck, IconExternal, IconRefresh } from "./icons";
import { Badge, Button, buttonClass, Card, ErrorNote, Spinner } from "./ui";

interface Ext { connected: boolean; createdAt: string | null; lastUsedAt: string | null }
interface Row {
  id: string;
  jobId: string;
  submitStatus: "queued" | "submitting" | "submitted" | "needs_you" | "failed";
  submitNote: string;
  submittedAt: string | null;
  updatedAt: string;
  job: { title: string; company: string; url: string };
}

const STATUS: Record<Row["submitStatus"], { label: string; tone: "green" | "amber" | "red" | "indigo" | "slate" }> = {
  queued: { label: "Queued", tone: "indigo" },
  submitting: { label: "Submitting", tone: "indigo" },
  submitted: { label: "Submitted", tone: "green" },
  needs_you: { label: "Needs you", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};

/** Settings → Autopilot (when on): the Chrome extension that submits, and recent automatic applications. */
export function AutoSubmitCard() {
  const ext = useApi<Ext>("/api/extension/token");
  const subs = useApi<Row[]>("/api/autopilot/submissions");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setErr("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <Card title="Chrome extension" description="Junu submits applications from your own Chrome. Keep Chrome open while she works.">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-slate-900">Jobify Chrome extension</div>
            {ext.data && (ext.data.connected ? (
              <Badge tone="green" dot>{ext.data.lastUsedAt ? `Connected · active ${timeAgo(ext.data.lastUsedAt)}` : "Key created · waiting for the extension"}</Badge>
            ) : (
              <Badge>Not connected</Badge>
            ))}
          </div>

          {key ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-slate-600">Your extension key. Copy it now; it won&apos;t be shown again.</p>
              <div className="flex gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-xs">{key}</code>
                <Button size="sm" onClick={() => copy("key", key)}>{copied === "key" ? "Copied ✓" : "Copy"}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant={ext.data?.connected ? "secondary" : "primary"} disabled={!!busy}
                onClick={() => run("key", async () => { const r = await api<{ token: string }>("/api/extension/token", { method: "POST" }); setKey(r.token); await ext.reload(); })}>
                {busy === "key" && <Spinner />} {ext.data?.connected ? "Create a new key" : "Create extension key"}
              </Button>
              {ext.data?.connected && (
                <Button size="sm" variant="danger" disabled={!!busy}
                  onClick={() => { if (confirm("Disconnect the extension? Its key stops working.")) void run("revoke", async () => { await api("/api/extension/token", { method: "DELETE" }); await ext.reload(); }); }}>
                  Disconnect
                </Button>
              )}
            </div>
          )}

          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>In Chrome, open <code>chrome://extensions</code> and turn on <b>Developer mode</b>.</li>
            <li>Click <b>Load unpacked</b> and choose the <code>extension</code> folder inside your Jobify project.</li>
            <li>
              Open the Jobify Autopilot extension, enter this address{" "}
              <button className="font-mono text-xs text-brand-700 underline" onClick={() => copy("origin", origin)}>{origin || "…"}</button>
              {copied === "origin" && " ✓"} and your key, then click <b>Save</b>.
            </li>
            <li>Try <b>Test mode</b> first: it fills forms without clicking Submit, so you can check them.</li>
          </ol>
        </div>

        <ErrorNote error={err} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Recent automatic applications</div>
            <button className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800" onClick={() => void subs.reload()}>
              <IconRefresh className="size-3.5" /> Refresh
            </button>
          </div>
          {!subs.data ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ) : subs.data.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Nothing yet. Ready applications appear here as Junu works through them.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {subs.data.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/jobs/${r.jobId}`} className="truncate font-medium text-slate-900 hover:underline">{r.job.title}</Link>
                      <div className="text-xs text-slate-500">{r.job.company} · {timeAgo(r.submittedAt ?? r.updatedAt)}</div>
                    </div>
                    <Badge tone={STATUS[r.submitStatus]?.tone ?? "slate"} dot>{STATUS[r.submitStatus]?.label ?? r.submitStatus}</Badge>
                  </div>
                  {r.submitNote && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{r.submitNote}</p>}
                  {(r.submitStatus === "needs_you" || r.submitStatus === "failed") && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/jobs/${r.jobId}/application`} className={buttonClass("secondary", "sm")}>Review answers</Link>
                      {r.job.url && <a href={r.job.url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>Open posting <IconExternal /></a>}
                      <Button size="sm" disabled={!!busy}
                        onClick={() => run(r.id, async () => { await api("/api/autopilot/submissions", { method: "POST", json: { jobId: r.jobId } }); await subs.reload(); })}>
                        {busy === r.id ? <Spinner /> : <IconCheck />} Queue again
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
