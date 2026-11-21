import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

// One-time import of the pre-sign-in local SQLite data (data/jobify.db) into
// the signed-in user's account. After a successful import the file is renamed
// so the data can't be imported into a second account.

const DB_FILE = process.env.JOBIFY_LOCAL_DB ?? path.join(process.cwd(), "data", "jobify.db");
const PDF_DIR = path.join(process.cwd(), "data", "pdfs");

type Row = Record<string, unknown>;

interface SqliteDb {
  prepare(sql: string): { all(): Row[] };
  close(): void;
}

async function openLocal(): Promise<SqliteDb | null> {
  if (!existsSync(DB_FILE)) return null;
  const moduleName = "node:sqlite"; // Node >= 22.5; loaded at runtime only
  const { DatabaseSync } = (await import(/* webpackIgnore: true */ moduleName)) as {
    DatabaseSync: new (file: string, opts?: { readOnly?: boolean }) => SqliteDb;
  };
  return new DatabaseSync(DB_FILE, { readOnly: true });
}

const all = (db: SqliteDb, table: string): Row[] => {
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all();
  } catch {
    return [];
  }
};
const str = (v: unknown, d = ""): string => (v == null ? d : String(v));
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";
const date = (v: unknown): Date | null => (v == null ? null : new Date(typeof v === "number" ? v : Number(v) || String(v)));

export interface LocalCounts {
  masters: number;
  jobs: number;
  tailored: number;
  applications: number;
}

export async function localDataSummary(): Promise<LocalCounts | null> {
  const db = await openLocal();
  if (!db) return null;
  try {
    const counts = {
      masters: all(db, "MasterResume").length,
      jobs: all(db, "Job").length,
      tailored: all(db, "TailoredResume").length,
      applications: all(db, "Application").length,
    };
    return counts.masters + counts.jobs > 0 ? counts : null;
  } finally {
    db.close();
  }
}

export async function importLocalData(userId: string): Promise<LocalCounts> {
  const db = await openLocal();
  if (!db) throw new Error("There's no local data to import.");
  let data: Record<string, Row[]>;
  try {
    data = Object.fromEntries(
      ["Profile", "MasterResume", "Job", "TailoredResume", "ResumeVersion", "Application"].map((t) => [t, all(db, t)]),
    );
  } finally {
    db.close();
  }

  const pdfs = new Map<string, Buffer>();
  for (const v of data.ResumeVersion) {
    const rel = str(v.pdfPath);
    if (!rel) continue;
    const file = path.resolve(PDF_DIR, rel);
    if (!file.startsWith(PDF_DIR + path.sep)) continue;
    try {
      pdfs.set(str(v.id), await fs.readFile(file));
    } catch {
      /* missing PDF: version imports without it */
    }
  }

  // Jobs that already exist in the account (same source key) are skipped,
  // along with anything that depends on them.
  const existing = new Set(
    (await prisma.job.findMany({ where: { userId, externalKey: { not: null } }, select: { externalKey: true } })).map(
      (j) => j.externalKey,
    ),
  );
  const skippedJobs = new Set(data.Job.filter((j) => j.externalKey && existing.has(str(j.externalKey))).map((j) => str(j.id)));
  const tailored = data.TailoredResume.filter((t) => !skippedJobs.has(str(t.jobId)));
  const tailoredIds = new Set(tailored.map((t) => str(t.id)));
  const versions = data.ResumeVersion.filter((v) => tailoredIds.has(str(v.tailoredId)));
  const apps = data.Application.filter((a) => !skippedJobs.has(str(a.jobId)));
  const hasDefault = (await prisma.masterResume.count({ where: { userId, isDefault: true } })) > 0;

  await prisma.$transaction(
    async (tx) => {
      const p = data.Profile[0];
      if (p) {
        const current = await tx.profile.findUnique({ where: { id: userId } });
        const keepCurrent = (field: string, local: unknown) =>
          current && (current as Record<string, unknown>)[field] !== "{}" && (current as Record<string, unknown>)[field] !== "[]"
            ? undefined
            : str(local, field === "facts" ? "[]" : "{}");
        await tx.profile.update({
          where: { id: userId },
          data: {
            facts: keepCurrent("facts", p.facts),
            tailoringRules: keepCurrent("tailoringRules", p.tailoringRules),
            autoApply: keepCurrent("autoApply", p.autoApply),
            jobSearch: keepCurrent("jobSearch", p.jobSearch),
          },
        });
      }
      await tx.masterResume.createMany({
        data: data.MasterResume.map((m) => ({
          id: str(m.id), userId, name: str(m.name), latex: str(m.latex),
          isDefault: hasDefault ? false : bool(m.isDefault),
          sourceFormat: str(m.sourceFormat, "latex"), importNotes: str(m.importNotes, "[]"),
          createdAt: date(m.createdAt) ?? new Date(), updatedAt: date(m.updatedAt) ?? new Date(),
        })),
        skipDuplicates: true,
      });
      await tx.job.createMany({
        data: data.Job.filter((j) => !skippedJobs.has(str(j.id))).map((j) => ({
          id: str(j.id), userId, title: str(j.title), company: str(j.company), location: str(j.location),
          url: str(j.url), description: str(j.description), source: str(j.source, "manual"),
          externalKey: j.externalKey == null ? null : str(j.externalKey), postedAt: date(j.postedAt),
          remote: bool(j.remote), relevance: num(j.relevance) ?? 0, channel: str(j.channel, "manual"),
          analysis: j.analysis == null ? null : str(j.analysis), baseScore: num(j.baseScore),
          // Interrupted analyses restart cleanly.
          status: str(j.status) === "analyzing" ? (j.analysis ? "analyzed" : "discovered") : str(j.status, "new"),
          error: j.error == null ? null : str(j.error), createdAt: date(j.createdAt) ?? new Date(),
        })),
        skipDuplicates: true,
      });
      await tx.tailoredResume.createMany({
        data: tailored.map((t) => ({
          id: str(t.id), userId, jobId: str(t.jobId), masterId: str(t.masterId), masterSnapshot: str(t.masterSnapshot),
          status: ["queued", "analyzing", "tailoring", "compiling", "validating"].includes(str(t.status)) ? "failed" : str(t.status),
          steps: str(t.steps, "[]"), changes: str(t.changes, "[]"),
          match: t.match == null ? null : str(t.match), validation: t.validation == null ? null : str(t.validation),
          summary: str(t.summary), mode: str(t.mode, "manual"), error: t.error == null ? null : str(t.error),
          createdAt: date(t.createdAt) ?? new Date(), updatedAt: date(t.updatedAt) ?? new Date(),
        })),
        skipDuplicates: true,
      });
      await tx.resumeVersion.createMany({
        data: versions.map((v) => ({
          id: str(v.id), tailoredId: str(v.tailoredId), number: Number(v.number), latex: str(v.latex),
          origin: str(v.origin), note: str(v.note), hasPdf: pdfs.has(str(v.id)), pageCount: num(v.pageCount),
          compileOk: bool(v.compileOk), compileLog: str(v.compileLog), createdAt: date(v.createdAt) ?? new Date(),
        })),
        skipDuplicates: true,
      });
      for (const [versionId, pdf] of pdfs) {
        if (!versions.some((v) => str(v.id) === versionId)) continue;
        await tx.resumePdf.upsert({
          where: { versionId },
          create: { versionId, data: new Uint8Array(pdf) },
          update: {},
        });
      }
      await tx.application.createMany({
        data: apps.map((a) => ({
          id: str(a.id), userId, jobId: str(a.jobId), versionId: str(a.versionId), status: str(a.status),
          channel: str(a.channel, "manual"), outcome: str(a.outcome, "pending"), notes: str(a.notes),
          reviewReason: str(a.reviewReason), submittedAt: date(a.submittedAt),
          createdAt: date(a.createdAt) ?? new Date(), updatedAt: date(a.updatedAt) ?? new Date(),
        })),
        skipDuplicates: true,
      });
    },
    { timeout: 120_000 },
  );

  await fs.rename(DB_FILE, `${DB_FILE}.imported-${Date.now()}`);
  return {
    masters: data.MasterResume.length,
    jobs: data.Job.length - skippedJobs.size,
    tailored: tailored.length,
    applications: apps.length,
  };
}
