import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { syncInbox } from "@/lib/inbox";

export const maxDuration = 120;

/** Check Gmail now for new application updates. */
export const POST = authed(async (_req, user) => {
  return NextResponse.json(await syncInbox(user.id));
});
