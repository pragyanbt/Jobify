import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { getProfile } from "@/lib/profile";
import { getSearchStatus } from "@/lib/jobsearch/run";
import { adzunaConfigured } from "@/lib/jobsearch/sources";

export const GET = authed(async (_req, user) => {
  const { jobSearch } = await getProfile(user.id);
  return NextResponse.json({ settings: jobSearch, status: await getSearchStatus(user.id), adzunaConfigured: adzunaConfigured() });
});
