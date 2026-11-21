import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// Landing point for email confirmation, password-reset and OAuth links:
// exchanges the one-time code for a session cookie, then continues.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/home";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/home";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  const err = url.searchParams.get("error_description") ?? "That sign-in link is invalid or has expired.";
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err)}`, url.origin));
}
