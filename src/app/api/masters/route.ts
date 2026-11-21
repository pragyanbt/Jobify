import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { splitDocument } from "@/lib/latex/document";
import { createMaster } from "@/lib/masters";
import { importPlainTextResume, type ImportResult } from "@/lib/resumeImport";

export const GET = authed(async (_req, user) => {
  const masters = await prisma.masterResume.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { tailored: true } } },
  });
  return NextResponse.json(masters);
});

const Body = z.union([
  z.object({ name: z.string().min(1), latex: z.string().min(20) }),
  z.object({ name: z.string().min(1), plainText: z.string().min(20) }),
]);

/** Create from pasted LaTeX or plain text. File uploads use /api/masters/upload. */
export const POST = authed(async (req, user) => {
  const body = Body.parse(await req.json());
  let result: ImportResult;
  if ("latex" in body) {
    splitDocument(body.latex); // must be a full document
    result = { latex: body.latex, format: "latex", notes: [] };
  } else {
    result = await importPlainTextResume(body.plainText);
  }
  const m = await createMaster(user.id, body.name, result);
  return NextResponse.json(m, { status: 201 });
});
