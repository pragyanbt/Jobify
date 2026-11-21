import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = authed(async (_req, user) => {
  const rows = await prisma.tailoredResume.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, mode: true, match: true, createdAt: true, updatedAt: true,
      job: { select: { id: true, title: true, company: true } },
      master: { select: { id: true, name: true } },
      _count: { select: { versions: true } },
    },
  });
  return NextResponse.json(rows);
});
