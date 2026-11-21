import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { completeAuth, OAUTH_COOKIE } from "@/lib/google";
import { syncInbox } from "@/lib/inbox";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after consent. Verifies state, exchanges the code, stores encrypted tokens. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (q: string) => {
    const res = NextResponse.redirect(`${origin}/settings?${q}#connections`);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/integrations/google", maxAge: 0 });
    return res;
  };

  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }

  const err = url.searchParams.get("error");
  if (err) return done(`gmail_error=${encodeURIComponent(err === "access_denied" ? "You didn't allow access, so Gmail wasn't connected." : err)}`);

  let saved: { state?: string; verifier?: string; uid?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    /* treated as missing */
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!saved.state || !saved.verifier || saved.uid !== userId || !same(saved.state, state) || !code) {
    return done(`gmail_error=${encodeURIComponent("That sign-in link expired or didn't match. Please connect again.")}`);
  }

  try {
    await completeAuth(userId, origin, code, saved.verifier);
  } catch (e) {
    return done(`gmail_error=${encodeURIComponent((e as Error).message)}`);
  }
  // First check in the background; the page shows progress via lastSyncAt.
  void syncInbox(userId).catch((e) => console.error("[jobify] first Gmail sync failed", (e as Error).message));
  return done("gmail=connected");
}
