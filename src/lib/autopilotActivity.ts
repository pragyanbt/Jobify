import { prisma } from "./db";
import { TAILOR_RUNNING } from "./jobs";
import { parseJson } from "./json";
import type { PipelineStep } from "./types";

// What Autopilot is doing, per job, for the Chat tab's progress card. Combines the
// tailoring pipeline (auto-mode runs) with the submit queue (ApplicationDraft).

export type ActivityState = "running" | "done" | "needs_you" | "failed";

export interface ActivityItem {
  jobId: string;
  title: string;
  company: string;
  state: ActivityState;
  /** Short status, e.g. "Tailoring your resume". */
  label: string;
  /** Extra detail: current pipeline step, or why it needs the user. */
  detail: string;
  /** 0-1 progress through the whole flow. */
  progress: number;
  updatedAt: string;
  link: string;
}

const WINDOW_MS = 24 * 3_600_000;

export async function getAutopilotActivity(userId: string): Promise<{ running: boolean; items: ActivityItem[] }> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [runs, drafts] = await Promise.all([
    prisma.tailoredResume.findMany({
      where: { userId, mode: "auto", updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, jobId: true, status: true, steps: true, error: true, updatedAt: true, job: { select: { title: true, company: true } } },
    }),
    prisma.applicationDraft.findMany({
      where: { userId, submitStatus: { not: "none" }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { jobId: true, submitStatus: true, submitNote: true, updatedAt: true, job: { select: { title: true, company: true } } },
    }),
  ]);

  const byJob = new Map<string, ActivityItem>();
  const put = (item: ActivityItem) => {
    const prev = byJob.get(item.jobId);
    if (!prev || prev.updatedAt < item.updatedAt) byJob.set(item.jobId, item);
  };

  // Tailoring phase (first ~60% of the flow).
  for (const r of runs) {
    const steps = parseJson<PipelineStep[]>(r.steps, []);
    const done = steps.filter((s) => s.status === "done").length;
    const current = steps.find((s) => s.status === "running");
    const base = { jobId: r.jobId, title: r.job.title, company: r.job.company, updatedAt: r.updatedAt.toISOString(), link: `/studio/tailored/${r.id}` };
    if (TAILOR_RUNNING.has(r.status)) {
      put({ ...base, state: "running", label: "Tailoring your resume", detail: current?.label ?? "Starting", progress: 0.6 * (steps.length ? done / steps.length : 0) });
    } else if (r.status === "failed") {
      put({ ...base, state: "failed", label: "Tailoring failed", detail: r.error ?? "Something went wrong while tailoring.", progress: 0.6 });
    } else if (r.status === "needs_review") {
      put({ ...base, state: "needs_you", label: "Resume needs your review", detail: current?.detail ?? "Validation flagged something to check before applying.", progress: 0.6 });
    } else if (r.status === "approved") {
      // Approved: the application is being filled in (the draft row takes over once it exists).
      put({ ...base, state: "running", label: "Filling in the application", detail: "Answering the employer's questions", progress: 0.7 });
    }
  }

  // Submit phase.
  for (const d of drafts) {
    const base = { jobId: d.jobId, title: d.job.title, company: d.job.company, updatedAt: d.updatedAt.toISOString(), link: `/jobs/${d.jobId}/application` };
    switch (d.submitStatus) {
      case "queued":
        put({ ...base, state: "running", label: "Ready, waiting for Chrome", detail: "The Jobify extension will submit it on its next check.", progress: 0.8 });
        break;
      case "submitting":
        put({ ...base, state: "running", label: "Submitting in Chrome", detail: "Filling in the employer's form", progress: 0.9 });
        break;
      case "submitted":
        put({ ...base, state: "done", label: "Submitted", detail: d.submitNote || "Application sent.", progress: 1, link: `/jobs/${d.jobId}` });
        break;
      case "needs_you":
        put({ ...base, state: "needs_you", label: "Needs you", detail: d.submitNote, progress: 0.8 });
        break;
      case "failed":
        put({ ...base, state: "failed", label: "Couldn't submit", detail: d.submitNote, progress: 0.9 });
        break;
    }
  }

  const items = [...byJob.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
  return { running: items.some((i) => i.state === "running"), items };
}
