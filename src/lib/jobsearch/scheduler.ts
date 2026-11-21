import { prisma } from "../db";
import { getProfile } from "../profile";
import { getSearchStatus, runJobSearch } from "./run";

// In-process scheduler: every 10 minutes, runs a search for each user whose
// interval has elapsed. Runs only while the Jobify server is running.

const TICK_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { jobifyScheduler?: NodeJS.Timeout };

async function tick() {
  let users: { id: string }[];
  try {
    users = await prisma.profile.findMany({ select: { id: true } });
  } catch (e) {
    console.error("[jobify] scheduler couldn't reach the database", (e as Error).message);
    return;
  }
  for (const { id } of users) {
    try {
      const { jobSearch } = await getProfile(id);
      if (!jobSearch.enabled || jobSearch.intervalHours <= 0 || jobSearch.keywords.length === 0) continue;
      const status = await getSearchStatus(id);
      if (status.running) continue;
      const last = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;
      if (Date.now() - last < jobSearch.intervalHours * 3_600_000) continue;
      const r = await runJobSearch(id);
      console.log(`[jobify] scheduled job search for ${id.slice(0, 8)}…: ${r.added ?? 0} new job(s)`);
    } catch (e) {
      console.error("[jobify] scheduled job search failed", (e as Error).message);
    }
  }
}

const GMAIL_EVERY_MS = 3 * 3_600_000;

/** Check connected Gmail accounts for new application updates every few hours. */
async function gmailTick() {
  try {
    const due = await prisma.integration.findMany({
      where: {
        provider: "google",
        OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - GMAIL_EVERY_MS) } }],
        // A failing connection (e.g. access revoked) is retried daily, not every tick.
        AND: [{ OR: [{ lastError: null }, { updatedAt: { lt: new Date(Date.now() - 24 * 3_600_000) } }] }],
      },
      select: { userId: true },
    });
    const { syncInbox } = await import("../inbox");
    for (const { userId } of due) {
      try {
        const r = await syncInbox(userId);
        if (r.updates) console.log(`[jobify] Gmail check for ${userId.slice(0, 8)}…: ${r.updates} new update(s)`);
      } catch (e) {
        console.error("[jobify] scheduled Gmail check failed", (e as Error).message);
      }
    }
  } catch (e) {
    console.error("[jobify] Gmail scheduler couldn't reach the database", (e as Error).message);
  }
}

export function startJobSearchScheduler() {
  if (g.jobifyScheduler) return;
  g.jobifyScheduler = setInterval(() => { void tick(); void gmailTick(); }, TICK_MS);
  setTimeout(() => { void tick(); void gmailTick(); }, 15_000); // shortly after startup
}
