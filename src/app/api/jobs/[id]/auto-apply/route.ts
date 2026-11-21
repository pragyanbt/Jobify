import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { askJunuToApply } from "@/lib/autoSubmit";

/** "Ask Junu to apply": tailor if needed, prepare, and queue for the Chrome extension. */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  return NextResponse.json(await askJunuToApply(user.id, id));
});
