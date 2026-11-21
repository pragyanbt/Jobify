import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { findBlockedCommands, splitDocument } from "@/lib/latex/document";

const own = (id: string, userId: string) => prisma.masterResume.findFirstOrThrow({ where: { id, userId } });

export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  return NextResponse.json(await own(id, user.id));
});

const Body = z.object({
  name: z.string().min(1).optional(),
  latex: z.string().min(20).optional(),
  isDefault: z.boolean().optional(),
  /** Only clearing is allowed (user dismisses conversion notes). */
  importNotes: z.literal("[]").optional(),
});

/** Explicit user edits to a master. Tailoring never calls this. */
export const PUT = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  await own(id, user.id);
  const body = Body.parse(await req.json());
  if (body.latex) {
    splitDocument(body.latex);
    const blocked = findBlockedCommands(body.latex);
    if (blocked.length) throw new Error(`Blocked LaTeX features: ${blocked.join(", ")}`);
  }
  if (body.isDefault) await prisma.masterResume.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  const m = await prisma.masterResume.update({ where: { id }, data: body });
  return NextResponse.json(m);
});

export const DELETE = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  await own(id, user.id);
  const used = await prisma.application.count({ where: { version: { tailored: { masterId: id } } } });
  if (used) throw new Error("This master was used for applications and can't be deleted.");
  await prisma.masterResume.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
