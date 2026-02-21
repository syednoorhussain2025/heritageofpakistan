import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }

          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });

          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const redirectToSignIn = () => {
    const url = new URL("/auth/sign-in", req.url);
    url.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(url);
  };

  const redirectHome = () => NextResponse.redirect(new URL("/", req.url));

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    console.warn("[middleware] getUser error", {
      pathname,
      error: userErr.message,
    });
  }

  const isMyTrips = /^\/[^/]+\/mytrips(\/.*)?$/.test(pathname);
  const isTripFinalize = /^\/[^/]+\/trip\/[^/]+\/finalize(\/.*)?$/.test(
    pathname
  );
  const isTripBuilder = /^\/[^/]+\/trip\/[^/]+\/?$/.test(pathname);
  const isTripPublic = /^\/[^/]+\/trip\/[^/]+\/public(\/.*)?$/.test(pathname);

  const needsBasicAuth =
    pathname.startsWith("/dashboard") ||
    ((isMyTrips || isTripFinalize || isTripBuilder) && !isTripPublic);

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return res;

    if (!user) return redirectToSignIn();

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.warn("[middleware] admin profile check failed", {
        pathname,
        error: profileErr.message,
      });
      return redirectToSignIn();
    }

    if (!profile?.is_admin) return redirectHome();
    return res;
  }

  if (needsBasicAuth) {
    if (!user) return redirectToSignIn();
    return res;
  }

  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/:username/mytrips/:path*",
    "/:username/trip/:tripSlug/:path*",
    "/:username/trip/:tripSlug",
  ],
};
