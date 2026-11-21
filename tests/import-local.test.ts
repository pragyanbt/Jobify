import { exec } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Imports a COPY of the real local SQLite data (if present) into Postgres, and
// checks the RLS lockdown script runs. Skipped when there's no local data.

const SRC = path.resolve("data/jobify.db");
const PORT = 54330;
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
process.env.DATABASE_URL = URL;
process.env.DIRECT_URL = URL;
const tmp = mkdtempSync(path.join(os.tmpdir(), "jobify-import-"));
process.env.JOBIFY_LOCAL_DB = path.join(tmp, "jobify.db");

let pg: PGlite;
let server: PGLiteSocketServer;

describe.skipIf(!existsSync(SRC))("import local data", () => {
  beforeAll(async () => {
    copyFileSync(SRC, process.env.JOBIFY_LOCAL_DB!);
    pg = await PGlite.create();
    server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
    await server.start();
    await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
  }, 180_000);

  afterAll(async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.$disconnect();
    await server?.stop();
    await pg?.close();
  });

  it("moves everything into the user's account and retires the local file", async () => {
    const { prisma } = await import("@/lib/db");
    const { importLocalData, localDataSummary } = await import("@/lib/importLocal");
    await prisma.profile.create({ data: { id: "u1", email: "a@example.com" } });
    const before = await localDataSummary();
    expect(before).not.toBeNull();

    const res = await importLocalData("u1");
    expect(res).toEqual(before);
    expect(await prisma.masterResume.count({ where: { userId: "u1" } })).toBe(before!.masters);
    expect(await prisma.job.count({ where: { userId: "u1" } })).toBe(before!.jobs);
    expect(await prisma.application.count({ where: { userId: "u1" } })).toBe(before!.applications);
    const withPdf = await prisma.resumeVersion.count({ where: { hasPdf: true } });
    expect(await prisma.resumePdf.count()).toBe(withPdf);
    const p = await prisma.profile.findUniqueOrThrow({ where: { id: "u1" } });
    expect(JSON.parse(p.jobSearch).keywords?.length ?? 0).toBeGreaterThan(0);
    // Local file renamed so it can't be imported into a second account.
    expect(existsSync(process.env.JOBIFY_LOCAL_DB!)).toBe(false);
    expect(readdirSync(tmp).some((f) => f.startsWith("jobify.db.imported-"))).toBe(true);
    expect(await localDataSummary()).toBeNull();
  }, 120_000);

  it("RLS lockdown script runs", async () => {
    await pg.exec("create role anon; create role authenticated;");
    await pg.exec(readFileSync("prisma/rls.sql", "utf8"));
    const r = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('Profile','Job','MasterResume','TailoredResume','ResumeVersion','ResumePdf','Application')",
    );
    expect(r.rows).toHaveLength(7);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
});
