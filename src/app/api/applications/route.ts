import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = authed(async (_req, user) => {
  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      job: { select: { id: true, title: true, company: true, url: true } },
      version: { select: { id: true, number: true, tailoredId: true, hasPdf: true } },
    },
  });
  return NextResponse.json(apps);
});
