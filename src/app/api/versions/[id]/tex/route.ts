import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const v = await prisma.resumeVersion.findFirstOrThrow({
    where: { id, tailored: { userId: user.id } },
    select: { number: true, latex: true, tailored: { select: { job: { select: { company: true } } } } },
  });
  const name = `resume-${v.tailored.job.company.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${v.number}.tex`;
  return new Response(v.latex, {
    headers: { "Content-Type": "application/x-tex; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
});
