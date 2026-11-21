import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saveUserEdit } from "@/lib/pipeline";

export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const t = await prisma.tailoredResume.findFirstOrThrow({
    where: { id, userId: user.id },
    include: {
      job: true,
      master: { select: { id: true, name: true } },
      versions: {
        orderBy: { number: "desc" },
        select: {
          id: true, number: true, origin: true, note: true, compileOk: true, pageCount: true,
          hasPdf: true, createdAt: true, latex: true, compileLog: true,
          applications: { select: { id: true, status: true } },
        },
      },
    },
  });
  const applications = await prisma.application.findMany({
    where: { userId: user.id, version: { tailoredId: id } },
    include: { version: { select: { number: true } } },
  });
  return NextResponse.json({ ...t, applications });
});

const Body = z.object({ latex: z.string().min(20).max(500_000), note: z.string().max(300).default("") });

/** Save an edited LaTeX source as a new version (compiles + validates). */
export const PUT = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const { latex, note } = Body.parse(await req.json());
  return NextResponse.json(await saveUserEdit(user.id, id, latex, note));
});
