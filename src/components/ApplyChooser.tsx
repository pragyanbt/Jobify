"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackApply } from "@/lib/applyTracker";
import { api, REFRESH_EVENT, useApi } from "@/lib/fetcher";
import type { AskResult } from "@/lib/autoSubmit";
import type { LoadedProfile } from "@/lib/profile";
import { IconCheck, IconChevronRight, IconExternal, IconX } from "./icons";
import { JunuAvatar } from "./JunuAvatar";
import { buttonClass, cx, Notice, Spinner } from "./ui";

export interface ApplyTarget {
  id: string;
  title: string;
  company: string;
  url: string;
}

/**
 * "Apply" chooser: apply manually on the employer's site, or ask Junu to apply
 * (tailor, fill in and submit through the Chrome extension; needs Auto-apply on).
 */
export function ApplyChooser({ job, onClose }: { job: ApplyTarget; onClose: () => void }) {
  const profile = useApi<LoadedProfile>("/api/profile");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = profile.data?.autoApply;
  const autopilotOn = !!a && a.enabled && a.autoSubmit && !!a.consentAt;

  function applyManually() {
    trackApply(job);
    window.open(job.url, "_blank", "noopener,noreferrer");
    onClose();
  }

  async function askJunu() {
    setBusy(true);
    setErr(null);
    try {
      setResult(await api<AskResult>(`/api/jobs/${job.id}/auto-apply`, { method: "POST" }));
      window.dispatchEvent(new Event(REFRESH_EVENT));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="apply-chooser-title">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="apply-chooser-title" className="text-lg font-semibold tracking-tight text-slate-900">How do you want to apply?</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{job.title} · {job.company}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <IconX className="size-4" />
          </button>
        </div>

        {result ? (
          <div className="mt-5 space-y-3">
            <Notice tone={result.status === "needs_you" ? "warning" : "success"} title={result.status === "needs_you" ? "Junu needs you" : result.status === "already" ? "Already on it" : "Junu is on it"}>
              {result.message}
            </Notice>
            {!result.extensionConnected && result.status !== "needs_you" && (
              <Notice tone="warning" title="Connect the Chrome extension">
                Junu submits from your Chrome. <Link href="/settings#autopilot" className="font-medium underline">Set it up in Settings → Autopilot</Link>.
              </Notice>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {result.status === "needs_you" ? (
                <Link href={`/jobs/${job.id}/application`} className={buttonClass("primary")} onClick={onClose}>Review answers</Link>
              ) : (
                <Link href="/chat" className={buttonClass("primary")} onClick={onClose}>Watch in chat</Link>
              )}
              <button onClick={onClose} className={buttonClass("secondary")}>Done</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <button
              onClick={applyManually}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-900"><IconExternal className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Apply manually</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">Open the employer&apos;s page and apply yourself. We&apos;ll ask if you applied when you&apos;re back.</span>
              </span>
              <IconChevronRight className="size-4 shrink-0 text-slate-400" />
            </button>

            <button
              onClick={askJunu}
              disabled={!autopilotOn || busy || !profile.data}
              className={cx(
                "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
                autopilotOn ? "border-brand-200 bg-brand-50/50 hover:border-brand-300 hover:bg-brand-50" : "cursor-not-allowed border-slate-200 opacity-70",
              )}
            >
              <JunuAvatar size={44} className="self-center" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Ask Junu to apply</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">
                  Junu tailors your resume, fills in the application and submits it for you.
                </span>
              </span>
              {busy ? <Spinner className="text-brand-600" /> : autopilotOn ? <IconChevronRight className="size-4 shrink-0 text-brand-400" /> : null}
            </button>

            {profile.data && !autopilotOn && (
              <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>Turn on <b className="font-medium text-slate-800">Auto-apply with Junu</b> to use this.</span>
                <Link href="/settings#autopilot" onClick={onClose} className={buttonClass("primary", "sm")}>Turn on in Settings</Link>
              </div>
            )}
            {err && <Notice tone="error">{err}</Notice>}
            {autopilotOn && !err && (
              <p className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
                <IconCheck className="size-3.5" /> Within your Autopilot limits. Anything Junu can&apos;t finish waits for you.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
