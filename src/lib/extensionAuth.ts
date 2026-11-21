import { createHash, randomBytes } from "node:crypto";
import { ForbiddenError, normalizeStatus, UnauthorizedError } from "./auth";
import { prisma } from "./db";

// Access keys for the Jobify Chrome extension. The key is shown to the user
// once; only its SHA-256 hash is stored. One key per user; creating a new key
// replaces the old one.

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createExtensionToken(userId: string): Promise<string> {
  const token = `jbx_${randomBytes(32).toString("base64url")}`;
  await prisma.extensionToken.upsert({
    where: { userId },
    create: { userId, tokenHash: hash(token) },
    update: { tokenHash: hash(token), createdAt: new Date(), lastUsedAt: null },
  });
  return token;
}

export async function revokeExtensionToken(userId: string) {
  await prisma.extensionToken.deleteMany({ where: { userId } });
}

/** The user behind an extension request (Authorization: Bearer jbx_…). Active accounts only. */
export async function requireExtensionUser(req: Request): Promise<{ id: string; email: string }> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(jbx_[\w-]{20,})$/)?.[1];
  if (!token) throw new UnauthorizedError("Missing extension key. Paste your key from Jobify → Settings → Autopilot.");
  const row = await prisma.extensionToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row) throw new UnauthorizedError("This extension key isn't valid anymore. Create a new one in Jobify → Settings → Autopilot.");
  const p = await prisma.profile.findUnique({ where: { id: row.userId }, select: { email: true, status: true } });
  const status = normalizeStatus(p?.status);
  if (status !== "active") {
    throw new ForbiddenError(
      status === "paused" ? "Your account is paused, so automatic applying is off." : "Your account isn't active.",
      status === "paused" ? "paused" : "forbidden",
    );
  }
  void prisma.extensionToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { id: row.userId, email: p?.email ?? "" };
}
