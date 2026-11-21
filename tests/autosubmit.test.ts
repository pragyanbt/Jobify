import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { answerFromProfile, normalizeGreenhouse } from "@/lib/applicationForm";
import { DEFAULT_SELF_ID, EMPTY_APPLICATION_PROFILE } from "@/lib/applyProfile";
import type { DraftAnswer, FormQuestion } from "@/lib/applicationTypes";

// Fully automatic applying: consent answers, the submit queue, and extension keys.
// Real Postgres (PGlite); no Claude calls (applications are inserted directly).

const { PORT } = vi.hoisted(() => {
  const PORT = 54335;
  const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
  process.env.DATABASE_URL = URL;
  process.env.DIRECT_URL = URL;
  return { PORT };
});

// No Claude calls and no real tailoring runs in these tests.
const startTailoring = vi.fn(async () => "tailored-id");
vi.mock("@/lib/pipeline", () => ({ startTailoring: (...a: unknown[]) => startTailoring(...(a as [])) }));
vi.mock("@/lib/ai/operations", () => ({
  draftApplicationAnswers: async ({ questions }: { questions: { id: string }[] }) => ({
    answers: questions.map((q) => ({ id: q.id, basis: "unknown", text: "", options: [], note: "" })),
  }),
}));

const gh = normalizeGreenhouse(JSON.parse(readFileSync("tests/fixtures/greenhouse-questions.json", "utf8")));
const whatsapp = gh.find((q) => /WhatsApp/.test(q.label))!;
const attest: FormQuestion = {
  id: "certify", label: "I certify that the information I have provided is true and complete.", required: true,
  kind: "select", section: "consent", options: [{ label: "I agree", value: "1" }],
};

describe("consent answers", () => {
  it("are left to the user unless auto-submit is authorized", () => {
    expect(answerFromProfile(attest, EMPTY_APPLICATION_PROFILE, DEFAULT_SELF_ID)).toMatchObject({ source: "needs_you" });
  });
  it("confirm required standard statements, and never opt in to marketing", () => {
    const a = answerFromProfile(attest, EMPTY_APPLICATION_PROFILE, DEFAULT_SELF_ID, { authorized: true })!;
    expect(a).toMatchObject({ value: "1", source: "authorized" });
    const w = answerFromProfile(whatsapp, EMPTY_APPLICATION_PROFILE, DEFAULT_SELF_ID, { authorized: true })!;
    expect(whatsapp.options!.find((o) => o.value === w.value)!.label).toMatch(/^No/);
  });
});

describe("submit queue + extension", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let auto: typeof import("@/lib/autoSubmit");
  let ext: typeof import("@/lib/extensionAuth");
  let profile: typeof import("@/lib/profile");
  let server: PGLiteSocketServer;
  let pg: PGlite;
  const U = "auto-user";
  let jobs = 0;

  beforeAll(async () => {
    pg = await PGlite.create();
    server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
    await server.start();
    await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
    prisma = (await import("@/lib/db")).prisma;
    auto = await import("@/lib/autoSubmit");
    ext = await import("@/lib/extensionAuth");
    profile = await import("@/lib/profile");
    await prisma.profile.create({ data: { id: U, email: "a@example.com", status: "active" } });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await server?.stop();
    await pg?.close();
  });

  async function readyDraft(title: string) {
    const n = ++jobs;
    const job = await prisma.job.create({ data: { userId: U, title, company: "Acme", description: "x", url: `https://jobs.lever.co/acme/${n}`, externalKey: `lever:acme:${n}` } });
    const master = await prisma.masterResume.create({ data: { userId: U, name: "M", latex: "x" } });
    const t = await prisma.tailoredResume.create({ data: { userId: U, jobId: job.id, masterId: master.id, masterSnapshot: "x" } });
    const v = await prisma.resumeVersion.create({ data: { tailoredId: t.id, number: 1, latex: "x", origin: "ai", hasPdf: true, compileOk: true } });
    await prisma.resumePdf.create({ data: { versionId: v.id, data: new Uint8Array([37, 80, 68, 70]) } });
    const questions: FormQuestion[] = [
      { id: "first_name", label: "First name", required: true, kind: "text", section: "details" },
      { id: "resume", label: "Resume", required: true, kind: "file", section: "attachments" },
    ];
    const answers: DraftAnswer[] = [
      { questionId: "first_name", value: "Ada", source: "profile" },
      { questionId: "resume", value: "resume", source: "attachment" },
    ];
    await prisma.applicationDraft.create({
      data: { userId: U, jobId: job.id, formSource: "standard", questions: JSON.stringify(questions), answers: JSON.stringify(answers), versionId: v.id },
    });
    return job;
  }

  it("finds missing required answers", () => {
    const q: FormQuestion[] = [{ id: "a", label: "A", required: true, kind: "text", section: "details" }];
    expect(auto.missingRequired(q, [{ questionId: "a", value: "", source: "needs_you" }])).toEqual(["A"]);
    expect(auto.missingRequired(q, [{ questionId: "a", value: "x", source: "user" }])).toEqual([]);
  });

  it("hands out nothing until auto-submit is on and authorized", async () => {
    const job = await readyDraft("Engineer 1");
    expect((await auto.requeueDraft(U, job.id)).queued).toBe(true);
    expect(await auto.claimNext(U)).toBeNull();
    const p = await profile.getProfile(U);
    await profile.saveProfile(U, { autoApply: { ...p.autoApply, enabled: true, autoSubmit: true, consentAt: new Date().toISOString(), dailyLimit: 1 } });
    const task = await auto.claimNext(U);
    expect(task).toMatchObject({ title: "Engineer 1", applyUrl: "https://jobs.lever.co/acme/1/apply" });
    expect(task!.fields.find((f) => f.id === "first_name")!.values).toEqual(["Ada"]);
    expect(task!.fields.find((f) => f.id === "resume")!.resume).toBe(true);
    expect((await auto.taskResume(U, task!.id))!.length).toBe(4);
    // Claimed: not handed out twice.
    expect(await auto.claimNext(U)).toBeNull();
  });

  it("records a submission as applied and respects the daily limit", async () => {
    const d = await prisma.applicationDraft.findFirstOrThrow({ where: { userId: U, submitStatus: "submitting" } });
    await auto.recordResult(U, d.id, { status: "submitted", note: "Confirmed" });
    expect(await prisma.application.count({ where: { jobId: d.jobId, status: "submitted" } })).toBe(1);
    const job2 = await readyDraft("Engineer 2");
    await auto.requeueDraft(U, job2.id);
    expect(await auto.claimNext(U)).toBeNull(); // dailyLimit = 1 already used today
  });

  it("retries claims that never reported back", async () => {
    const p = await profile.getProfile(U);
    await profile.saveProfile(U, { autoApply: { ...p.autoApply, dailyLimit: 10 } });
    const t = await auto.claimNext(U);
    await prisma.applicationDraft.update({ where: { id: t!.id }, data: { claimedAt: new Date(Date.now() - 20 * 60_000) } });
    const again = await auto.claimNext(U);
    expect(again!.id).toBe(t!.id);
  });

  it("authenticates the extension by key, storing only a hash, and blocks paused accounts", async () => {
    const key = await ext.createExtensionToken(U);
    const row = await prisma.extensionToken.findUniqueOrThrow({ where: { userId: U } });
    expect(row.tokenHash).not.toContain(key.slice(4));
    const req = (k: string) => new Request("http://x", { headers: { Authorization: `Bearer ${k}` } });
    expect((await ext.requireExtensionUser(req(key))).id).toBe(U);
    await expect(ext.requireExtensionUser(req("jbx_" + "x".repeat(40)))).rejects.toThrow(/isn't valid/);
    await prisma.profile.update({ where: { id: U }, data: { status: "paused" } });
    await expect(ext.requireExtensionUser(req(key))).rejects.toThrow(/paused/);
  });

  it("Ask Junu to apply: needs Auto-apply on, tailors when needed, and reports what's missing", async () => {
    const V = "ask-user";
    await prisma.profile.create({ data: { id: V, email: "v@example.com", status: "active" } });
    const job = await prisma.job.create({ data: { userId: V, title: "Data Engineer", company: "Initech", description: "x", url: "https://jobs.lever.co/initech/9", externalKey: "lever:initech:9" } });
    await expect(auto.askJunuToApply(V, job.id)).rejects.toThrow(/Turn on Auto-apply/);

    const p = await profile.getProfile(V);
    await profile.saveProfile(V, { autoApply: { ...p.autoApply, enabled: true, autoSubmit: true, consentAt: new Date().toISOString() } });
    // No tailored resume yet: starts tailoring in Autopilot mode.
    expect(await auto.askJunuToApply(V, job.id)).toMatchObject({ status: "tailoring", extensionConnected: false });
    expect(startTailoring).toHaveBeenCalledWith(V, job.id, "auto");

    // With a compiled tailored resume: prepares and queues (or says what Junu needs).
    const master = await prisma.masterResume.create({ data: { userId: V, name: "M", latex: "\\documentclass{article}\\begin{document}Data Engineer\\end{document}" } });
    const t = await prisma.tailoredResume.create({ data: { userId: V, jobId: job.id, masterId: master.id, masterSnapshot: "x", status: "ready" } });
    await prisma.resumeVersion.create({ data: { tailoredId: t.id, number: 1, latex: "x", origin: "ai", hasPdf: true, compileOk: true } });
    const r = await auto.askJunuToApply(V, job.id);
    expect(r.status).toBe("needs_you"); // no application details saved yet
    expect(r.message).toMatch(/First name/);

    await prisma.applicationDraft.update({ where: { jobId: job.id }, data: { submitStatus: "queued" } });
    expect(await auto.askJunuToApply(V, job.id)).toMatchObject({ status: "already" });
  });
});
