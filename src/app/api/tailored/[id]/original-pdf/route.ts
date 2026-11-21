import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { compileCached, pdfResponse } from "@/lib/latex/cached";

/** PDF of the master resume exactly as it was when this tailoring started. */
export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const t = await prisma.tailoredResume.findFirstOrThrow({ where: { id, userId: user.id }, select: { masterSnapshot: true } });
  const res = await compileCached("master", t.masterSnapshot);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
  return pdfResponse(res.pdf, "original.pdf");
});
