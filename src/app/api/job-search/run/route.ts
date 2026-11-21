import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { getSearchStatus, runJobSearch } from "@/lib/jobsearch/run";
import { runWithUser } from "@/lib/requestContext";

/** Start a search in the background; poll GET /api/job-search for progress. */
export const POST = authed(async (_req, user) => {
  void runWithUser(user.id, () => runJobSearch(user.id)).catch((e) => console.error("[jobify] job search failed", e));
  return NextResponse.json(await getSearchStatus(user.id), { status: 202 });
});
