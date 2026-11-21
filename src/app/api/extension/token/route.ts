import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/db";
import { createExtensionToken, revokeExtensionToken } from "@/lib/extensionAuth";

/** Extension connection status (never returns the key). */
export const GET = authed(async (_req, user) => {
  const t = await prisma.extensionToken.findUnique({ where: { userId: user.id }, select: { createdAt: true, lastUsedAt: true } });
  return NextResponse.json({ connected: !!t, createdAt: t?.createdAt ?? null, lastUsedAt: t?.lastUsedAt ?? null });
});

/** Create a new key (replaces any old one). The key is returned only here, once. */
export const POST = authed(async (_req, user) => NextResponse.json({ token: await createExtensionToken(user.id) }));

/** Disconnect the extension. */
export const DELETE = authed(async (_req, user) => {
  await revokeExtensionToken(user.id);
  return NextResponse.json({ ok: true });
});
