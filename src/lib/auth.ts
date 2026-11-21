import { prisma } from "./db";
import { supabaseConfigured } from "./supabase/config";
import { createSupabaseServer } from "./supabase/server";

export interface SessionUser {
  id: string;
  email: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Please sign in.") {
    super(message);
  }
}

/**
 * The signed-in user, verified from the Supabase JWT. Also makes sure the
 * user's Profile row exists (first sign-in).
 */
export async function requireUser(): Promise<SessionUser> {
  if (!supabaseConfigured()) throw new UnauthorizedError("Supabase isn't configured yet. See /setup.");
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) throw new UnauthorizedError();
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  if (!known.has(sub)) {
    await prisma.profile.upsert({
      where: { id: sub },
      create: { id: sub, email },
      update: email ? { email } : {},
    });
    known.add(sub);
  }
  return { id: sub, email };
}

const g = globalThis as unknown as { jobifyKnownUsers?: Set<string> };
const known = (g.jobifyKnownUsers ??= new Set<string>());
