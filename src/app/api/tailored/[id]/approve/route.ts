import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { approveTailored } from "@/lib/pipeline";

export const POST = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const { override } = z.object({ override: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));
  return NextResponse.json(await approveTailored(user.id, id, { override }));
});
