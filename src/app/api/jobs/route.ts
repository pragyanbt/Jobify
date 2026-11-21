import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { discoverJob } from "@/lib/discovery";

export const GET = authed(async (_req, user) => {
  const jobs = await prisma.job.findMany({
    where: { userId: user.id },
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 1000,
    select: {
      id: true, title: true, company: true, location: true, url: true, status: true,
      baseScore: true, error: true, createdAt: true, source: true, postedAt: true, remote: true, relevance: true,
      tailored: { select: { id: true, status: true, match: true }, orderBy: { createdAt: "desc" }, take: 1 },
      applications: { select: { id: true, status: true, outcome: true } },
    },
  });
  return NextResponse.json(jobs);
});

const Body = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  description: z.string().min(50, "Paste the full job description").max(60_000),
  location: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  // Present when the details came from "Add from link".
  externalKey: z.string().max(300).nullish(),
  postedAt: z.string().max(40).nullish(),
  remote: z.boolean().optional(),
  fromLink: z.boolean().optional(),
});

export const POST = authed(async (req, user) => {
  const { postedAt, fromLink, ...body } = Body.parse(await req.json());
  const dup = await prisma.job.findFirst({
    where: {
      userId: user.id,
      OR: [
        ...(body.url ? [{ url: body.url }] : []),
        ...(body.externalKey ? [{ externalKey: body.externalKey }] : []),
      ],
    },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ ...dup, duplicate: true }, { status: 200 });
  const job = await discoverJob(user.id, {
    ...body,
    postedAt: postedAt && !Number.isNaN(new Date(postedAt).getTime()) ? new Date(postedAt) : null,
    source: fromLink ? "link" : "manual",
  });
  return NextResponse.json(job, { status: 201 });
});
