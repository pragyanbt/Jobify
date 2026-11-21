"use client";

import Link from "next/link";
import { useState } from "react";
import { api, REFRESH_EVENT, useApi } from "@/lib/fetcher";
import { timeAgo } from "@/lib/time";
import { IconCheck, IconExternal, IconInbox, IconRefresh, IconSparkles, IconX } from "./icons";
import { openJunu } from "./Junu";
import { buttonClass, cx, Spinner, useMediaQuery } from "./ui";

interface Update {
  id: string;
  messageId: string;
  threadId: string;
  receivedAt: string;
  kind: string;
  via: string;
  company: string;
  jobTitle: string;
  summary: string;
  fromName: string;
  jobId: string | null;
  applicationId: string | null;
  suggestedOutcome: string | null;
  status: string;
}
interface Integrations {
  google: { configured: boolean; connected: boolean; lastSyncAt?: string | null; lastError?: string | null };
}

const KIND: Record<string, { label: string; mark: string }> = {
  interview: { label: "Interview request", mark: "In" },
  offer: { label: "Offer", mark: "Of" },
  assessment: { label: "Assessment", mark: "As" },
  recruiter: { label: "Recruiter message", mark: "Re" },
  viewed: { label: "Application viewed", mark: "Vi" },
  application_received: { label: "Application received", mark: "Ap" },
  rejection: { label: "Not moving forward", mark: "No" },
  other: { label: "Update", mark: "Up" },
};
const OUTCOME_LABEL: Record<string, string> = { interview: "Interview", offer: "Offer", rejected: "Rejected" };
const REPLYABLE = new Set(["interview", "offer", "assessment", "recruiter"]);

/** Application updates found in Gmail. */
export function UpdatesPanel({ compact = false }: { compact?: boolean }) {
  const integ = useApi<Integrations>("/api/integrations");
  const connected = !!integ.data?.google.connected;
  const updates = useApi<Update[]>(connected ? "/api/inbox/updates" : null);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function sync() {
    setSyncing(true);
    setErr(null);
    try {
      await api("/api/inbox/sync", { method: "POST" });
      await Promise.all([updates.reload(), integ.reload()]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function act(u: Update, action: "dismiss" | "record_outcome" | "mark_applied") {
    setBusyId(u.id);
    setErr(null);
    try {
      await api(`/api/inbox/updates/${u.id}`, { method: "PATCH", json: { action } });
      await updates.reload();
      if (action !== "dismiss") window.dispatchEvent(new Event(REFRESH_EVENT));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const g = integ.data?.google;
  const list = updates.data ?? [];
  const fresh = list.filter((u) => u.status === "new").length;
  const shown = compact && !showAll ? list.slice(0, 3) : list;

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <h2 className="flex-1 text-[17px] font-semibold text-slate-900">
          Updates {fresh > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-white">{fresh} new</span>}
        </h2>
        {connected && (
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60" title="Check Gmail now">
            {syncing ? <Spinner className="size-3" /> : <IconRefresh className="size-3.5" />} Check
          </button>
        )}
      </div>
      {connected && (
        <p className="px-5 text-xs text-slate-400">
          From Gmail{g?.lastSyncAt ? ` · checked ${timeAgo(g.lastSyncAt)}` : " · first check running…"}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {err && <p className="mx-2 mb-2 rounded-lg border border-neutral-950 px-3 py-2 text-xs text-neutral-950">{err}</p>}
        {connected && g?.lastError && !err && <p className="mx-2 mb-2 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-800">{g.lastError}</p>}

        {!integ.data ? (
          <div className="space-y-2 p-2">{[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : !connected ? (
          <div className="mx-2 mb-2 mt-1 rounded-2xl bg-slate-50 p-4 text-center">
            <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-white text-slate-400 shadow-sm"><IconInbox className="size-5" /></div>
            <p className="text-sm font-medium text-slate-800">See interview invites and replies here</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Connect Gmail (read-only) and Junu will pick up replies from employers.</p>
            <Link href="/settings#connections" className={buttonClass("primary", "sm", "mt-3")}>Connect Gmail</Link>
          </div>
        ) : !updates.data ? (
          <div className="space-y-2 p-2">{[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        ) : list.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">No application emails in the last 30 days.</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((u) => {
              const k = KIND[u.kind] ?? KIND.other;
              const busy = busyId === u.id;
              const done = u.status === "done";
              return (
                <li key={u.id} className="group relative rounded-2xl px-3 py-3 transition hover:bg-slate-50">
                  <div className="flex gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-100 text-[11px] font-semibold tracking-wide text-neutral-700" aria-hidden>{k.mark}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 pr-6">
                        {u.status === "new" && <span className="size-2 shrink-0 rounded-full bg-brand-600" aria-label="New" />}
                        <span className="truncate text-[15px] font-semibold text-slate-900">{k.label}{u.company && ` · ${u.company}`}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-1 font-semibold text-slate-600">Gmail</span>
                        {timeAgo(u.receivedAt)}
                        {!u.jobId && <span className="text-slate-400">· not in your jobs</span>}
                      </div>
                      {u.summary && <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-slate-600">{u.summary}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {done ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-neutral-700"><IconCheck className="size-3.5" /> Recorded</span>
                        ) : u.jobId && u.suggestedOutcome ? (
                          <button onClick={() => act(u, "record_outcome")} disabled={busy} className={buttonClass("primary", "sm")}>
                            {busy && <Spinner className="size-3" />} Mark as {OUTCOME_LABEL[u.suggestedOutcome] ?? u.suggestedOutcome}
                          </button>
                        ) : u.jobId && u.kind === "application_received" ? (
                          <button onClick={() => act(u, "mark_applied")} disabled={busy} className={buttonClass("secondary", "sm")}>
                            {busy && <Spinner className="size-3" />} Mark as applied
                          </button>
                        ) : null}
                        {REPLYABLE.has(u.kind) && (
                          <button
                            onClick={() => openJunu({ prompt: `Help me reply to this ${k.label.toLowerCase()} from ${u.company || u.fromName}. What it says: "${u.summary}"` })}
                            className={buttonClass("secondary", "sm")}
                          >
                            <IconSparkles /> Draft reply
                          </button>
                        )}
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${u.threadId || u.messageId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClass("ghost", "sm")}
                        >
                          Open email <IconExternal />
                        </a>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => act(u, "dismiss")}
                    disabled={busy}
                    className="absolute right-2 top-2.5 grid size-7 place-items-center rounded-md text-slate-300 opacity-100 hover:bg-white hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Dismiss"
                    title="Dismiss"
                  >
                    <IconX className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {compact && list.length > 3 && (
          <button onClick={() => setShowAll((s) => !s)} className="mt-1 w-full rounded-xl py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            {showAll ? "Show less" : `Show all ${list.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

const WIDE = "(min-width: 1024px)";

/** Updates as a right-hand column on wide screens (renders nothing on narrow ones). */
export function UpdatesRail() {
  const wide = useMediaQuery(WIDE);
  if (!wide) return null;
  return (
    <aside className="w-[360px] shrink-0">
      <div className="sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col">
        <UpdatesPanel />
      </div>
    </aside>
  );
}

/** Compact updates inline on narrow screens (renders nothing on wide ones, where the rail shows them). */
export function UpdatesInline() {
  return useMediaQuery(WIDE) ? null : <UpdatesPanel compact />;
}
