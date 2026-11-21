import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveUserEdit } from "@/lib/pipeline";

/** Restore an older version by saving its source as a new version. */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const v = await prisma.resumeVersion.findFirstOrThrow({ where: { id, tailored: { userId: user.id } } });
  return NextResponse.json(await saveUserEdit(user.id, v.tailoredId, v.latex, `Restored v${v.number}`));
});
