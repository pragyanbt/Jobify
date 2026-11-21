import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { startTailoring } from "@/lib/pipeline";

/** "Apply" button: start the tailoring workflow; the UI polls its progress. */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const tailoredId = await startTailoring(user.id, id, "manual");
  return NextResponse.json({ tailoredId }, { status: 202 });
});
