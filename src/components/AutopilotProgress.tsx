"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActivityItem } from "@/lib/autopilotActivity";
import { useApi } from "@/lib/fetcher";
import { timeAgo } from "@/lib/time";
import { IconAlert, IconCheck, IconChevronDown, IconX } from "./icons";
import { postFromJunu } from "./Junu";
import { cx, Spinner } from "./ui";

interface Activity { running: boolean; items: ActivityItem[] }

const SEEN_KEY = "jobify.autopilot.seen";

/** Post a chat message once per job outcome (submitted / needs you / failed). */
function announce(items: ActivityItem[]) {
  let seen: Record<string, string> | null = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null"); } catch { /* storage unavailable */ }
  const first = seen === null;
  const next: Record<string, string> = { ...(seen ?? {}) };
  for (const i of items) {
    if (i.state === "running" || next[i.jobId] === i.state) continue;
    next[i.jobId] = i.state;
    // On the very first load, only remember what's there: don't replay old outcomes into the chat.
    if (first) continue;
    const job = `**${i.title}** at ${i.company}`;
    if (i.state === "done") postFromJunu(`✅ I submitted your application for ${job}. You'll find it under [Applied](/applications).`);
    if (i.state === "needs_you") postFromJunu(`I need your help with ${job}: ${i.detail} [Take a look](${i.link}).`);
    if (i.state === "failed") postFromJunu(`I couldn't finish ${job}: ${i.detail} [Details](${i.link}).`);
  }
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}

/** Live Autopilot progress at the top of the Chat tab. */
export function AutopilotProgress() {
  const [interval, setIntervalMs] = useState(30_000);
  const { data } = useApi<Activity>("/api/autopilot/activity", { poll: () => true, intervalMs: interval });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!data) return;
    setIntervalMs(data.running ? 3_000 : 30_000);
    announce(data.items);
  }, [data]);

  if (!data || data.items.length === 0) return null;
  const working = data.items.filter((i) => i.state === "running").length;
  const submitted = data.items.filter((i) => i.state === "done").length;
  const needs = data.items.filter((i) => i.state === "needs_you" || i.state === "failed").length;

  return (
    <section className="border-b border-slate-100 bg-brand-50/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left md:px-5" aria-expanded={open}>
        {working ? <Spinner className="size-3.5 text-brand-600" /> : <span className="size-2 rounded-full bg-emerald-500" />}
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Autopilot
          <span className="ml-2 font-normal text-slate-500">
            {[working && `${working} working`, submitted && `${submitted} submitted`, needs && `${needs} need${needs === 1 ? "s" : ""} you`].filter(Boolean).join(" · ") || "Idle"}
          </span>
        </span>
        <IconChevronDown className={cx("size-4 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="max-h-[38vh] space-y-1.5 overflow-y-auto px-3 pb-3 md:px-4">
          {data.items.map((i) => (
            <li key={i.jobId}>
              <Link href={i.link} className="flex gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/70 transition hover:ring-brand-200">
                <span className={cx(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  i.state === "running" && "bg-brand-50 text-brand-600",
                  i.state === "done" && "bg-emerald-100 text-emerald-700",
                  i.state === "needs_you" && "bg-amber-100 text-amber-700",
                  i.state === "failed" && "bg-red-100 text-red-700",
                )}>
                  {i.state === "running" ? <Spinner className="size-3" /> : i.state === "done" ? <IconCheck className="size-3.5" strokeWidth={2.5} /> : i.state === "failed" ? <IconX className="size-3.5" /> : <IconAlert className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{i.title} · {i.company}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(i.updatedAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-slate-600">
                    <b className="font-medium">{i.label}</b>{i.detail && ` · ${i.detail}`}
                  </span>
                  {i.state === "running" && (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-1 rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${Math.max(6, Math.round(i.progress * 100))}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
