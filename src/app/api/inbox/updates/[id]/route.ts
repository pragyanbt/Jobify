import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { markApplied } from "@/lib/applications";
import { prisma } from "@/lib/db";

const Body = z.object({ action: z.enum(["dismiss", "record_outcome", "mark_applied"]) });

/**
 * Act on an update. record_outcome applies the suggested outcome to the linked
 * application (creating the application record if the user applied outside Jobify).
 * Every change is an explicit user action.
 */
export const PATCH = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const { action } = Body.parse(await req.json());
  const u = await prisma.inboxUpdate.findFirstOrThrow({ where: { id, userId: user.id } });

  if (action === "dismiss") {
    await prisma.inboxUpdate.update({ where: { id }, data: { status: "dismissed" } });
    return NextResponse.json({ ok: true });
  }
  if (!u.jobId) throw new Error("This update isn't linked to one of your jobs. Add the job first.");

  // Recording any of these means the user did apply.
  const { application } = await markApplied(user.id, u.jobId);
  if (action === "record_outcome") {
    if (!u.suggestedOutcome) throw new Error("There's no outcome to record for this update.");
    await prisma.application.update({ where: { id: application.id }, data: { outcome: u.suggestedOutcome } });
  }
  await prisma.inboxUpdate.update({ where: { id }, data: { status: "done", applicationId: application.id } });
  return NextResponse.json({ ok: true, applicationId: application.id });
});
