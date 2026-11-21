import { prisma } from "./db";
import { supabaseConfigured } from "./supabase/config";
import { createSupabaseServer } from "./supabase/server";

export type AccountStatus = "pending" | "active" | "paused" | "banned";
export type AccountRole = "user" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
}

export class UnauthorizedError extends Error {
  constructor(message = "Please sign in.") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  code: "pending" | "banned" | "paused" | "forbidden";
  constructor(message: string, code: ForbiddenError["code"] = "forbidden") {
    super(message);
    this.code = code;
  }
}

const ADMIN_EMAILS = () =>
  (process.env.JOBIFY_ADMIN_EMAILS ?? "pragyan4044@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS().includes(email.trim().toLowerCase());
}

const g = globalThis as unknown as { jobifyKnownUsers?: Set<string> };
const known = (g.jobifyKnownUsers ??= new Set<string>());

type EnsureOpts = { allowPending?: boolean; allowBanned?: boolean };

/**
 * The signed-in user, verified from the Supabase JWT. Also makes sure the
 * user's Profile row exists (first sign-in) and enforces account status.
 */
export async function requireUser(opts: EnsureOpts = {}): Promise<SessionUser> {
  if (!supabaseConfigured()) throw new UnauthorizedError("Supabase isn't configured yet. See /setup.");
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) throw new UnauthorizedError();
  const email = typeof data.claims.email === "string" ? data.claims.email : "";

  const profile = await ensureProfile(sub, email);
  const emailForRole = profile.email || email;
  const user: SessionUser = {
    id: sub,
    email: emailForRole,
    // Trust the DB role, and always treat configured admin emails as admin.
    role: profile.role === "admin" || isAdminEmail(emailForRole) ? "admin" : "user",
    status: normalizeStatus(profile.status),
  };

  if (user.status === "banned" && !opts.allowBanned) {
    throw new ForbiddenError("Your account has been disabled. Contact support if you think this is a mistake.", "banned");
  }
  if (user.status === "pending" && !opts.allowPending) {
    throw new ForbiddenError("Your account is waiting for an admin to approve it.", "pending");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Admins only.");
  return user;
}

/** Soft gate used by Claude wrappers: paused accounts can't spend API budget. */
export async function assertCanUseAI(userId: string): Promise<void> {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { status: true } });
  const status = normalizeStatus(p?.status);
  if (status === "banned") {
    throw new ForbiddenError("Your account has been disabled.", "banned");
  }
  if (status === "pending") {
    throw new ForbiddenError("Your account is waiting for an admin to approve it.", "pending");
  }
  if (status === "paused") {
    throw new ForbiddenError(
      "Your account is paused, so AI features are temporarily turned off. You can still browse and upload resumes.",
      "paused",
    );
  }
}

/** Session + access info for layouts (null when signed out). */
export async function getAccess(): Promise<SessionUser | null> {
  try {
    return await requireUser({ allowPending: true, allowBanned: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

async function ensureProfile(id: string, email: string) {
  const admin = isAdminEmail(email);
  if (!known.has(id)) {
    const existing = await prisma.profile.findUnique({ where: { id } });
    if (!existing) {
      const created = await prisma.profile.create({
        data: {
          id,
          email,
          role: admin ? "admin" : "user",
          status: admin ? "active" : "pending",
          approvedAt: admin ? new Date() : null,
        },
      });
      known.add(id);
      return created;
    }
    // Existing row: keep status, but promote configured admin emails.
    const updated = await prisma.profile.update({
      where: { id },
      data: {
        ...(email ? { email } : {}),
        ...(admin
          ? {
              role: "admin",
              // Don't override an intentional ban; otherwise keep/reactivate admin.
              ...(existing.status === "banned"
                ? {}
                : { status: "active", approvedAt: existing.approvedAt ?? new Date() }),
            }
          : {}),
      },
    });
    known.add(id);
    return updated;
  }
  // Fast path: still refresh email / admin promotion occasionally via a light read.
  const row = await prisma.profile.findUnique({ where: { id } });
  if (!row) {
    known.delete(id);
    return ensureProfile(id, email);
  }
  if (email && row.email !== email) {
    return prisma.profile.update({ where: { id }, data: { email } });
  }
  if (admin && row.role !== "admin" && row.status !== "banned") {
    return prisma.profile.update({
      where: { id },
      data: { role: "admin", status: "active", approvedAt: row.approvedAt ?? new Date() },
    });
  }
  return row;
}

function normalizeStatus(s: string | null | undefined): AccountStatus {
  if (s === "active" || s === "paused" || s === "banned" || s === "pending") return s;
  return "pending";
}
