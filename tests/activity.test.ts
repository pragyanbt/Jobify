import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Autopilot progress for the Chat tab. Real Postgres (PGlite).

const { PORT } = vi.hoisted(() => {
  const PORT = 54336;
  const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
  process.env.DATABASE_URL = URL;
  process.env.DIRECT_URL = URL;
  return { PORT };
});

let prisma: typeof import("@/lib/db").prisma;
let getAutopilotActivity: typeof import("@/lib/autopilotActivity").getAutopilotActivity;
let server: PGLiteSocketServer;
let pg: PGlite;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
  await server.start();
  await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
  prisma = (await import("@/lib/db")).prisma;
  getAutopilotActivity = (await import("@/lib/autopilotActivity")).getAutopilotActivity;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await pg?.close();
});

describe("Autopilot activity", () => {
  it("shows each job's latest stage: tailoring, submitted, needs you; only for this user", async () => {
    const U = "u-act";
    const master = await prisma.masterResume.create({ data: { userId: U, name: "M", latex: "x" } });
    const job = (title: string) => prisma.job.create({ data: { userId: U, title, company: "Acme", description: "x", url: "https://x" } });

    const a = await job("Tailoring Job");
    await prisma.tailoredResume.create({
      data: {
        userId: U, jobId: a.id, masterId: master.id, masterSnapshot: "x", mode: "auto", status: "tailoring",
        steps: JSON.stringify([
          { key: "retrieve", label: "Retrieve", status: "done" },
          { key: "analyze", label: "Analyze", status: "done" },
          { key: "tailor", label: "Generate tailored resume", status: "running" },
          { key: "compile", label: "Compile", status: "pending" },
        ]),
      },
    });

    const b = await job("Submitted Job");
    await prisma.tailoredResume.create({ data: { userId: U, jobId: b.id, masterId: master.id, masterSnapshot: "x", mode: "auto", status: "approved" } });
    await prisma.applicationDraft.create({ data: { userId: U, jobId: b.id, formSource: "standard", questions: "[]", answers: "[]", submitStatus: "submitted", submitNote: "Employer confirmed." } });

    const c = await job("Blocked Job");
    await prisma.applicationDraft.create({ data: { userId: U, jobId: c.id, formSource: "standard", questions: "[]", answers: "[]", submitStatus: "needs_you", submitNote: "This form has a CAPTCHA." } });

    const other = await prisma.job.create({ data: { userId: "someone-else", title: "Secret", company: "X", description: "x" } });
    await prisma.applicationDraft.create({ data: { userId: "someone-else", jobId: other.id, formSource: "standard", questions: "[]", answers: "[]", submitStatus: "queued" } });

    const { running, items } = await getAutopilotActivity(U);
    expect(running).toBe(true);
    const by = (t: string) => items.find((i) => i.title === t)!;
    expect(by("Tailoring Job")).toMatchObject({ state: "running", label: "Tailoring your resume", detail: "Generate tailored resume" });
    expect(by("Tailoring Job").progress).toBeCloseTo(0.3);
    expect(by("Submitted Job")).toMatchObject({ state: "done", label: "Submitted", progress: 1 }); // draft is newer than the run
    expect(by("Blocked Job")).toMatchObject({ state: "needs_you", detail: "This form has a CAPTCHA." });
    expect(items.find((i) => i.title === "Secret")).toBeUndefined();
  });
});
