// src/hooks/useSignedInActions.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export function useSignedInActions() {
  const { userId, authLoading } = useAuthUserId();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const sb = useMemo(() => createClient(), []);

  // "Fast" auth state from Supabase client
  const [fastSignedIn, setFastSignedIn] = useState(false);
  const [fastReady, setFastReady] = useState(false);

  // Sticky "last known" auth state to avoid post-load jamming
  const knownSignedInRef = useRef<boolean | null>(null);
  const [knownSignedIn, setKnownSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    // If either signal says signed in, treat as known signed in
    if (userId) {
      if (knownSignedInRef.current !== true) {
        knownSignedInRef.current = true;
        setKnownSignedIn(true);
      }
      return;
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    sb.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const signed = !!data.session?.user;
        setFastSignedIn(signed);
        setFastReady(true);

        if (knownSignedInRef.current !== signed) {
          knownSignedInRef.current = signed;
          setKnownSignedIn(signed);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFastSignedIn(false);
        setFastReady(true);

        if (knownSignedInRef.current !== false) {
          knownSignedInRef.current = false;
          setKnownSignedIn(false);
        }
      });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const signed = !!session?.user;
      setFastSignedIn(signed);
      setFastReady(true);

      if (knownSignedInRef.current !== signed) {
        knownSignedInRef.current = signed;
        setKnownSignedIn(signed);
      }
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
    // Use sticky known state first
    if (knownSignedIn === true) return true;

    // If we have never established auth state yet, avoid redirect loops
    if ((authLoading && knownSignedIn === null) || (!fastReady && knownSignedIn === null)) {
      return false;
    }

    // Known signed out (or confirmed by fast state)
    if (knownSignedIn === false || (!userId && fastReady && !fastSignedIn)) {
      router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
      return false;
    }

    // Fallback: treat as not signed in
    router.push(`/auth/sign-in?redirectTo=${encodeURIComponent(currentUrl)}`);
    return false;
  }

  return {
    ensureSignedIn,
    isSignedIn: knownSignedIn === true,
    // This "loading" is only true until we have a known state once
    authLoading: knownSignedIn === null,
  };
}
