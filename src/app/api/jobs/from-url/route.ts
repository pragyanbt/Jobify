import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { fetchJobFromUrl, ManualEntryNeeded } from "@/lib/jobsearch/fromUrl";

/** Read a job posting link and return editable details. Nothing is saved here. */
export const POST = authed(async (req, user) => {
  const { url } = z.object({ url: z.string().trim().min(8).max(2000) }).parse(await req.json());
  const existing = await prisma.job.findFirst({ where: { userId: user.id, url }, select: { id: true, title: true } });
  if (existing) return NextResponse.json({ duplicate: existing });
  try {
    const job = await fetchJobFromUrl(url);
    const dup = await prisma.job.findFirst({
      where: {
        userId: user.id,
        OR: [{ url: job.url }, ...(job.externalKey ? [{ externalKey: job.externalKey }] : [])],
      },
      select: { id: true, title: true },
    });
    return NextResponse.json({ job, duplicate: dup });
  } catch (e) {
    // Fall back to the manual form, keeping the link.
    const manual = e instanceof ManualEntryNeeded;
    return NextResponse.json({
      manual: true,
      url,
      error: manual
        ? e.message
        : `Couldn't read that page (${(e as Error).message}). Open the posting in your browser, copy the whole page, and paste it below.`,
    });
  }
});
