import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { claimNext } from "@/lib/autoSubmit";
import { requireExtensionUser } from "@/lib/extensionAuth";

/** Claim the next application to submit (null when there's nothing to do). */
export const POST = handler(async (req: Request) => {
  const user = await requireExtensionUser(req);
  return NextResponse.json({ task: await claimNext(user.id) });
});
