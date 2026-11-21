import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { JobAnalysis } from "@/lib/types";

// End-to-end pipeline test with Claude mocked: real Postgres (PGlite, in
// memory, served over a local socket so Prisma connects exactly as it does to
// Supabase), real LaTeX compile (needs tectonic or pdflatex), real validation.

const PORT = 54329;
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
process.env.DATABASE_URL = URL;
process.env.DIRECT_URL = URL;
const USER = "user-a";
const OTHER = "user-b";

const MASTER = String.raw`\documentclass{article}
\usepackage{enumitem}
\newcommand{\expheader}[2]{\textbf{#1}\hfill #2}
\begin{document}
\section{Summary}
Backend developer building services in Java and Spring Boot.
\section{Skills}
\textbf{Languages:} Python, Java, SQL
\section{Experience}
\expheader{Acme}{2020 -- 2023}
\begin{itemize}
\item Built REST APIs with Spring Boot.
\item Improved query performance by 40\% on PostgreSQL.
\end{itemize}
\section{Education}
B.S. Computer Science
\end{document}
`;

const ANALYSIS: JobAnalysis = {
  title: "Backend Engineer",
  company: "Initech",
  seniority: "Mid",
  summary: "Build APIs.",
  requiredSkills: [
    { name: "Java", aliases: [] },
    { name: "Spring Boot", aliases: [] },
    { name: "Kubernetes", aliases: ["k8s"] },
  ],
  preferredSkills: [{ name: "PostgreSQL", aliases: ["Postgres"] }],
  atsKeywords: [{ name: "REST APIs", aliases: ["REST"], importance: 2 }, { name: "backend", aliases: [], importance: 1 }],
  qualifications: [{ text: "BS in CS", required: true, kind: "education" }],
  minYearsExperience: 3,
  responsibilities: ["Build APIs"],
};

vi.mock("@/lib/ai/operations", () => ({
  analyzeJob: vi.fn(async () => ANALYSIS),
  proposeTailoring: vi.fn(async () => ({
    summaryOfChanges: "Reordered skills and sharpened the summary.",
    edits: [
      { kind: "skills", find: "Python, Java, SQL", replace: "Java, SQL, Python", reason: "Java first", evidence: "Python, Java, SQL" },
      // Fabricated skill → must be reverted deterministically.
      { kind: "summary", find: "Backend developer building services in Java and Spring Boot.", replace: "Backend engineer building Java and Spring Boot services on Kubernetes.", reason: "k8s", evidence: "" },
      // Fabricated metric → must be reverted deterministically.
      { kind: "bullet", find: "by 40\\% on PostgreSQL", replace: "by 75\\% on PostgreSQL", reason: "", evidence: "" },
      // Supported rewording, but the (mocked) fact-check flags it as overstated.
      { kind: "bullet", find: "Built REST APIs with Spring Boot.", replace: "Architected the company's REST APIs with Spring Boot.", reason: "", evidence: "" },
      // Fine edit; bare & must be escaped automatically.
      { kind: "other", find: "B.S. Computer Science", replace: "B.S. Computer Science & Engineering coursework", reason: "", evidence: "" },
    ],
  })),
  factCheck: vi.fn(async ({ changes }: { changes: { after: string; status: string }[] }) => ({
    findings: changes
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.status === "applied")
      .map(({ c, i }) => ({
        changeIndex: i,
        supported: !c.after.includes("Architected"),
        issue: c.after.includes("Architected") ? "Overstates scope: 'Architected the company's'" : "",
      })),
  })),
  proposeLatexFix: vi.fn(async () => ({ diagnosis: "none", edits: [] })),
  extractFacts: vi.fn(),
  importPlainText: vi.fn(),
}));

let prisma: typeof import("@/lib/db").prisma;
let pipeline: typeof import("@/lib/pipeline");
let profile: typeof import("@/lib/profile");

let server: PGLiteSocketServer;
let pg: PGlite;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
  await server.start();
  // Async: the database is served from this process, so don't block it.
  await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL } });
  prisma = (await import("@/lib/db")).prisma;
  pipeline = await import("@/lib/pipeline");
  profile = await import("@/lib/profile");
  await prisma.masterResume.create({ data: { userId: USER, name: "Main", latex: MASTER, isDefault: true } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await pg?.close();
});

async function newJob(userId = USER) {
  return prisma.job.create({
    data: { userId, title: "Backend Engineer", company: "Initech", description: "Java, Spring Boot, Kubernetes ..." },
  });
}

describe("tailoring pipeline", () => {
  it("tailors truthfully, compiles, validates, and goes to the approval queue in auto mode", async () => {
    await profile.saveProfile(USER, {
      autoApply: { enabled: true, minBaseScore: 0, review: "always", dailyLimit: 5, autoSubmit: false, consentAt: null },
    });
    const job = await newJob();
    const id = await pipeline.startTailoring(USER, job.id, "auto");
    const t = await prisma.tailoredResume.findUniqueOrThrow({ where: { id }, include: { versions: true } });

    expect(t.error).toBeNull();
    expect(t.status).toBe("needs_review");

    const changes = JSON.parse(t.changes) as { status: string; rejectReason?: string; after: string }[];
    expect(changes.map((c) => c.status)).toEqual(["applied", "rejected", "rejected", "rejected", "applied"]);
    expect(changes[1].rejectReason).toContain("Kubernetes");
    expect(changes[2].rejectReason).toContain("75%");
    expect(changes[3].rejectReason).toContain("fact check");
    expect(changes[4].after).toContain("\\&");

    const v = t.versions[0];
    expect(v.compileOk).toBe(true);
    expect(v.hasPdf).toBe(true);
    const pdf = await prisma.resumePdf.findUniqueOrThrow({ where: { versionId: v.id } });
    expect(Buffer.from(pdf.data).subarray(0, 5).toString()).toBe("%PDF-");
    expect(v.latex).toContain("Java, SQL, Python");
    expect(v.latex).not.toContain("Kubernetes");
    expect(v.latex).not.toContain("75");
    // Master is never modified.
    const master = await prisma.masterResume.findFirstOrThrow();
    expect(master.latex).toBe(MASTER);

    const validation = JSON.parse(t.validation!);
    expect(validation.ok).toBe(true);
    const match = JSON.parse(t.match!);
    expect(match.missing).toContain("Kubernetes");

    const app = await prisma.application.findFirstOrThrow({ where: { jobId: job.id } });
    expect(app.userId).toBe(USER);
    expect(app.status).toBe("awaiting_approval");
    expect(app.versionId).toBe(v.id);
    expect(app.reviewReason).toContain("review of every application");

    // Approve → manual channel → ready for manual submission, linked to exact version.
    const approved = await pipeline.approveTailored(USER, id);
    expect(approved.id).toBe(app.id);
    expect(approved.status).toBe("ready_manual");
  }, 120_000);

  it("user edits create new versions and fabrications are flagged; approval needs override", async () => {
    const job = await newJob();
    const id = await pipeline.startTailoring(USER, job.id, "auto");
    const v1 = (await pipeline.latestVersion(id))!;

    const edited = v1.latex.replace("Java, SQL, Python", "Java, SQL, Python, Kubernetes");
    const out = await pipeline.saveUserEdit(USER, id, edited, "add k8s");
    expect(out.version.number).toBe(2);
    expect(out.version.origin).toBe("user");
    expect(out.validation.ok).toBe(false);
    expect(out.validation.issues.some((i) => i.code === "unsupported_skill")).toBe(true);

    await expect(pipeline.approveTailored(USER, id)).rejects.toThrow(/Validation found errors/);
    const app = await pipeline.approveTailored(USER, id, { override: true });
    expect(app.versionId).toBe(out.version.id);

    // Adding it as an approved fact makes it valid evidence.
    await profile.saveProfile(USER, {
      facts: [{ id: "f1", category: "skill", text: "Kubernetes", approved: true, source: "user" }],
    });
    const out2 = await pipeline.saveUserEdit(USER, id, edited, "same, now with fact");
    expect(out2.validation.ok).toBe(true);
  }, 120_000);

  it("broken LaTeX from a user edit is saved but marked as not compiling", async () => {
    const job = await newJob();
    const id = await pipeline.startTailoring(USER, job.id, "auto");
    const v1 = (await pipeline.latestVersion(id))!;
    const out = await pipeline.saveUserEdit(USER, id, v1.latex.replace("\\section{Skills}", "\\section{Skills"), "oops");
    expect(out.compile.ok).toBe(false);
    expect(out.validation.issues.some((i) => i.code === "compile_failed")).toBe(true);
    await expect(pipeline.approveTailored(USER, id)).rejects.toThrow(/did not compile/);
  }, 120_000);

  it("keeps users' data separate", async () => {
    const job = await newJob();
    const id = await pipeline.startTailoring(USER, job.id, "auto");
    // Another user can't tailor, edit, approve or analyze someone else's data.
    await expect(pipeline.startTailoring(OTHER, job.id, "manual")).rejects.toThrow();
    await expect(pipeline.saveUserEdit(OTHER, id, MASTER, "x")).rejects.toThrow();
    await expect(pipeline.approveTailored(OTHER, id)).rejects.toThrow();
    await expect(pipeline.ensureAnalysis(OTHER, job.id)).rejects.toThrow();
    // And their own tailoring can't use another user's master resume.
    const theirJob = await newJob(OTHER);
    await expect(pipeline.startTailoring(OTHER, theirJob.id, "manual")).rejects.toThrow(/master resume/);
    const profileB = await profile.getProfile(OTHER);
    expect(profileB.facts).toEqual([]);
  }, 120_000);
});
