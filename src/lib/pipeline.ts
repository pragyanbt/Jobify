import { prisma } from "./db";
import { parseJson } from "./json";
import { analyzeJob, factCheck, proposeLatexFix, proposeTailoring } from "./ai/operations";
import { applyEdits, type ProposedEdit } from "./latex/edits";
import { compileLatex, type CompileResult } from "./latex/compile";
import { latexToText, splitDocument } from "./latex/document";
import { buildMatchReport, countTerm, scoreText, weightedTerms } from "./scoring";
import { numericTokens, validateDeterministic } from "./validation";
import { approvedFactsText, getProfile } from "./profile";
import { getChannel } from "./channels";
import type {
  ChangeRecord,
  JobAnalysis,
  MatchReport,
  PipelineStep,
  ValidationIssue,
  ValidationReport,
} from "./types";

// The tailoring workflow (spec §5). Runs in the background; progress is
// written to TailoredResume.steps so the UI can poll it.

export const STEP_DEFS: [string, string][] = [
  ["retrieve", "Retrieve job description"],
  ["analyze", "Analyze requirements"],
  ["select", "Select best master resume"],
  ["tailor", "Generate tailored resume"],
  ["compile", "Compile PDF"],
  ["validate", "Validate accuracy & formatting"],
  ["preview", "Preview & modifications ready"],
  ["approve", "Approve or edit"],
  ["submit", "Submit or provide for manual submission"],
  ["save", "Save & link to application"],
];

function initialSteps(): PipelineStep[] {
  return STEP_DEFS.map(([key, label]) => ({ key, label, status: "pending" }));
}

async function setStep(id: string, key: string, status: PipelineStep["status"], detail?: string) {
  const t = await prisma.tailoredResume.findUniqueOrThrow({ where: { id }, select: { steps: true } });
  const steps = parseJson<PipelineStep[]>(t.steps, initialSteps()).map((s) =>
    s.key === key ? { ...s, status, detail } : s,
  );
  await prisma.tailoredResume.update({ where: { id }, data: { steps: JSON.stringify(steps) } });
}

// ------------------------------------------------------------- analysis

export async function ensureAnalysis(userId: string, jobId: string): Promise<JobAnalysis> {
  const job = await prisma.job.findFirstOrThrow({ where: { id: jobId, userId } });
  const existing = parseJson<JobAnalysis | null>(job.analysis, null);
  if (existing) return existing;
  await prisma.job.update({ where: { id: jobId }, data: { status: "analyzing", error: null } });
  try {
    const analysis = await analyzeJob(job);
    const best = await selectBestMaster(userId, analysis);
    await prisma.job.update({
      where: { id: jobId },
      data: { analysis: JSON.stringify(analysis), status: "analyzed", baseScore: best?.score ?? null },
    });
    return analysis;
  } catch (e) {
    await prisma.job.update({ where: { id: jobId }, data: { status: "error", error: (e as Error).message } });
    throw e;
  }
}

export async function selectBestMaster(userId: string, analysis: JobAnalysis) {
  const masters = await prisma.masterResume.findMany({ where: { userId } });
  let best: { id: string; latex: string; name: string; score: number } | null = null;
  for (const m of masters) {
    const score = scoreText(latexToText(m.latex), analysis).score;
    const better =
      !best || score > best.score || (score === best.score && m.isDefault);
    if (better) best = { id: m.id, latex: m.latex, name: m.name, score };
  }
  return best;
}

// ------------------------------------------------------------- tailoring

export async function startTailoring(userId: string, jobId: string, mode: "manual" | "auto"): Promise<string> {
  await prisma.job.findFirstOrThrow({ where: { id: jobId, userId }, select: { id: true } });
  const anyMaster = await prisma.masterResume.findFirst({ where: { userId }, orderBy: { isDefault: "desc" } });
  if (!anyMaster) throw new Error("Add a master resume in Resume Studio first.");
  const t = await prisma.tailoredResume.create({
    data: {
      userId,
      jobId,
      masterId: anyMaster.id,
      masterSnapshot: anyMaster.latex,
      mode,
      status: "analyzing",
      steps: JSON.stringify(initialSteps()),
    },
  });
  const run = runPipeline(t.id).catch(async (e) => {
    console.error("[jobify] tailoring failed", e);
    await prisma.tailoredResume.update({
      where: { id: t.id },
      data: { status: "failed", error: (e as Error).message },
    });
  });
  // Auto-apply runs sequentially; manual runs return immediately and are polled.
  if (mode === "auto") await run;
  return t.id;
}

async function runPipeline(id: string) {
  const t = await prisma.tailoredResume.findUniqueOrThrow({ where: { id }, include: { job: true } });
  const profile = await getProfile(t.userId);
  const factsText = approvedFactsText(profile.facts);

  // 1. Retrieve
  await setStep(id, "retrieve", "done", `${t.job.title} at ${t.job.company}`);

  // 2. Analyze
  await setStep(id, "analyze", "running");
  const analysis = await ensureAnalysis(t.userId, t.jobId).catch(async (e) => {
    await setStep(id, "analyze", "error", (e as Error).message);
    throw e;
  });
  await setStep(
    id,
    "analyze",
    "done",
    `${analysis.requiredSkills.length} required, ${analysis.preferredSkills.length} preferred skills, ${analysis.atsKeywords.length} keywords`,
  );

  // 3. Select master
  await setStep(id, "select", "running");
  const master = await selectBestMaster(t.userId, analysis);
  if (!master) throw new Error("No master resume found.");
  await prisma.tailoredResume.update({
    where: { id },
    data: { masterId: master.id, masterSnapshot: master.latex, status: "tailoring" },
  });
  await setStep(id, "select", "done", `${master.name} (match ${master.score}%)`);

  // 4. Tailor
  await setStep(id, "tailor", "running", "Asking Claude for targeted edits…");
  const doc = splitDocument(master.latex);
  const proposal = await proposeTailoring({
    body: doc.body,
    factsText,
    analysis,
    rules: profile.rules,
    jobDescription: t.job.description,
  });
  await setStep(id, "tailor", "running", "Checking every edit against your resume and facts…");
  const { latex: tailoredLatex, records } = await applyAndVerify({
    masterLatex: master.latex,
    edits: proposal.edits,
    factsText,
    analysis,
    rules: profile.rules,
  });
  const applied = records.filter((r) => r.status === "applied").length;
  const reverted = records.length - applied;
  await prisma.tailoredResume.update({
    where: { id },
    data: { changes: JSON.stringify(records), summary: proposal.summaryOfChanges, status: "compiling" },
  });
  await setStep(
    id,
    "tailor",
    "done",
    `${applied} edit(s) applied${reverted ? `, ${reverted} rejected or reverted` : ""}`,
  );

  // 5. Compile (with automatic repair)
  await setStep(id, "compile", "running");
  const compiled = await compileWithRepair(id, tailoredLatex, "ai", "Tailored by Claude");
  await setStep(
    id,
    "compile",
    compiled.result.ok ? "done" : "error",
    compiled.result.ok
      ? `${compiled.result.pageCount} page(s) via ${compiled.result.engine}${compiled.repairs ? `, ${compiled.repairs} auto-fix(es)` : ""}`
      : compiled.result.error?.message,
  );

  // 6. Validate
  await prisma.tailoredResume.update({ where: { id }, data: { status: "validating" } });
  await setStep(id, "validate", "running");
  const validation = buildValidation({
    masterLatex: master.latex,
    latex: compiled.latex,
    factsText,
    analysis,
    rules: profile.rules,
    compile: compiled.result,
  });
  const match = buildMatch(master.latex, compiled.latex, factsText, analysis);
  await prisma.tailoredResume.update({
    where: { id },
    data: { validation: JSON.stringify(validation), match: JSON.stringify(match) },
  });
  const errs = validation.issues.filter((i) => i.severity === "error").length;
  const warns = validation.issues.length - errs;
  await setStep(id, "validate", errs ? "error" : "done", `${errs} error(s), ${warns} warning(s)`);

  // 7. Preview ready
  await setStep(id, "preview", "done", `Match ${match.original.score}% → ${match.tailored.score}%`);

  if (t.mode === "auto") {
    await finishAuto(id, validation);
  } else {
    await prisma.tailoredResume.update({ where: { id }, data: { status: "ready" } });
    await setStep(id, "approve", "running", "Waiting for your review");
  }
}

/**
 * Apply proposed edits, then iteratively revert any edit that introduces an
 * unsupported skill or number (deterministic) or that the LLM fact-check flags.
 */
async function applyAndVerify(input: {
  masterLatex: string;
  edits: ProposedEdit[];
  factsText: string;
  analysis: JobAnalysis;
  rules: import("./types").TailoringRules;
}): Promise<{ latex: string; records: ChangeRecord[] }> {
  const { masterLatex, edits, factsText, analysis, rules } = input;
  const excluded = new Map<number, string>();
  const masterText = latexToText(masterLatex);
  const evidence = `${masterText}\n${factsText}`;
  const evidenceNums = numericTokens(evidence);

  // Pass 1 — deterministic, per-edit: does `after` introduce something absent from evidence?
  edits.forEach((e, i) => {
    const after = latexToText(e.replace);
    for (const { term } of weightedTerms(analysis)) {
      if (countTerm(after, term) > 0 && countTerm(evidence, term) === 0) {
        excluded.set(i, `Reverted: introduces "${term.name}", which isn't in your resume or approved facts.`);
        return;
      }
    }
    for (const n of numericTokens(after)) {
      if (!evidenceNums.has(n)) {
        excluded.set(i, `Reverted: introduces the figure "${n}", which isn't in your resume or approved facts.`);
        return;
      }
    }
    for (const raw of rules.neverAdd) {
      const term = { name: raw, aliases: [] };
      if (raw.trim() && countTerm(after, term) > countTerm(latexToText(e.find), term)) {
        excluded.set(i, `Reverted: adds "${raw}", which is on your never-add list.`);
        return;
      }
    }
  });

  let result = applyWithExclusions(masterLatex, edits, excluded);

  // Pass 2 — semantic fact check on what survived.
  const fc = await factCheck({ masterText, factsText, changes: result.records });
  let flagged = false;
  for (const f of fc.findings) {
    if (!f.supported && result.records[f.changeIndex]?.status === "applied") {
      excluded.set(f.changeIndex, `Reverted by fact check: ${f.issue}`);
      flagged = true;
    }
  }
  if (flagged) result = applyWithExclusions(masterLatex, edits, excluded);

  // Pass 3 — whole-document deterministic check (catches interactions between edits).
  const issues = validateDeterministic({ masterLatex, tailoredLatex: result.latex, factsText, analysis, rules });
  if (issues.some((i) => i.code === "protected_section")) {
    edits.forEach((e, i) => {
      if (e.kind === "remove" && result.records[i]?.status === "applied")
        excluded.set(i, "Reverted: removed a protected section.");
    });
    result = applyWithExclusions(masterLatex, edits, excluded);
  }
  return result;
}

function applyWithExclusions(masterLatex: string, edits: ProposedEdit[], excluded: Map<number, string>) {
  const keepIdx = edits.map((_, i) => i).filter((i) => !excluded.has(i));
  const { latex, records: kept } = applyEdits(masterLatex, keepIdx.map((i) => edits[i]));
  const records: ChangeRecord[] = edits.map((e, i) => {
    const k = keepIdx.indexOf(i);
    if (k !== -1) return kept[k];
    return {
      kind: e.kind,
      before: e.find,
      after: e.replace,
      reason: e.reason,
      evidence: e.evidence,
      status: "rejected",
      rejectReason: excluded.get(i),
    };
  });
  return { latex, records };
}

// --------------------------------------------------------------- compile

async function nextVersionNumber(tailoredId: string) {
  const last = await prisma.resumeVersion.findFirst({
    where: { tailoredId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

async function saveVersion(tailoredId: string, latex: string, origin: string, note: string, res: CompileResult) {
  const number = await nextVersionNumber(tailoredId);
  const v = await prisma.resumeVersion.create({
    data: {
      tailoredId,
      number,
      latex,
      origin,
      note,
      compileOk: res.ok,
      compileLog: res.log,
      pageCount: res.pageCount ?? null,
    },
  });
  if (res.ok && res.pdf) {
    await prisma.resumePdf.create({ data: { versionId: v.id, data: new Uint8Array(res.pdf) } });
    return prisma.resumeVersion.update({ where: { id: v.id }, data: { hasPdf: true } });
  }
  return v;
}

const MAX_REPAIRS = 2;

/** Compile; on failure ask Claude for syntax-only fixes (body only), up to MAX_REPAIRS. */
async function compileWithRepair(tailoredId: string, latex: string, origin: string, note: string) {
  let current = latex;
  let result = await compileLatex(current);
  await saveVersion(tailoredId, current, origin, note, result);
  let repairs = 0;

  while (!result.ok && repairs < MAX_REPAIRS && result.engine !== "none") {
    repairs++;
    const doc = splitDocument(current);
    const fix = await proposeLatexFix({
      body: doc.body,
      preamble: doc.preamble,
      error: result.error?.message ?? "unknown",
      log: result.log,
    });
    const before = latexToText(current);
    const { latex: fixed } = applyEdits(
      current,
      fix.edits.map((e) => ({ ...e, kind: "other" as const, reason: fix.diagnosis, evidence: "" })),
    );
    if (fixed === current) break;
    // A syntax fix must not change wording.
    if (Math.abs(latexToText(fixed).length - before.length) > 200) break;
    current = fixed;
    result = await compileLatex(current);
    await saveVersion(tailoredId, current, "autofix", `Auto-fix: ${fix.diagnosis}`.slice(0, 300), result);
  }
  return { latex: current, result, repairs };
}

// ------------------------------------------------------------ validation

function buildValidation(input: {
  masterLatex: string;
  latex: string;
  factsText: string;
  analysis: JobAnalysis | null;
  rules: import("./types").TailoringRules;
  compile: CompileResult;
}): ValidationReport {
  const issues: ValidationIssue[] = validateDeterministic({
    masterLatex: input.masterLatex,
    tailoredLatex: input.latex,
    factsText: input.factsText,
    analysis: input.analysis,
    rules: input.rules,
  });
  if (!input.compile.ok) {
    issues.push({
      severity: "error",
      code: "compile_failed",
      message: `LaTeX did not compile: ${input.compile.error?.message ?? "see log"}`,
      detail: input.compile.error?.line ? `Line ${input.compile.error.line}` : undefined,
    });
  } else if ((input.compile.pageCount ?? 0) > input.rules.maxPages) {
    issues.push({
      severity: "warning",
      code: "page_count",
      message: `Resume is ${input.compile.pageCount} pages; your target is ${input.rules.maxPages}.`,
    });
  }
  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    checkedAt: new Date().toISOString(),
  };
}

function buildMatch(masterLatex: string, latex: string, factsText: string, analysis: JobAnalysis): MatchReport {
  const masterText = latexToText(masterLatex);
  return buildMatchReport(masterText, latexToText(latex), `${masterText}\n${factsText}`, analysis);
}

// ----------------------------------------------------- user edits & approval

/** Save a user-edited LaTeX source as a new version, compile and re-validate. */
export async function saveUserEdit(userId: string, tailoredId: string, latex: string, note: string) {
  const t = await prisma.tailoredResume.findFirstOrThrow({ where: { id: tailoredId, userId }, include: { job: true } });
  // Users may edit the whole document, but compile guards still apply.
  splitDocument(latex); // throws on malformed documents
  const profile = await getProfile(userId);
  const factsText = approvedFactsText(profile.facts);
  const analysis = parseJson<JobAnalysis | null>(t.job.analysis, null);

  const result = await compileLatex(latex);
  const version = await saveVersion(tailoredId, latex, "user", note || "Edited in LaTeX editor", result);
  const validation = buildValidation({
    masterLatex: t.masterSnapshot,
    latex,
    factsText,
    analysis,
    rules: profile.rules,
    compile: result,
  });
  const match = analysis ? buildMatch(t.masterSnapshot, latex, factsText, analysis) : null;
  await prisma.tailoredResume.update({
    where: { id: tailoredId },
    data: {
      validation: JSON.stringify(validation),
      ...(match && { match: JSON.stringify(match) }),
      status: t.status === "approved" ? "ready" : t.status === "failed" ? "ready" : t.status,
    },
  });
  return { version, validation, compile: { ok: result.ok, error: result.error, engine: result.engine } };
}

export async function latestVersion(tailoredId: string) {
  return prisma.resumeVersion.findFirst({ where: { tailoredId }, orderBy: { number: "desc" } });
}

/**
 * Approve the latest version. Validation errors block approval unless the
 * user explicitly confirms the content is accurate (they are the authority on
 * their own background — e.g. a skill they haven't added as a fact yet).
 */
export async function approveTailored(userId: string, tailoredId: string, opts: { override?: boolean } = {}) {
  const t = await prisma.tailoredResume.findFirstOrThrow({ where: { id: tailoredId, userId }, include: { job: true } });
  const v = await latestVersion(tailoredId);
  if (!v) throw new Error("Nothing to approve yet.");
  if (!v.compileOk || !v.hasPdf) throw new Error("The latest version did not compile. Fix it before approving.");
  const validation = parseJson<ValidationReport | null>(t.validation, null);
  if (validation && !validation.ok && !opts.override) {
    throw new Error("Validation found errors. Fix them, or confirm the content is accurate to approve anyway.");
  }

  await setStep(tailoredId, "approve", "done", `Approved v${v.number}${opts.override ? " (user confirmed accuracy)" : ""}`);
  const app = await submitVersion({
    userId,
    tailoredId,
    jobId: t.jobId,
    jobUrl: t.job.url,
    channelId: t.job.channel,
    versionId: v.id,
    note: opts.override ? "Approved with validation warnings confirmed by user." : "",
  });
  await prisma.tailoredResume.update({ where: { id: tailoredId }, data: { status: "approved" } });
  return app;
}

async function submitVersion(p: {
  userId: string;
  tailoredId: string;
  jobId: string;
  jobUrl: string;
  channelId: string;
  versionId: string;
  note: string;
}) {
  const channel = getChannel(p.channelId);
  // One application per tailored resume; re-approval re-points it to the new version.
  const existing = await prisma.application.findFirst({
    where: { version: { tailoredId: p.tailoredId }, status: { not: "submitted" } },
  });
  const app = existing
    ? await prisma.application.update({
        where: { id: existing.id },
        data: { versionId: p.versionId, channel: channel.id, reviewReason: "" },
      })
    : await prisma.application.create({
        data: { userId: p.userId, jobId: p.jobId, versionId: p.versionId, channel: channel.id, notes: p.note },
      });

  await setStep(p.tailoredId, "submit", "running");
  if (channel.canAutoSubmit) {
    const row = await prisma.resumePdf.findUnique({ where: { versionId: p.versionId } });
    const pdf = row ? Buffer.from(row.data) : null;
    const res = pdf
      ? await channel.submit({ applicationId: app.id, jobUrl: p.jobUrl, pdf, fileName: "resume.pdf" })
      : { ok: false as const, error: "PDF missing" };
    if (res.ok) {
      await prisma.application.update({
        where: { id: app.id },
        data: { status: "submitted", submittedAt: new Date(), notes: res.reference ?? p.note },
      });
      await setStep(p.tailoredId, "submit", "done", `Submitted via ${channel.label}`);
    } else {
      await prisma.application.update({ where: { id: app.id }, data: { status: "ready_manual", reviewReason: res.error } });
      await setStep(p.tailoredId, "submit", "error", res.error);
    }
  } else {
    await prisma.application.update({ where: { id: app.id }, data: { status: "ready_manual" } });
    await setStep(p.tailoredId, "submit", "done", "Ready for manual submission (download the PDF)");
  }
  await setStep(p.tailoredId, "save", "done", `Linked to application ${app.id.slice(-6)}`);
  return prisma.application.findUniqueOrThrow({ where: { id: app.id } });
}

async function finishAuto(id: string, validation: ValidationReport) {
  const t = await prisma.tailoredResume.findUniqueOrThrow({ where: { id }, include: { job: true } });
  const { autoApply } = await getProfile(t.userId);
  const v = await latestVersion(id);
  if (!v) throw new Error("No version produced.");
  const channel = getChannel(t.job.channel);
  const warnings = validation.issues.some((i) => i.severity === "warning");

  const reasons: string[] = [];
  if (!validation.ok) reasons.push("validation found errors");
  if (!v.compileOk) reasons.push("PDF did not compile");
  if (autoApply.review === "always") reasons.push("your settings require review of every application");
  if (autoApply.review === "on_warnings" && warnings) reasons.push("validation produced warnings");
  if (!channel.canAutoSubmit) reasons.push(`"${channel.label}" requires you to submit yourself`);

  const autoSubmit = validation.ok && v.compileOk && v.hasPdf && autoApply.review !== "always" &&
    !(autoApply.review === "on_warnings" && warnings) && channel.canAutoSubmit;

  if (autoSubmit) {
    await setStep(id, "approve", "done", "Auto-approved by your rules");
    await submitVersion({
      userId: t.userId,
      tailoredId: id,
      jobId: t.jobId,
      jobUrl: t.job.url,
      channelId: t.job.channel,
      versionId: v.id,
      note: "Auto-applied",
    });
    await prisma.tailoredResume.update({ where: { id }, data: { status: "approved" } });
    return;
  }

  await prisma.application.create({
    data: {
      userId: t.userId,
      jobId: t.jobId,
      versionId: v.id,
      channel: channel.id,
      status: "awaiting_approval",
      reviewReason: reasons.join("; "),
    },
  });
  await prisma.tailoredResume.update({ where: { id }, data: { status: "needs_review" } });
  await setStep(id, "approve", "running", `In approval queue: ${reasons.join("; ")}`);
}
