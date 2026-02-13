// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function useAuthUserId() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sticky last known user id to avoid transient "null" jamming gated features
  const lastKnownUserIdRef = useRef<string | null>(null);
  const hasResolvedOnceRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const resolveFromSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setAuthError(error.message);
        } else {
          setAuthError(null);
        }

        const nextId = data.session?.user?.id ?? null;

        lastKnownUserIdRef.current = nextId;
        setUserId(nextId);
      } catch (e: any) {
        if (!mounted) return;
        setAuthError(e?.message ?? "Auth error");
      } finally {
        if (!mounted) return;
        if (!hasResolvedOnceRef.current) {
          hasResolvedOnceRef.current = true;
          setAuthLoading(false);
        }
      }
    };

    resolveFromSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      setAuthError(null);

      // Only clear user on a definite sign out
      if (event === "SIGNED_OUT") {
        lastKnownUserIdRef.current = null;
        setUserId(null);
        if (!hasResolvedOnceRef.current) {
          hasResolvedOnceRef.current = true;
          setAuthLoading(false);
        }
        return;
      }

      // If session exists, update immediately
      if (session?.user?.id) {
        lastKnownUserIdRef.current = session.user.id;
        setUserId(session.user.id);
        if (!hasResolvedOnceRef.current) {
          hasResolvedOnceRef.current = true;
          setAuthLoading(false);
        }
        return;
      }

      // Ignore transient null sessions for non-SIGNED_OUT events
      // This prevents features from being disabled mid-session.
      if (!hasResolvedOnceRef.current) {
        hasResolvedOnceRef.current = true;
        setAuthLoading(false);
      }
    });

    // When tab refocuses, re-check session (helps after refresh cycles)
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        resolveFromSession();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [supabase]);

  return { userId, authLoading, authError };
}
