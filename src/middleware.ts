import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Refreshes the Supabase session on every request and keeps signed-out users
// out: pages redirect to /login, API routes get 401. Route handlers still
// verify the user themselves (requireUser) — this is the first line only.

const PUBLIC_PAGES = ["/login", "/auth"];
const PUBLIC_API = ["/api/discovery", "/api/health"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (path.startsWith("/api/") || path === "/setup") return response;
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Validates the JWT (and refreshes it if needed). Don't run code between
  // client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn) {
    if (path.startsWith("/api/")) {
      if (PUBLIC_API.some((p) => path.startsWith(p))) return response;
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    if (!PUBLIC_PAGES.some((p) => path.startsWith(p)) && path !== "/setup") {
      const url = new URL("/login", request.url);
      if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  } else if (path === "/login" || path === "/") {
    // Home is the landing page.
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
