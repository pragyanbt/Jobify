import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { disconnectGoogle } from "@/lib/google";

/** Revoke Google access and delete the tokens and the updates found in Gmail. */
export const POST = authed(async (_req, user) => {
  await disconnectGoogle(user.id);
  return NextResponse.json({ ok: true });
});
