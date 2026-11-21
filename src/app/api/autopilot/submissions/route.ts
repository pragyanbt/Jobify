import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { requeueDraft } from "@/lib/autoSubmit";
import { prisma } from "@/lib/db";

/** Recent automatic submissions and what needs the user. */
export const GET = authed(async (_req, user) => {
  const rows = await prisma.applicationDraft.findMany({
    where: { userId: user.id, submitStatus: { not: "none" } },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true, jobId: true, submitStatus: true, submitNote: true, submittedAt: true, updatedAt: true,
      job: { select: { title: true, company: true, url: true } },
    },
  });
  return NextResponse.json(rows);
});

/** Queue a job's application again after the user filled in what was missing (keeps their answers). */
export const POST = authed(async (req, user) => {
  const { jobId } = z.object({ jobId: z.string() }).parse(await req.json());
  await prisma.job.findFirstOrThrow({ where: { id: jobId, userId: user.id }, select: { id: true } });
  return NextResponse.json(await requeueDraft(user.id, jobId));
});
