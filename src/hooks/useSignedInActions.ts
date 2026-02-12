// src/hooks/useSignedInActions.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";

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

const AUTH_RETURN_FLAG = "auth:returning";

export function useSignedInActions() {
  const { userId, authLoading } = useAuthUserId();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const sb = useMemo(() => createClient(), []);

  // Fast session signal
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
    const signedIn = !!userId || fastSignedIn;
    if (signedIn) return true;

    // Avoid loops while auth is still resolving
    if (authLoading && !fastReady) return false;

    try {
      window.sessionStorage?.setItem(AUTH_RETURN_FLAG, "1");
    } catch {}

    router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: !!userId || fastSignedIn,
    authLoading: authLoading && !fastReady,
  };
}
