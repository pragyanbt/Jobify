import { markApplied } from "./applications";
import type { DraftAnswer, FormQuestion } from "./applicationTypes";
import { prisma } from "./db";
import { TAILOR_RUNNING } from "./jobs";
import { parseJson } from "./json";
import { prepareApplication } from "./prepareApplication";
import { getProfile } from "./profile";

// Fully automatic applying. Autopilot prepares applications; complete ones are
// queued, and the Jobify Chrome extension (running in the user's own browser)
// claims them one at a time, fills the employer's form, submits, and reports back.

const STALE_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;

export interface SubmitTask {
  id: string;
  jobId: string;
  title: string;
  company: string;
  /** Page with the application form. */
  applyUrl: string;
  formSource: string;
  resumeFileName: string;
  fields: {
    id: string;
    label: string;
    kind: FormQuestion["kind"];
    required: boolean;
    /** Text answer, or option values for selects. */
    values: string[];
    /** Option labels matching `values` (selects), for matching custom dropdowns by text. */
    labels: string[];
    resume?: boolean;
  }[];
}

/** Required answers still missing (labels). Files other than the resume don't block. */
export function missingRequired(questions: FormQuestion[], answers: DraftAnswer[]): string[] {
  const by = new Map(answers.map((a) => [a.questionId, a]));
  return questions
    .filter((q) => q.required && q.kind !== "file")
    .filter((q) => {
      const a = by.get(q.id);
      if (!a || a.source === "needs_you") return true;
      return Array.isArray(a.value) ? a.value.length === 0 : !a.value.trim();
    })
    .map((q) => q.label);
}

async function autoSubmitOn(userId: string) {
  const { autoApply } = await getProfile(userId);
  return autoApply.enabled && autoApply.autoSubmit && !!autoApply.consentAt ? autoApply : null;
}

/** Prepare a job's application and queue it for the extension, or mark what needs the user. */
export async function queueForSubmission(userId: string, jobId: string) {
  const d = await prepareApplication(userId, jobId);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { url: true } });
  const missing = missingRequired(d.questions, d.answers);
  const reason = !job.url
    ? "This job has no application link."
    : !d.resume
      ? "There's no tailored resume PDF to attach."
      : missing.length
        ? `Junu couldn't answer: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? "…" : ""}`
        : "";
  await prisma.applicationDraft.update({
    where: { id: d.id },
    data: reason
      ? { submitStatus: "needs_you", submitNote: reason }
      : { submitStatus: "queued", submitNote: "", submitAttempts: 0, claimedAt: null },
  });
  return { queued: !reason, reason };
}

/** Queue the user's saved (possibly edited) answers again, without re-preparing them. */
export async function requeueDraft(userId: string, jobId: string) {
  const d = await prisma.applicationDraft.findFirstOrThrow({ where: { userId, jobId }, include: { job: { select: { url: true } } } });
  const missing = missingRequired(parseJson<FormQuestion[]>(d.questions, []), parseJson<DraftAnswer[]>(d.answers, []));
  const reason = !d.job.url
    ? "This job has no application link."
    : !d.versionId
      ? "There's no tailored resume PDF to attach."
      : missing.length
        ? `Still missing: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? "…" : ""}`
        : "";
  await prisma.applicationDraft.update({
    where: { id: d.id },
    data: reason ? { submitStatus: "needs_you", submitNote: reason } : { submitStatus: "queued", submitNote: "", submitAttempts: 0, claimedAt: null },
  });
  return { queued: !reason, reason };
}

function applyUrlFor(url: string, externalKey: string | null): string {
  const [kind, board, id] = externalKey?.split(":") ?? [];
  // Greenhouse's hosted form, not the company page that may wrap it in an iframe.
  if (kind === "greenhouse" && board && id) {
    return `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${encodeURIComponent(id)}`;
  }
  if (kind === "lever" && !/\/apply\/?$/.test(url)) return url.replace(/\/$/, "") + "/apply";
  if (kind === "ashby" && !/\/application\/?$/.test(url)) return url.replace(/\/$/, "") + "/application";
  return url;
}

/** Give the extension the next queued application, if auto-submit is on and today's limit allows. */
export async function claimNext(userId: string): Promise<SubmitTask | null> {
  const autoApply = await autoSubmitOn(userId);
  if (!autoApply) return null;

  // Claims that never reported back: retry a few times, then give up.
  const stale = new Date(Date.now() - STALE_MS);
  await prisma.applicationDraft.updateMany({
    where: { userId, submitStatus: "submitting", claimedAt: { lt: stale }, submitAttempts: { lt: MAX_ATTEMPTS } },
    data: { submitStatus: "queued" },
  });
  await prisma.applicationDraft.updateMany({
    where: { userId, submitStatus: "submitting", claimedAt: { lt: stale } },
    data: { submitStatus: "failed", submitNote: "The extension didn't finish this application after several tries." },
  });

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const today = await prisma.applicationDraft.count({ where: { userId, submitStatus: "submitted", submittedAt: { gte: since } } });
  if (today >= autoApply.dailyLimit) return null;

  const d = await prisma.applicationDraft.findFirst({
    where: { userId, submitStatus: "queued" },
    orderBy: { updatedAt: "asc" },
    include: { job: { select: { id: true, title: true, company: true, url: true, externalKey: true } } },
  });
  if (!d) return null;
  // Claim atomically (another poll may race us).
  const claimed = await prisma.applicationDraft.updateMany({
    where: { id: d.id, submitStatus: "queued" },
    data: { submitStatus: "submitting", claimedAt: new Date(), submitAttempts: { increment: 1 } },
  });
  if (!claimed.count) return null;

  const questions = parseJson<FormQuestion[]>(d.questions, []);
  const answers = new Map(parseJson<DraftAnswer[]>(d.answers, []).map((a) => [a.questionId, a]));
  return {
    id: d.id,
    jobId: d.job.id,
    title: d.job.title,
    company: d.job.company,
    applyUrl: applyUrlFor(d.job.url, d.job.externalKey),
    formSource: d.formSource,
    resumeFileName: `${d.job.company} - Resume.pdf`.replace(/[^\w .-]+/g, ""),
    fields: questions.map((q) => {
      const a = answers.get(q.id);
      const values = a && a.source !== "needs_you" ? (Array.isArray(a.value) ? a.value : a.value ? [a.value] : []) : [];
      return {
        id: q.id,
        label: q.label,
        kind: q.kind,
        required: q.required,
        values,
        labels: values.map((v) => q.options?.find((o) => o.value === v)?.label ?? v),
        resume: q.kind === "file" && a?.source === "attachment" ? true : undefined,
      };
    }),
  };
}

export type SubmitOutcome = { status: "submitted" | "needs_you" | "failed"; note?: string };

/** The extension reports what happened. "submitted" records the application as applied. */
export async function recordResult(userId: string, draftId: string, r: SubmitOutcome) {
  const d = await prisma.applicationDraft.findFirstOrThrow({ where: { id: draftId, userId } });
  if (r.status === "submitted") {
    await markApplied(userId, d.jobId);
  }
  await prisma.applicationDraft.update({
    where: { id: d.id },
    data: {
      submitStatus: r.status,
      submitNote: (r.note ?? "").slice(0, 500),
      ...(r.status === "submitted" && { submittedAt: new Date() }),
    },
  });
}

/** The resume PDF for a claimed task. */
export async function taskResume(userId: string, draftId: string) {
  const d = await prisma.applicationDraft.findFirstOrThrow({ where: { id: draftId, userId }, select: { versionId: true } });
  if (!d.versionId) return null;
  const pdf = await prisma.resumePdf.findUnique({ where: { versionId: d.versionId } });
  return pdf ? Buffer.from(pdf.data) : null;
}

export type AskResult =
  | { status: "queued" | "tailoring" | "already"; message: string; extensionConnected: boolean }
  | { status: "needs_you"; message: string; extensionConnected: boolean };

/**
 * "Ask Junu to apply" for one job: tailor if needed, prepare the application, and
 * queue it for the Chrome extension. Requires Auto-apply (with its authorization) on.
 */
export async function askJunuToApply(userId: string, jobId: string): Promise<AskResult> {
  if (!(await autoSubmitOn(userId))) {
    throw new Error("Turn on Auto-apply with Junu in Settings → Autopilot first.");
  }
  const job = await prisma.job.findFirstOrThrow({
    where: { id: jobId, userId },
    select: {
      url: true,
      draft: { select: { submitStatus: true } },
      tailored: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, versions: { where: { compileOk: true, hasPdf: true }, take: 1, select: { id: true } } },
      },
    },
  });
  const extensionConnected = !!(await prisma.extensionToken.findUnique({ where: { userId }, select: { id: true } }));
  if (!job.url) return { status: "needs_you", message: "This job has no application link, so Junu can't apply to it.", extensionConnected };

  const s = job.draft?.submitStatus;
  if (s === "submitted") return { status: "already", message: "Junu already submitted this application.", extensionConnected };
  if (s === "queued" || s === "submitting") return { status: "already", message: "Junu is already applying to this job.", extensionConnected };

  const t = job.tailored[0];
  if (t && TAILOR_RUNNING.has(t.status)) {
    return { status: "tailoring", message: "Junu is still tailoring your resume for this job. Ask again once it's ready.", extensionConnected };
  }
  if (t && t.status !== "failed" && t.versions.length) {
    const q = await queueForSubmission(userId, jobId);
    return q.queued
      ? { status: "queued", message: "Junu filled in the application and will submit it from Chrome shortly.", extensionConnected }
      : { status: "needs_you", message: q.reason, extensionConnected };
  }

  // No usable tailored resume yet: tailor in Autopilot mode; it queues the application when done.
  const { startTailoring } = await import("./pipeline");
  void startTailoring(userId, jobId, "auto").catch((e) => console.error("[jobify] ask-junu tailoring failed", e));
  return {
    status: "tailoring",
    message: "Junu is tailoring your resume for this job (about a minute), then she'll fill in and submit the application.",
    extensionConnected,
  };
}

