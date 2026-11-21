import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";

const Body = z.object({
  outcome: z.enum(["pending", "no_response", "rejected", "interview", "offer"]).optional(),
  /** Users mark manual submissions as submitted, or withdraw. */
  status: z.enum(["submitted", "withdrawn"]).optional(),
  notes: z.string().max(5000).optional(),
});

export const PATCH = authed<{ id: string }>(async (req, user, { params }) => {
  const { id } = await params;
  const body = Body.parse(await req.json());
  const app = await prisma.application.findFirstOrThrow({ where: { id, userId: user.id } });
  if (body.status === "submitted" && app.status === "awaiting_approval") {
    throw new Error("Approve the resume before marking this application as submitted.");
  }
  const updated = await prisma.application.update({
    where: { id },
    data: {
      ...body,
      ...(body.status === "submitted" && !app.submittedAt && { submittedAt: new Date() }),
    },
  });
  return NextResponse.json(updated);
});
