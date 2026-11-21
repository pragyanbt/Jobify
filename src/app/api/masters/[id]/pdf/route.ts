import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { compileCached, pdfResponse } from "@/lib/latex/cached";

/** Compile (cached by content hash) and return the master's PDF. */
export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const m = await prisma.masterResume.findFirstOrThrow({ where: { id, userId: user.id } });
  const res = await compileCached("master", m.latex);
  if (!res.ok) return NextResponse.json({ error: res.error, log: res.log }, { status: 422 });
  return pdfResponse(res.pdf, "master.pdf");
});
