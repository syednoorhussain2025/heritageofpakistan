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

  const sb = useMemo(() => createClient(), []);

  // Fast session signal so gated clicks work immediately after redirect
  const [fastSignedIn, setFastSignedIn] = useState(false);
  const [fastReady, setFastReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 1) Quick local read
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

    // 2) Instant updates on auth events
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
    // Prefer confirmed userId, but fall back to fast session detection
    const signedIn = !!userId || fastSignedIn;

    if (signedIn) return true;

    // If auth is still resolving and we do not yet know, do not redirect again
    // This prevents loops and "dead clicks" turning into repeated sign-in pushes.
    if (authLoading && !fastReady) return false;

    router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: !!userId || fastSignedIn,
    authLoading: authLoading && !fastReady,
  };
}
