import { prisma } from "./db";
import { ensureAnalysis, startTailoring } from "./pipeline";
import { getProfile } from "./profile";

// Entry point for job discovery. Today jobs arrive from the "Add job" form or
// POST /api/discovery; a future crawler/feed integration should call
// discoverJob() too, so analysis and auto-apply run the same way.

export interface DiscoveredJob {
  title: string;
  company: string;
  description: string;
  location?: string;
  url?: string;
  source?: string;
  channel?: string;
  externalKey?: string | null;
  postedAt?: Date | null;
  remote?: boolean;
}

export async function discoverJob(userId: string, input: DiscoveredJob) {
  const job = await prisma.job.create({
    data: {
      userId,
      title: input.title.trim(),
      company: input.company.trim(),
      description: input.description,
      location: input.location ?? "",
      url: input.url ?? "",
      source: input.source ?? "manual",
      channel: input.channel ?? "manual",
      externalKey: input.externalKey ?? null,
      postedAt: input.postedAt ?? null,
      remote: input.remote ?? false,
    },
  });
  // Analysis + auto-apply happen in the background.
  void (async () => {
    try {
      await ensureAnalysis(userId, job.id);
      await runAutoApply(userId);
    } catch (e) {
      console.error("[jobify] discovery processing failed", e);
    }
  })();
  return job;
}

const g = globalThis as unknown as { jobifyAutoApply?: Set<string> };
const autoApplyRunning = (g.jobifyAutoApply ??= new Set<string>());

/** Tailor (and queue/submit) every qualifying job, within the daily limit. */
export async function runAutoApply(userId: string): Promise<{ started: number; skipped: string }> {
  const { autoApply } = await getProfile(userId);
  if (!autoApply.enabled) return { started: 0, skipped: "Auto-apply is off." };
  if (autoApplyRunning.has(userId)) return { started: 0, skipped: "Auto-apply is already running." };
  autoApplyRunning.add(userId);
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const today = await prisma.tailoredResume.count({ where: { userId, mode: "auto", createdAt: { gte: since } } });
    let budget = autoApply.dailyLimit - today;
    if (budget <= 0) return { started: 0, skipped: "Daily auto-apply limit reached." };

    const candidates = await prisma.job.findMany({
      where: { userId, status: "analyzed", baseScore: { gte: autoApply.minBaseScore }, tailored: { none: {} } },
      orderBy: { baseScore: "desc" },
    });
    let started = 0;
    for (const job of candidates) {
      if (budget-- <= 0) break;
      await startTailoring(userId, job.id, "auto"); // sequential: awaits the pipeline in auto mode
      started++;
    }
    return { started, skipped: "" };
  } finally {
    autoApplyRunning.delete(userId);
  }
}
