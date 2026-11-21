import { exec } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Junu's tools against real Postgres (PGlite). No Claude calls: tools are run directly.

const PORT = 54332;
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
process.env.DATABASE_URL = URL;
process.env.DIRECT_URL = URL;

let prisma: typeof import("@/lib/db").prisma;
let junuTools: typeof import("@/lib/junu/tools").junuTools;
let server: PGLiteSocketServer;
let pg: PGlite;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
  await server.start();
  await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
  prisma = (await import("@/lib/db")).prisma;
  junuTools = (await import("@/lib/junu/tools")).junuTools;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await pg?.close();
});

function toolsFor(userId: string) {
  const effects: string[] = [];
  const tools = junuTools(userId, (e) => effects.push(e.kind));
  const run = async (name: string, input: unknown) => {
    const t = tools.find((x) => x.name === name)!;
    return JSON.parse(String(await t.run(input as never)));
  };
  return { run, effects };
}

describe("Junu tools", () => {
  it("only ever sees the signed-in user's jobs", async () => {
    await prisma.job.create({ data: { userId: "a", title: "Java Developer", company: "Acme", description: "x" } });
    await prisma.job.create({ data: { userId: "b", title: "Secret Role", company: "Other", description: "x" } });
    const { run } = toolsFor("a");
    const r = await run("list_jobs", { view: "all" });
    expect(r.jobs.map((j: { title: string }) => j.title)).toEqual(["Java Developer"]);
    const other = await prisma.job.findFirstOrThrow({ where: { userId: "b" } });
    const t = junuTools("a", () => {}).find((x) => x.name === "get_job")!;
    expect(await t.run({ job_id: other.id } as never)).toBe("No job with that id.");
  });

  it("marks applied and moves the job out of to_apply", async () => {
    const job = await prisma.job.create({ data: { userId: "c", title: "SRE", company: "Initech", description: "x" } });
    const { run, effects } = toolsFor("c");
    expect((await run("list_jobs", { view: "to_apply" })).total_matching).toBe(1);
    expect((await run("mark_applied", { job_id: job.id })).recorded).toBe(true);
    expect((await run("list_jobs", { view: "to_apply" })).total_matching).toBe(0);
    expect((await run("list_jobs", { view: "applied" })).jobs[0].id).toBe(job.id);
    expect(effects).toContain("applications");
  });

  it("saves facts as unapproved so tailoring can't use them until the user approves", async () => {
    const { run } = toolsFor("d");
    await run("add_profile_fact", { category: "skill", text: "Kubernetes (deployed services to EKS at Acme, 2024)" });
    const p = await run("get_profile", {});
    expect(p.facts).toEqual([{ category: "skill", text: "Kubernetes (deployed services to EKS at Acme, 2024)", approved: false }]);
  });

  it("won't start tailoring without a master resume, and updates search settings", async () => {
    const job = await prisma.job.create({ data: { userId: "e", title: "Dev", company: "Co", description: "x" } });
    const { run } = toolsFor("e");
    const r = await run("tailor_resume", { job_id: job.id });
    expect(r).toMatchObject({ started: false, link: "/studio" });
    const s = await run("update_job_search", { titles: ["Java Developer"], locations: ["Dallas, TX"], include_remote: true });
    expect(s).toMatchObject({ saved: true, titles: ["Java Developer"], locations: ["Dallas, TX"], include_remote: true });
  });
});
