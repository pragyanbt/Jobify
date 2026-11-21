import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GmailMessage } from "@/lib/google";

// Gmail integration: token encryption, message parsing, and the sync that turns
// job emails into updates (Gmail and Claude mocked; real Postgres via PGlite).

const { PORT } = vi.hoisted(() => {
  const PORT = 54334;
  const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable&connection_limit=1`;
  process.env.DATABASE_URL = URL;
  process.env.DIRECT_URL = URL;
  return { PORT };
});

const triage = vi.fn();
vi.mock("@/lib/ai/operations", () => ({ triageEmails: (...a: unknown[]) => triage(...a) }));
vi.mock("@/lib/auth", () => ({
  UnauthorizedError: class extends Error {},
  ForbiddenError: class extends Error { code = "forbidden"; },
  requireUser: async () => ({ id: "u1", email: "a@x.com", role: "user", status: "active" }),
}));

const b64 = (s: string) => Buffer.from(s).toString("base64url");
function msg(id: string, from: string, subject: string, body: string): GmailMessage {
  return {
    id, threadId: `t-${id}`, internalDate: String(Date.UTC(2026, 10, 20)),
    payload: { mimeType: "multipart/alternative", headers: [{ name: "From", value: from }, { name: "Subject", value: subject }], parts: [{ mimeType: "text/plain", body: { data: b64(body) } }] },
  };
}

describe("token encryption", () => {
  it("round-trips, and rejects tampering or the wrong key", async () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const { encrypt, decrypt } = await import("@/lib/secrets");
    const enc = encrypt("1//refresh-token");
    expect(enc).not.toContain("refresh");
    expect(decrypt(enc)).toBe("1//refresh-token");
    const parts = enc.split(".");
    parts[3] = b64("tampered");
    expect(() => decrypt(parts.join("."))).toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decrypt(enc)).toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encrypt("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("only searches job mail and never LinkedIn", async () => {
    const { GMAIL_QUERY } = await import("@/lib/inbox");
    expect(GMAIL_QUERY).toContain("-from:linkedin.com");
    expect(GMAIL_QUERY).toContain("newer_than:30d");
  });
});

describe("Gmail sync", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let inbox: typeof import("@/lib/inbox");
  let server: PGLiteSocketServer;
  let pg: PGlite;

  beforeAll(async () => {
    pg = await PGlite.create();
    server = new PGLiteSocketServer({ db: pg, port: PORT, maxConnections: 10 });
    await server.start();
    await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env } });
    prisma = (await import("@/lib/db")).prisma;
    inbox = await import("@/lib/inbox");
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await server?.stop();
    await pg?.close();
  });

  const mails = [
    msg("m1", "Acme Recruiting <no-reply@greenhouse.io>", "Interview with Acme", "Hi Ada, we'd love to schedule a phone screen for the Backend Engineer role. SECRET-BODY-TEXT"),
    msg("m2", "Initech <jobs@lever.co>", "Your application", "Unfortunately we won't be moving forward."),
    msg("m3", "Newsletter <hello@news.com>", "Top 10 interview tips", "Marketing content"),
  ];
  const source = { list: vi.fn(async () => mails.map((m) => ({ id: m.id, threadId: m.threadId }))), get: vi.fn(async (id: string) => mails.find((m) => m.id === id)!) };

  it("classifies new job emails, links them to jobs, and stores summaries only", async () => {
    const acme = await prisma.job.create({ data: { userId: "u1", title: "Backend Engineer", company: "Acme Inc.", description: "x" } });
    await prisma.application.create({ data: { userId: "u1", jobId: acme.id, status: "submitted", channel: "external" } });
    await prisma.integration.create({ data: { userId: "u1", provider: "google", refreshTokenEnc: "v1.x.y.z" } });
    triage.mockResolvedValueOnce({
      emails: [
        { id: "m1", kind: "interview", company: "Acme", job_title: "Backend Engineer", summary: "Acme invited you to a phone screen." },
        { id: "m2", kind: "rejection", company: "Initech", job_title: "", summary: "Initech isn't moving forward." },
        { id: "m3", kind: "unrelated", company: "", job_title: "", summary: "" },
      ],
    });

    const r = await inbox.syncInbox("u1", source);
    expect(r).toMatchObject({ added: 3, updates: 2 });
    // Email bodies go to the classifier, but are never stored.
    const rows = await prisma.inboxUpdate.findMany({ where: { userId: "u1" } });
    expect(JSON.stringify(rows)).not.toContain("SECRET-BODY-TEXT");

    const list = await inbox.listUpdates("u1");
    expect(list.map((u) => u.kind)).toEqual(expect.arrayContaining(["interview", "rejection"]));
    expect(list).toHaveLength(2); // the newsletter is remembered as ignored, not shown
    const interview = list.find((u) => u.kind === "interview")!;
    expect(interview).toMatchObject({ jobId: acme.id, suggestedOutcome: "interview", via: "greenhouse" });
    expect(list.find((u) => u.kind === "rejection")!.jobId).toBeNull(); // Initech isn't one of the user's jobs
  });

  it("doesn't read or classify the same emails twice", async () => {
    triage.mockClear();
    source.get.mockClear();
    const r = await inbox.syncInbox("u1", source);
    expect(r.added).toBe(0);
    expect(triage).not.toHaveBeenCalled();
    expect(source.get).not.toHaveBeenCalled();
  });

  it("records the suggested outcome only when the user acts on the update", async () => {
    const { PATCH } = await import("@/app/api/inbox/updates/[id]/route");
    const u = (await inbox.listUpdates("u1")).find((x) => x.kind === "interview")!;
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "record_outcome" }) }), { params: Promise.resolve({ id: u.id }) });
    expect(res.status).toBe(200);
    const app = await prisma.application.findFirstOrThrow({ where: { jobId: u.jobId! } });
    expect(app.outcome).toBe("interview");
    expect((await prisma.inboxUpdate.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("done");
  });

  it("can't act on another user's update", async () => {
    const other = await prisma.inboxUpdate.create({ data: { userId: "u2", messageId: "x1", receivedAt: new Date(), kind: "interview" } });
    const { PATCH } = await import("@/app/api/inbox/updates/[id]/route");
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ action: "dismiss" }) }), { params: Promise.resolve({ id: other.id }) });
    expect(res.status).toBe(404);
  });
});
