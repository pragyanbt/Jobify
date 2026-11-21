import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { pdfResponse } from "@/lib/latex/cached";

export const GET = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const v = await prisma.resumeVersion.findFirstOrThrow({
    where: { id, tailored: { userId: user.id } },
    select: { number: true, pdf: true, tailored: { select: { job: { select: { company: true } } } } },
  });
  if (!v.pdf) return NextResponse.json({ error: "No PDF for this version" }, { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  const name = `resume-${v.tailored.job.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${v.number}.pdf`;
  return pdfResponse(Buffer.from(v.pdf.data), name, download);
});
