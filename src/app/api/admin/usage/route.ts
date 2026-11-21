import { NextResponse } from "next/server";
import { usageSummary } from "@/lib/admin";
import { admined } from "@/lib/api";

export const GET = admined(async () => NextResponse.json(await usageSummary()));
