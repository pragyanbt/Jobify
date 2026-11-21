import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { answerFromProfile, normalizeGreenhouse, STANDARD_QUESTIONS, type FormQuestion } from "@/lib/applicationForm";
import { DEFAULT_SELF_ID, EMPTY_APPLICATION_PROFILE, type ApplicationProfile } from "@/lib/applyProfile";

// Application forms: Greenhouse normalization, profile answers (no AI), and
// prepareApplication end-to-end with Claude mocked. Real Postgres (PGlite).

// Hoisted above the imports: applyProfile imports the Prisma client, which reads DATABASE_URL on load.
const { PORT } = vi.hoisted(() => {
  const PORT = 54333;
  const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
  process.env.DATABASE_URL = URL;
  process.env.DIRECT_URL = URL;
  return { PORT };
});

const draftAnswers = vi.fn();
vi.mock("@/lib/ai/operations", () => ({ draftApplicationAnswers: (...a: unknown[]) => draftAnswers(...a) }));

const gh = normalizeGreenhouse(JSON.parse(readFileSync("tests/fixtures/greenhouse-questions.json", "utf8")));
const q = (id: string) => gh.find((x) => x.id === id)!;
const P: ApplicationProfile = {
  ...EMPTY_APPLICATION_PROFILE,
  firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+1 555 0100",
  city: "Dallas", state: "TX", country: "United States", workAuthorized: "yes", needsSponsorship: "no",
};

describe("Greenhouse form normalization", () => {
  it("reads questions, skips hidden fields, and files EEO questions under self-identification", () => {
    expect(gh.map((x) => x.id)).toEqual(expect.arrayContaining(["first_name", "email", "resume", "question_68935510", "location", "veteran_status", "race", "gender"]));
    expect(gh.find((x) => x.id === "latitude")).toBeUndefined();
    expect(q("resume")).toMatchObject({ kind: "file", section: "attachments" });
    expect(q("question_68935510").kind).toBe("multiselect");
    expect(q("gender").section).toBe("self_id");
    expect(q("veteran_status").label).toBe("Veteran status");
    const whatsapp = gh.find((x) => /WhatsApp/.test(x.label))!;
    expect(whatsapp.section).toBe("consent");
    const sponsor = gh.find((x) => /sponsor/i.test(x.label))!;
    expect(sponsor.section).toBe("eligibility");
  });
});

describe("answers from the application profile", () => {
  it("fills contact details and eligibility, picking the matching option", () => {
    expect(answerFromProfile(q("first_name"), P, DEFAULT_SELF_ID)).toMatchObject({ value: "Ada", source: "profile" });
    const sponsor = gh.find((x) => /sponsor/i.test(x.label))!;
    const a = answerFromProfile(sponsor, P, DEFAULT_SELF_ID)!;
    expect(sponsor.options!.find((o) => o.value === a.value)!.label).toMatch(/^No/);
    const city = gh.find((x) => /city and state/i.test(x.label))!;
    expect(answerFromProfile(city, P, DEFAULT_SELF_ID)!.value).toBe("Dallas, TX");
  });

  it("declines self-identification unless opted in, and never agrees to consent questions", () => {
    const g = answerFromProfile(q("gender"), P, DEFAULT_SELF_ID)!;
    expect(g.source).toBe("decline");
    expect(q("gender").options!.find((o) => o.value === g.value)!.label).toMatch(/decline/i);
    const opted = answerFromProfile(q("gender"), P, { ...DEFAULT_SELF_ID, optIn: true, gender: "Female" })!;
    expect(q("gender").options!.find((o) => o.value === opted.value)!.label).toBe("Female");
    const whatsapp = gh.find((x) => /WhatsApp/.test(x.label))!;
    expect(answerFromProfile(whatsapp, P, DEFAULT_SELF_ID)).toMatchObject({ value: "", source: "needs_you" });
  });

  it("asks the user when the profile is empty, and leaves employer questions to the resume step", () => {
    expect(answerFromProfile(q("phone"), EMPTY_APPLICATION_PROFILE, DEFAULT_SELF_ID)!.source).toBe("needs_you");
    expect(answerFromProfile(q("resume"), P, DEFAULT_SELF_ID)).toMatchObject({ source: "attachment" });
    const employer = gh.find((x) => /ever been employed by/i.test(x.label))!;
    expect(answerFromProfile(employer, P, DEFAULT_SELF_ID)).toBeNull();
  });
});

describe("prepareApplication", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let lib: typeof import("@/lib/prepareApplication");
  let server: PGLiteSocketServer;
  let pg: PGlite;

  beforeAll(async () => {
    pg = await PGlite.create();
    server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
    await server.start();
    await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
    prisma = (await import("@/lib/db")).prisma;
    lib = await import("@/lib/prepareApplication");
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await server?.stop();
    await pg?.close();
  });

  it("sends only resume questions to Claude, maps its answers, and keeps unknowns for the user", async () => {
    const userId = "u1";
    await prisma.profile.create({ data: { id: userId, applicationProfile: JSON.stringify(P) } });
    await prisma.masterResume.create({ data: { userId, name: "Main", isDefault: true, latex: "\\documentclass{article}\\begin{document}Ada Lovelace. Software Engineer at Initech, 2020--2024. Java, Spring.\\end{document}" } });
    const job = await prisma.job.create({ data: { userId, title: "Backend Engineer", company: "Acme", description: "Java services" } });

    draftAnswers.mockImplementationOnce(async ({ questions }: { questions: FormQuestion[] }) => ({
      answers: questions.map((x) =>
        x.id === "current_company" ? { id: x.id, basis: "resume", text: "Initech", options: [], note: "From your resume" }
        : x.id === "why_interested" ? { id: x.id, basis: "drafted", text: "I build Java services…", options: [], note: "" }
        : { id: x.id, basis: "unknown", text: "", options: [], note: "Not in your resume" }),
    }));

    const d = await lib.prepareApplication(userId, job.id);
    const sent = (draftAnswers.mock.calls[0][0] as { questions: { id: string }[] }).questions.map((x) => x.id);
    // Contact details, eligibility, self-ID, consent and files never reach Claude.
    for (const id of ["first_name", "email", "phone", "work_authorized", "sponsorship", "gender", "race", "veteran_status", "resume"]) {
      expect(sent).not.toContain(id);
    }
    expect(sent).toEqual(expect.arrayContaining(["current_company", "why_interested"]));

    const by = (id: string) => d.answers.find((a) => a.questionId === id)!;
    expect(d.formSource).toBe("standard");
    expect(by("first_name")).toMatchObject({ value: "Ada", source: "profile" });
    expect(by("sponsorship")).toMatchObject({ value: "no", source: "profile" });
    expect(by("current_company")).toMatchObject({ value: "Initech", source: "resume" });
    expect(by("why_interested").source).toBe("drafted");
    expect(by("current_title")).toMatchObject({ value: "", source: "needs_you" });
    expect(by("gender")).toMatchObject({ value: "decline", source: "decline" });
    expect(d.answers).toHaveLength(STANDARD_QUESTIONS.length);
  });

  it("saves the user's edits and drops answers to unknown questions", async () => {
    const job = await prisma.job.findFirstOrThrow({ where: { userId: "u1" } });
    const d = await lib.saveDraft("u1", job.id, [
      { questionId: "current_title", value: "Software Engineer", source: "user" },
      { questionId: "made_up", value: "x", source: "user" },
    ], "reviewed");
    expect(d!.status).toBe("reviewed");
    expect(d!.answers.map((a) => a.questionId)).toEqual(["current_title"]);
  });

  it("can't prepare another user's job", async () => {
    const other = await prisma.job.create({ data: { userId: "u2", title: "X", company: "Y", description: "z" } });
    await expect(lib.prepareApplication("u1", other.id)).rejects.toThrow();
  });
});
