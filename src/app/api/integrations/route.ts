import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { googleConfigured } from "@/lib/google";

/** Connected accounts and their status. Never returns tokens. */
export const GET = authed(async (_req, user) => {
  const g = await prisma.integration.findUnique({
    where: { userId_provider: { userId: user.id, provider: "google" } },
    select: { accountEmail: true, lastSyncAt: true, lastError: true, createdAt: true },
  });
  return NextResponse.json({
    google: { configured: googleConfigured(), connected: !!g, ...g },
  });
});
