import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getDraft, prepareApplication, saveDraft } from "@/lib/prepareApplication";

export const maxDuration = 120;

/** The prepared application for this job, if any. */
export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  await prisma.job.findFirstOrThrow({ where: { id, userId: user.id }, select: { id: true } });
  return NextResponse.json({ draft: await getDraft(user.id, id) });
});

/** Prepare (or re-prepare) the application: Junu fills in the employer's form for review. */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  return NextResponse.json({ draft: await prepareApplication(user.id, id, user.email) });
});

const Answer = z.object({
  questionId: z.string().max(200),
  value: z.union([z.string().max(20_000), z.array(z.string().max(500)).max(100)]),
  source: z.enum(["profile", "resume", "drafted", "attachment", "decline", "self_id", "user", "authorized", "needs_you"]),
  note: z.string().max(1000).optional(),
});

/** Save the user's edits, and optionally mark the answers reviewed. */
export const PUT = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const body = z.object({ answers: z.array(Answer).max(300), status: z.enum(["draft", "reviewed"]) }).parse(await req.json());
  return NextResponse.json({ draft: await saveDraft(user.id, id, body.answers, body.status) });
});
