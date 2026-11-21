import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// "Did you apply?" → POST /api/jobs/[id]/applied, against real Postgres (PGlite).

const PORT = 54331;
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
process.env.DATABASE_URL = URL;
process.env.DIRECT_URL = URL;

const session = { id: "user-a", email: "a@example.com", role: "user" as const, status: "active" as const };
vi.mock("@/lib/auth", () => ({
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error { code = "forbidden"; },
  requireUser: async () => session,
}));

let prisma: typeof import("@/lib/db").prisma;
let POST: typeof import("@/app/api/jobs/[id]/applied/route").POST;
let server: PGLiteSocketServer;
let pg: PGlite;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
  await server.start();
  await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
  prisma = (await import("@/lib/db")).prisma;
  POST = (await import("@/app/api/jobs/[id]/applied/route")).POST;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await pg?.close();
});

const call = (id: string) => POST(new Request(`http://x/api/jobs/${id}/applied`, { method: "POST" }), { params: Promise.resolve({ id }) });
const newJob = (userId = session.id) =>
  prisma.job.create({ data: { userId, title: "Backend Engineer", company: "Initech", description: "Java and Spring" } });

describe("mark job as applied", () => {
  it("creates an external, submitted application without a resume version, idempotently", async () => {
    const job = await newJob();
    const r1 = await call(job.id);
    expect(r1.status).toBe(201);
    const r2 = await call(job.id);
    expect(r2.status).toBe(200);
    const apps = await prisma.application.findMany({ where: { jobId: job.id } });
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ status: "submitted", channel: "external", versionId: null, userId: session.id });
    expect(apps[0].submittedAt).toBeInstanceOf(Date);
  });

  it("marks a ready-to-submit Jobify application as submitted, keeping its resume version", async () => {
    const job = await newJob();
    const master = await prisma.masterResume.create({ data: { userId: session.id, name: "M", latex: "x" } });
    const t = await prisma.tailoredResume.create({ data: { userId: session.id, jobId: job.id, masterId: master.id, masterSnapshot: "x" } });
    const v = await prisma.resumeVersion.create({ data: { tailoredId: t.id, number: 1, latex: "x", origin: "ai" } });
    await prisma.application.create({ data: { userId: session.id, jobId: job.id, versionId: v.id, status: "ready_manual" } });

    expect((await call(job.id)).status).toBe(200);
    const apps = await prisma.application.findMany({ where: { jobId: job.id } });
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ status: "submitted", versionId: v.id, channel: "manual" });
  });

  it("refuses another user's job", async () => {
    const job = await newJob("user-b");
    expect((await call(job.id)).status).toBe(404);
    expect(await prisma.application.count({ where: { jobId: job.id } })).toBe(0);
  });
});
