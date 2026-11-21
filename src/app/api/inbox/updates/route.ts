import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { listUpdates } from "@/lib/inbox";

export const GET = authed(async (_req, user) => NextResponse.json(await listUpdates(user.id)));
