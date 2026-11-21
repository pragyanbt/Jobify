import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { markApplied } from "@/lib/applications";

/** The user confirms they applied to this job themselves ("Did you apply?" prompt). */
export const POST = authed<{ id: string }>(async (_req, user, { params }) => {
  const { id } = await params;
  const result = await markApplied(user.id, id);
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});
