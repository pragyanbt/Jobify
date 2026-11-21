import { NextResponse } from "next/server";
import { listUsersForAdmin } from "@/lib/admin";
import { admined } from "@/lib/api";

export const GET = admined(async () => NextResponse.json(await listUsersForAdmin()));
