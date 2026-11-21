import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { runAutoApply } from "@/lib/discovery";

/** Run auto-apply now over all analyzed, qualifying jobs. */
export const POST = authed(async (_req, user) => NextResponse.json(await runAutoApply(user.id)));
