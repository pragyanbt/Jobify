import { draftApplicationAnswers, type AppQuestionForAI } from "./ai/operations";
import { answerFromProfile, loadForm, pickOption } from "./applicationForm";
import { needsYou, type DraftAnswer, type FormQuestion } from "./applicationTypes";
import { getApplicationProfile } from "./applyProfile";
import { prisma } from "./db";
import { parseJson } from "./json";
import { latexToText } from "./latex/document";
import { approvedFactsText, getProfile } from "./profile";

// "Prepare application": Junu fills in a job's application form for the user
// to review. Submitting is done by the user, or by the Chrome extension when
// automatic submitting is on (see autoSubmit.ts).

export interface PreparedDraft {
  id: string;
  jobId: string;
  formSource: "greenhouse" | "standard";
  questions: FormQuestion[];
  answers: DraftAnswer[];
  status: "draft" | "reviewed";
  resume: { versionId: string; number: number; tailoredId: string; approved: boolean } | null;
  updatedAt: string;
}

/** The resume to attach: the job's approved tailored version, else its latest compiled one. */
async function resumeFor(userId: string, jobId: string): Promise<{ versionId: string | null; latex: string } | null> {
  // Pick by metadata first; load the LaTeX of the chosen one only.
  const tailored = await prisma.tailoredResume.findMany({
    where: { userId, jobId },
    orderBy: { createdAt: "desc" },
    select: { status: true, versions: { where: { compileOk: true, hasPdf: true }, orderBy: { number: "desc" }, take: 1, select: { id: true } } },
  });
  const withVersion = tailored.filter((t) => t.versions.length);
  const pick = withVersion.find((t) => t.status === "approved") ?? withVersion[0];
  if (pick) {
    const v = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: pick.versions[0].id }, select: { id: true, latex: true } });
    return { versionId: v.id, latex: v.latex };
  }
  const master = await prisma.masterResume.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: { latex: true },
  });
  return master ? { versionId: null, latex: master.latex } : null;
}

export async function prepareApplication(userId: string, jobId: string, email?: string): Promise<PreparedDraft> {
  const jobP = prisma.job.findFirstOrThrow({ where: { id: jobId, userId } });
  const [job, { profile, selfId }, p, resume, form] = await Promise.all([
    jobP,
    getApplicationProfile(userId, email),
    getProfile(userId),
    resumeFor(userId, jobId),
    jobP.then((j) => loadForm(j.externalKey)),
  ]);

  const answers = new Map<string, DraftAnswer>();
  const forAI: FormQuestion[] = [];
  for (const q of form.questions) {
    // With auto-submit authorized, standard statements can be confirmed for the user.
    const a = answerFromProfile(q, profile, selfId, { authorized: p.autoApply.autoSubmit && !!p.autoApply.consentAt });
    if (a) answers.set(q.id, a);
    else forAI.push(q);
  }

  if (forAI.length) {
    const allNeedYou = (note: string) => forAI.forEach((q) => answers.set(q.id, needsYou(q, note)));
    if (!resume) {
      allNeedYou("Add a master resume so Junu can answer this from your experience.");
    } else {
      try {
        // Only these questions reach Claude: no contact details, self-identification or consent questions.
        const questions: AppQuestionForAI[] = forAI.map((q) => ({
          id: q.id,
          label: q.label,
          description: q.description,
          required: q.required,
          kind: q.kind as AppQuestionForAI["kind"],
          options: q.options?.map((o) => o.label),
        }));
        const out = await draftApplicationAnswers({
          questions,
          resumeText: latexToText(resume.latex),
          factsText: approvedFactsText(p.facts),
          job: { title: job.title, company: job.company, description: job.description },
        });
        for (const q of forAI) {
          const r = out.answers.find((x) => x.id === q.id);
          if (!r || r.basis === "unknown") {
            answers.set(q.id, needsYou(q, r?.note || "Your resume doesn't cover this, so you'll need to answer it."));
            continue;
          }
          const source = r.basis === "drafted" ? "drafted" : "resume";
          if (q.kind === "select" || q.kind === "multiselect") {
            const values = r.options.map((label) => pickOption(q, label)).filter((v): v is string => !!v);
            answers.set(q.id, values.length
              ? { questionId: q.id, value: q.kind === "select" ? values[0] : values, source, note: r.note }
              : needsYou(q, r.note || "Pick the option that fits you."));
          } else {
            answers.set(q.id, r.text.trim()
              ? { questionId: q.id, value: r.text.trim(), source, note: r.note }
              : needsYou(q, r.note));
          }
        }
      } catch (e) {
        console.error("[jobify] drafting application answers failed", e);
        allNeedYou(`Junu couldn't draft this (${(e as Error).message}). You can answer it yourself or try again.`);
      }
    }
  }

  const ordered = form.questions.map((q) => answers.get(q.id)!).filter(Boolean);
  const data = {
    formSource: form.source,
    questions: JSON.stringify(form.questions),
    answers: JSON.stringify(ordered),
    versionId: resume?.versionId ?? null,
    status: "draft",
  };
  await prisma.applicationDraft.upsert({
    where: { jobId },
    create: { userId, jobId, ...data },
    update: data,
  });
  return (await getDraft(userId, jobId))!;
}

export async function getDraft(userId: string, jobId: string): Promise<PreparedDraft | null> {
  const d = await prisma.applicationDraft.findFirst({ where: { jobId, userId } });
  if (!d) return null;
  const v = d.versionId
    ? await prisma.resumeVersion.findUnique({ where: { id: d.versionId }, include: { tailored: { select: { status: true } } } })
    : null;
  return {
    id: d.id,
    jobId: d.jobId,
    formSource: d.formSource as PreparedDraft["formSource"],
    questions: parseJson<FormQuestion[]>(d.questions, []),
    answers: parseJson<DraftAnswer[]>(d.answers, []),
    status: d.status as PreparedDraft["status"],
    resume: v ? { versionId: v.id, number: v.number, tailoredId: v.tailoredId, approved: v.tailored.status === "approved" } : null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** Save the user's edits. Answers the user typed become "profile"-free user answers (source kept unless emptied). */
export async function saveDraft(userId: string, jobId: string, answers: DraftAnswer[], status: "draft" | "reviewed") {
  const d = await prisma.applicationDraft.findFirstOrThrow({ where: { jobId, userId } });
  const questions = parseJson<FormQuestion[]>(d.questions, []);
  const ids = new Set(questions.map((q) => q.id));
  const clean = answers.filter((a) => ids.has(a.questionId));
  await prisma.applicationDraft.update({ where: { id: d.id }, data: { answers: JSON.stringify(clean), status } });
  return getDraft(userId, jobId);
}
