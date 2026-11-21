import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Current account status — available even while pending approval. */
export const GET = authed(
  async (_req, user) => {
    const masters = await prisma.masterResume.count({ where: { userId: user.id } });
    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      hasMasterResume: masters > 0,
    });
  },
  { allowPending: true, allowBanned: true },
);
