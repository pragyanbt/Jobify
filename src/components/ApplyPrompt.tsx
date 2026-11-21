"use client";

import { useCallback, useEffect, useState } from "react";
import { api, REFRESH_EVENT } from "@/lib/fetcher";
import { clearPending, PENDING_EVENT, readPending, type PendingApply } from "@/lib/applyTracker";
import { IconCheck, IconSend } from "./icons";
import { Button, Spinner } from "./ui";

/** Ignore clicks this recent, so the prompt doesn't flash while the new tab is opening. */
const MIN_AWAY_MS = 4000;

/**
 * When the user returns to Jobify after opening an employer's application page,
 * ask whether they applied. "Yes" records a submitted application, which moves
 * the job to the Applied tab.
 */
export function ApplyPrompt() {
  const [current, setCurrent] = useState<PendingApply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const check = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    const due = readPending().filter((p) => now - p.at >= MIN_AWAY_MS);
    setCurrent((c) => c ?? due[0] ?? null);
  }, []);

  useEffect(() => {
    const t = setTimeout(check, 600);
    let later: ReturnType<typeof setTimeout> | undefined;
    // A click that didn't take the user away (e.g. the tab opened in the background):
    // check again once the minimum time has passed.
    const onPending = () => { clearTimeout(later); later = setTimeout(check, MIN_AWAY_MS + 200); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener(PENDING_EVENT, onPending);
    return () => {
      clearTimeout(t);
      clearTimeout(later);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener(PENDING_EVENT, onPending);
    };
  }, [check]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function next(done: PendingApply) {
    clearPending(done.jobId);
    setError(null);
    const now = Date.now();
    setCurrent(readPending().find((p) => now - p.at >= MIN_AWAY_MS) ?? null);
  }

  async function yes() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${current.jobId}/applied`, { method: "POST" });
      window.dispatchEvent(new Event(REFRESH_EVENT));
      setToast(`Moved “${current.title}” to Applied`);
      next(current);
    } catch (e) {
      const msg = (e as Error).message;
      // The job was deleted since: nothing to record.
      if (/not found/i.test(msg)) next(current);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {current && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="apply-prompt-title">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => !busy && next(current)} />
          <div className="relative w-full rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <IconSend className="size-6" />
            </div>
            <h2 id="apply-prompt-title" className="text-lg font-semibold tracking-tight text-slate-900">Did you apply?</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              You opened the application for <b className="font-medium text-slate-900">{current.title}</b> at{" "}
              <b className="font-medium text-slate-900">{current.company}</b>. If you submitted it, we&apos;ll move it to Applied
              so you can track the outcome.
            </p>
            {error && <p className="mt-3 rounded-lg border border-neutral-950 px-3 py-2 text-sm text-neutral-950">{error}</p>}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="primary" className="h-11 sm:order-last sm:h-10" onClick={yes} disabled={busy} autoFocus>
                {busy ? <Spinner /> : <IconCheck />} Yes, I applied
              </Button>
              <Button className="h-11 sm:h-10" onClick={() => next(current)} disabled={busy}>
                Not yet
              </Button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+1.5rem)] z-50 flex justify-center px-4 md:bottom-6">
          <div className="flex max-w-full items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
            <IconCheck className="size-4 shrink-0" />
            <span className="truncate">{toast}</span>
          </div>
        </div>
      )}
    </>
  );
}
