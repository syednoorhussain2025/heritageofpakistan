import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

const AUTH_TIMEOUT_MS = 7000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Auth check timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return res;
  }

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

  const redirectToSignIn = () => {
    const url = new URL("/auth/sign-in", req.url);
    url.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(url);
  };

  const redirectHome = () => NextResponse.redirect(new URL("/", req.url));

  const getUserSafe = async (): Promise<User | null> => {
    try {
      const {
        data: { user },
        error,
      } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
      if (error) {
        console.warn("[middleware] getUser error", error.message);
        return null;
      }
      return user ?? null;
    } catch (error) {
      console.warn("[middleware] getUser failed", {
        pathname,
        error: (error as any)?.message ?? String(error),
      });
      return null;
    }
  };

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

    const user = await getUserSafe();
    if (!user) return redirectToSignIn();

    try {
      const { data: profile, error } = await withTimeout(
        supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
        AUTH_TIMEOUT_MS
      );

      if (error) {
        console.warn("[middleware] admin profile check failed", error.message);
        return redirectToSignIn();
      }

      if (!profile?.is_admin) return redirectHome();
      return res;
    } catch (error) {
      console.warn("[middleware] admin profile check timed out", {
        pathname,
        error: (error as any)?.message ?? String(error),
      });
      return redirectToSignIn();
    }
  }

  if (needsBasicAuth) {
    const user = await getUserSafe();
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
