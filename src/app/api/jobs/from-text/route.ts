import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { jobFromPastedText, ManualEntryNeeded } from "@/lib/jobsearch/fromUrl";

const Body = z.object({
  text: z.string().max(200_000),
  url: z.string().trim().max(2000).optional().default(""),
});

/** Turn a posting the user copied from their browser into editable details. Nothing is saved here. */
export const POST = authed(async (req, user) => {
  const { text, url } = Body.parse(await req.json());
  try {
    const job = await jobFromPastedText(text, url);
    const dup = url
      ? await prisma.job.findFirst({ where: { userId: user.id, url }, select: { id: true, title: true } })
      : null;
    return NextResponse.json({ job, duplicate: dup });
  } catch (e) {
    if (e instanceof ManualEntryNeeded) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
});
