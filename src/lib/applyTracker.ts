"use client";

/**
 * Remembers which jobs the user opened the employer's application page for,
 * so that when they come back to Jobify we can ask "Did you apply?".
 *
 * Stored in localStorage (per browser). Everything is best-effort: storage can
 * be unavailable (private mode, blocked site data) and the app must still work.
 */

export interface PendingApply {
  jobId: string;
  title: string;
  company: string;
  /** When the Apply link was opened (ms since epoch). */
  at: number;
}

const KEY = "jobify.pendingApply.v1";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const PENDING_EVENT = "jobify:pending-apply";

export function readPending(): PendingApply[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingApply[];
    const now = Date.now();
    return Array.isArray(raw) ? raw.filter((p) => p && p.jobId && now - p.at < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

function write(list: PendingApply[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the prompt just won't appear */
  }
}

/** Call when the user opens a job's external application page. */
export function trackApply(job: { id: string; title: string; company: string }) {
  const list = readPending().filter((p) => p.jobId !== job.id);
  list.push({ jobId: job.id, title: job.title, company: job.company, at: Date.now() });
  write(list.slice(-20));
  window.dispatchEvent(new Event(PENDING_EVENT));
}

export function clearPending(jobId: string) {
  write(readPending().filter((p) => p.jobId !== jobId));
}
