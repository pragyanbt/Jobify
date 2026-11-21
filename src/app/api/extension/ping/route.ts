import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireExtensionUser } from "@/lib/extensionAuth";
import { getProfile } from "@/lib/profile";

/** Extension status check: who's connected, and whether auto-submit is on. */
export const GET = handler(async (req: Request) => {
  const user = await requireExtensionUser(req);
  const { autoApply } = await getProfile(user.id);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [queued, submittedToday] = await Promise.all([
    prisma.applicationDraft.count({ where: { userId: user.id, submitStatus: "queued" } }),
    prisma.applicationDraft.count({ where: { userId: user.id, submitStatus: "submitted", submittedAt: { gte: since } } }),
  ]);
  return NextResponse.json({
    email: user.email,
    autoSubmit: autoApply.enabled && autoApply.autoSubmit && !!autoApply.consentAt,
    queued,
    submittedToday,
    dailyLimit: autoApply.dailyLimit,
  });
});
