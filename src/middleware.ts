// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // Keep the same response reference throughout
  const res = NextResponse.next();
  const { pathname, search } = req.nextUrl;

  // Ignore framework & static assets
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return res;
  }

  // Initialize Supabase with cookie passthrough
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Helper: redirect to sign-in
  const redirectToSignIn = () => {
    const url = new URL("/auth/sign-in", req.url);
    url.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(url);
  };

  // ─────────────── ADMIN ROUTES ───────────────
  if (pathname.startsWith("/admin")) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return redirectToSignIn();

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      const homeUrl = new URL("/", req.url);
      return NextResponse.redirect(homeUrl);
    }
    return res;
  }

  // ─────────────── DASHBOARD ROUTES ───────────────
  if (pathname.startsWith("/dashboard")) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return redirectToSignIn();
    return res;
  }

  // ─────────────── USER/TRIP ROUTES ───────────────
  // /:username/mytrips
  const isMyTrips = /^\/[^/]+\/mytrips(\/.*)?$/.test(pathname);

  // /:username/trip/:tripSlug/finalize
  const isTripFinalize = /^\/[^/]+\/trip\/[^/]+\/finalize(\/.*)?$/.test(
    pathname
  );

  // /:username/trip/:tripSlug  (the Trip Builder page itself)
  // Exact match on the builder root (optional trailing slash), excluding subpaths like /public or /finalize
  const isTripBuilder = /^\/[^/]+\/trip\/[^/]+\/?$/.test(pathname);

  // Public page should remain open:
  // /:username/trip/:tripSlug/public
  const isTripPublic = /^\/[^/]+\/trip\/[^/]+\/public(\/.*)?$/.test(pathname);

  if ((isMyTrips || isTripFinalize || isTripBuilder) && !isTripPublic) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return redirectToSignIn();
    return res;
  }

  return res;
}

// Ensure middleware runs on all relevant routes
export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/:username/mytrips/:path*",
    // Match all trip pages (builder root, finalize, public, etc.); logic above decides which require auth
    "/:username/trip/:tripSlug/:path*",
    // Also match the builder root without extra segments
    "/:username/trip/:tripSlug",
  ],
};
