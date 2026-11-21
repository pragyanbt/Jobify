import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { getAutopilotActivity } from "@/lib/autopilotActivity";

/** Autopilot progress per job (last 24 hours), for the Chat tab. */
export const GET = authed(async (_req, user) => NextResponse.json(await getAutopilotActivity(user.id)));
