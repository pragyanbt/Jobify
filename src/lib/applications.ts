import { prisma } from "./db";

/**
 * Record that the user applied to a job themselves. Idempotent.
 *
 * - Already submitted → returned unchanged.
 * - A Jobify-prepared application that's ready to submit → marked submitted
 *   (it keeps its resume version).
 * - Otherwise → a new "external" application without a resume version. An
 *   application still awaiting approval is left alone: approval is the gate
 *   that confirms a tailored resume is truthful, so we never skip it.
 */
export async function markApplied(userId: string, jobId: string) {
  await prisma.job.findFirstOrThrow({ where: { id: jobId, userId }, select: { id: true } });

  const apps = await prisma.application.findMany({
    where: { jobId, userId, status: { not: "withdrawn" } },
    orderBy: { createdAt: "desc" },
  });

  const submitted = apps.find((a) => a.status === "submitted");
  if (submitted) return { application: submitted, created: false };

  const ready = apps.find((a) => a.status === "ready_manual");
  if (ready) {
    const application = await prisma.application.update({
      where: { id: ready.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    return { application, created: false };
  }

  const application = await prisma.application.create({
    data: {
      userId,
      jobId,
      versionId: null,
      status: "submitted",
      channel: "external",
      submittedAt: new Date(),
      notes: "Applied on the employer's site.",
    },
  });
  return { application, created: true };
}
