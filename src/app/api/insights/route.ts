import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { computeInsights } from "@/lib/insights";

export const GET = authed(async (_req, user) => NextResponse.json(await computeInsights(user.id)));
