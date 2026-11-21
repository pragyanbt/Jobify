import { triageEmails } from "./ai/operations";
import { prisma } from "./db";
import { accessToken, gmailFetch, header, messageText, type GmailMessage } from "./google";

// Gmail → application updates. Searches only job-related mail, asks Claude to
// classify it, links each update to the user's jobs/applications, and stores a
// one-sentence summary (never the email body).

/** Only mail that looks job-related is ever fetched. */
export const GMAIL_QUERY = [
  "newer_than:30d",
  "-in:chats",
  "-from:linkedin.com", // Gmail only: LinkedIn isn't part of this integration
  "(",
  "from:(greenhouse.io OR greenhouse-mail.io OR lever.co OR hire.lever.co OR ashbyhq.com OR myworkday.com OR workday.com",
  "OR smartrecruiters.com OR icims.com OR jobvite.com OR successfactors.com OR taleo.net OR workablemail.com)",
  'OR subject:(application OR applying OR applied OR interview OR "next steps" OR offer OR candidacy OR assessment OR "your candidacy")',
  ")",
].join(" ");

const MAX_PER_SYNC = 40;
const GMAIL_CONCURRENCY = 5;

/** Map with at most `limit` calls in flight; results keep input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Read-only Gmail access, injectable for tests. */
export interface MailSource {
  list(query: string, max: number): Promise<{ id: string; threadId: string }[]>;
  get(id: string): Promise<GmailMessage>;
}

export function gmailSource(token: string): MailSource {
  return {
    async list(q, max) {
      const r = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(token, "/messages", { q, maxResults: String(max) });
      return r.messages ?? [];
    },
    get: (id) => gmailFetch<GmailMessage>(token, `/messages/${id}`, { format: "full" }),
  };
}

function viaFor(from: string): string {
  const f = from.toLowerCase();
  for (const [needle, via] of [["greenhouse", "greenhouse"], ["lever.co", "lever"], ["ashby", "ashby"], ["workday", "workday"], ["icims", "icims"], ["smartrecruiters", "smartrecruiters"]] as const) {
    if (f.includes(needle)) return via;
  }
  return "email";
}

const norm = (s: string) => s.toLowerCase().replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|labs)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const OUTCOME: Record<string, string | undefined> = { interview: "interview", offer: "offer", rejection: "rejected" };

export interface SyncResult {
  checked: number;
  added: number;
  updates: number;
}

/** Fetch new job emails and turn them into updates. */
export async function syncInbox(userId: string, source?: MailSource): Promise<SyncResult> {
  let mail = source;
  if (!mail) {
    const token = await accessToken(userId);
    if (!token) throw new Error("Gmail isn't connected.");
    mail = gmailSource(token);
  }

  try {
    const listed = await mail.list(GMAIL_QUERY, 100);
    const known = new Set(
      (await prisma.inboxUpdate.findMany({ where: { userId, messageId: { in: listed.map((m) => m.id) } }, select: { messageId: true } }))
        .map((r) => r.messageId),
    );
    const fresh = listed.filter((m) => !known.has(m.id)).slice(0, MAX_PER_SYNC);

    // A few at a time: Gmail rate-limits bursts of message reads.
    const messages = await mapLimit(fresh, GMAIL_CONCURRENCY, (m) => mail!.get(m.id));
    const emails = messages.map((m) => ({
      id: m.id,
      from: header(m, "From"),
      subject: header(m, "Subject"),
      receivedAt: new Date(Number(m.internalDate)),
      text: messageText(m).slice(0, 2500),
      message: m,
    }));
    const triaged = emails.length
      ? new Map((await triageEmails(emails.map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.receivedAt.toISOString(), text: e.text })))).emails.map((t) => [t.id, t]))
      : new Map();

    // Link to the user's jobs: prefer one with an application, then the newest.
    const jobs = emails.length
      ? await prisma.job.findMany({
          where: { userId },
          select: { id: true, title: true, company: true, applications: { select: { id: true, status: true }, orderBy: { createdAt: "desc" } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const matchJob = (company: string, title: string) => {
      const c = norm(company);
      if (!c) return null;
      const same = jobs.filter((j) => { const jc = norm(j.company); return jc && (jc === c || jc.includes(c) || c.includes(jc)); });
      if (!same.length) return null;
      const t = norm(title);
      const byTitle = t ? same.filter((j) => norm(j.title).includes(t) || t.includes(norm(j.title))) : [];
      const pool = byTitle.length ? byTitle : same;
      return pool.find((j) => j.applications.some((a) => a.status !== "withdrawn")) ?? pool[0];
    };

    const rows = emails.map((e) => {
      const t = triaged.get(e.id);
      const base = { userId, messageId: e.id, threadId: e.message.threadId, receivedAt: e.receivedAt };
      // Checked and unrelated: remember the id only, so it isn't read again.
      if (!t || t.kind === "unrelated") return { ...base, kind: "ignored", status: "dismissed" };
      const job = matchJob(t.company, t.job_title);
      return {
        ...base,
        kind: t.kind,
        via: viaFor(e.from),
        company: t.company.slice(0, 200),
        jobTitle: t.job_title.slice(0, 200),
        summary: t.summary.slice(0, 400),
        fromName: e.from.replace(/<.*>/, "").replace(/"/g, "").trim().slice(0, 120),
        subject: e.subject.slice(0, 200),
        jobId: job?.id ?? null,
        applicationId: job?.applications.find((a) => a.status !== "withdrawn")?.id ?? null,
        suggestedOutcome: OUTCOME[t.kind] ?? null,
      };
    });
    if (rows.length) await prisma.inboxUpdate.createMany({ data: rows, skipDuplicates: true });

    await prisma.integration.updateMany({ where: { userId, provider: "google" }, data: { lastSyncAt: new Date(), lastError: null } });
    return { checked: listed.length, added: rows.length, updates: rows.filter((r) => r.kind !== "ignored").length };
  } catch (e) {
    await prisma.integration.updateMany({ where: { userId, provider: "google" }, data: { lastError: (e as Error).message.slice(0, 300) } });
    throw e;
  }
}

/** Updates to show (newest first), excluding dismissed and ignored. */
export function listUpdates(userId: string, limit = 30) {
  return prisma.inboxUpdate.findMany({
    where: { userId, kind: { not: "ignored" }, status: { not: "dismissed" } },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: {
      id: true, messageId: true, threadId: true, receivedAt: true, kind: true, via: true, company: true, jobTitle: true,
      summary: true, fromName: true, subject: true, jobId: true, applicationId: true, suggestedOutcome: true, status: true,
    },
  });
}
