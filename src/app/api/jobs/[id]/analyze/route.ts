import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ensureAnalysis } from "@/lib/pipeline";

/** Run (or re-run) job analysis. */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  await prisma.job.findFirstOrThrow({ where: { id, userId: user.id }, select: { id: true } });
  await prisma.job.update({ where: { id }, data: { analysis: null, status: "new" } });
  const analysis = await ensureAnalysis(user.id, id);
  return NextResponse.json(analysis);
});
