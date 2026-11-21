import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AIError } from "./ai/client";
import { ForbiddenError, requireAdmin, requireUser, UnauthorizedError, type SessionUser } from "./auth";
import { runWithUser } from "./requestContext";

export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
  }
}

/** Wrap a route handler: consistent JSON errors, no stack traces to clients. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 403 });
      }
      if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
      }
      // Prisma "record not found" from findUniqueOrThrow / findFirstOrThrow.
      if ((e as { code?: string })?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
      const status = e instanceof AIError ? 502 : 400;
      console.error("[jobify]", e);
      return NextResponse.json({ error: (e as Error).message ?? "Unexpected error" }, { status });
    }
  };
}

export type Ctx<P extends Record<string, string>> = { params: Promise<P> };

type AuthedOpts = { allowPending?: boolean; allowBanned?: boolean };

/** Route handler that requires a signed-in (and usually approved) user. */
export function authed<P extends Record<string, string> = Record<string, never>>(
  fn: (req: Request, user: SessionUser, ctx: Ctx<P>) => Promise<Response>,
  opts: AuthedOpts = {},
) {
  return handler(async (req: Request, ctx: Ctx<P>) => {
    const user = await requireUser(opts);
    return runWithUser(user.id, () => fn(req, user, ctx));
  });
}

/** Admin-only route. */
export function admined<P extends Record<string, string> = Record<string, never>>(
  fn: (req: Request, user: SessionUser, ctx: Ctx<P>) => Promise<Response>,
) {
  return handler(async (req: Request, ctx: Ctx<P>) => {
    const user = await requireAdmin();
    return runWithUser(user.id, () => fn(req, user, ctx));
  });
}
