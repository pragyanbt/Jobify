import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handler } from "@/lib/api";
import { discoverJob } from "@/lib/discovery";

// Ingestion endpoint for job-discovery integrations (feeds, crawlers you run,
// email parsers). Requires `Authorization: Bearer $JOBIFY_DISCOVERY_TOKEN`;
// jobs are added to the account in $JOBIFY_DISCOVERY_USER_ID.

const Body = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  description: z.string().min(50).max(60_000),
  location: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  source: z.string().min(1).max(100),
  channel: z.string().max(100).optional(),
});

function authorized(req: Request): boolean {
  const token = process.env.JOBIFY_DISCOVERY_TOKEN;
  if (!token) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = handler(async (req: Request) => {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = process.env.JOBIFY_DISCOVERY_USER_ID;
  if (!userId) return NextResponse.json({ error: "JOBIFY_DISCOVERY_USER_ID is not set" }, { status: 503 });
  const body = Body.parse(await req.json());
  const job = await discoverJob(userId, { ...body, source: `discovery:${body.source}` });
  return NextResponse.json({ id: job.id }, { status: 201 });
});
