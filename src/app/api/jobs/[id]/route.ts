import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const job = await prisma.job.findFirstOrThrow({
    where: { id, userId: user.id },
    include: {
      tailored: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, match: true, createdAt: true, mode: true, error: true },
      },
      applications: true,
    },
  });
  return NextResponse.json(job);
});

export const DELETE = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  await prisma.job.findFirstOrThrow({ where: { id, userId: user.id }, select: { id: true } });
  const apps = await prisma.application.count({ where: { jobId: id } });
  if (apps) throw new Error("This job has applications; withdraw them instead of deleting the job.");
  await prisma.job.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
