import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/api";
import { recordResult } from "@/lib/autoSubmit";
import { requireExtensionUser } from "@/lib/extensionAuth";

const Body = z.object({
  status: z.enum(["submitted", "needs_you", "failed"]),
  note: z.string().max(2000).optional(),
});

/** The extension reports how an application went. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireExtensionUser(req);
  await recordResult(user.id, (await params).id, Body.parse(await req.json()));
  return NextResponse.json({ ok: true });
});
