import { NextResponse } from "next/server";
import { z } from "zod";
import { setUserStatus } from "@/lib/admin";
import { admined } from "@/lib/api";

const Body = z.object({
  status: z.enum(["pending", "active", "paused", "banned"]),
});

export const PATCH = admined<{ id: string }>(async (req, admin, { params }) => {
  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't change your own account status here." }, { status: 400 });
  }
  const body = Body.parse(await req.json());
  const updated = await setUserStatus(id, body.status);
  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    status: updated.status,
    approvedAt: updated.approvedAt,
  });
});
