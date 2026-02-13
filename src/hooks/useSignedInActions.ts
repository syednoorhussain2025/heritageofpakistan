// src/hooks/useSignedInActions.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";

/**
 * Ensures an action only runs if the user is signed in.
 * If not signed in, redirects to /auth/sign-in with redirectTo.
 * Returns true if signed in, false otherwise.
 */
function safeRedirectTo(next: string, fallback: string) {
  const trimmed = (next || "").trim();
  if (!trimmed) return fallback;

  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes("://")
  ) {
    return trimmed;
  }

  return fallback;
}

export function useSignedInActions() {
  const { userId, authLoading } = useAuthUserId();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Fast session signal so buttons do not feel "dead" after redirect
  const sb = useMemo(() => createClient(), []);
  const [fastSignedIn, setFastSignedIn] = useState(false);
  const [fastReady, setFastReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    sb.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setFastSignedIn(!!data.session?.user);
        setFastReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFastSignedIn(false);
        setFastReady(true);
      });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setFastSignedIn(!!session?.user);
      setFastReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [sb]);

  const currentUrl = useMemo(() => {
    const qs = sp?.toString();
    const raw = qs ? `${pathname}?${qs}` : pathname;
    return safeRedirectTo(raw, "/");
  }, [pathname, sp]);

  function ensureSignedIn(): boolean {
    // Prefer the fastest reliable signal
    const signedIn = !!userId || fastSignedIn;
    if (signedIn) return true;

    // If both are still resolving, avoid a "do nothing forever" state
    // Once fastReady is true, we can confidently redirect if not signed in
    if (authLoading && !fastReady) return false;

    router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: !!userId || fastSignedIn,
    // expose a "ready" style boolean if you want to disable UI briefly
    authLoading: authLoading && !fastReady,
  };
}
