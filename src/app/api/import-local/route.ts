import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { importLocalData, localDataSummary } from "@/lib/importLocal";

/** Is there pre-sign-in local data that can be imported? */
export const GET = authed(async () => NextResponse.json({ available: await localDataSummary() }));

/** Import it into the signed-in account (one time). */
export const POST = authed(async (_req, user) => NextResponse.json({ imported: await importLocalData(user.id) }));
