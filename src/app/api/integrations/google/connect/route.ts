import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { googleConfigured, OAUTH_COOKIE, startAuth } from "@/lib/google";

/** Start "Connect Gmail": redirect to Google's consent screen (read-only Gmail). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const back = (msg: string) => NextResponse.redirect(`${origin}/settings?gmail_error=${encodeURIComponent(msg)}#connections`);
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }
  if (!googleConfigured()) return back("Gmail isn't set up yet: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY to .env.local.");

  const { url, state, verifier } = startAuth(origin);
  const res = NextResponse.redirect(url);
  // Short-lived, HTTP-only: ties Google's callback to this browser and this user (CSRF + PKCE).
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, uid: userId }), {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return res;
}
