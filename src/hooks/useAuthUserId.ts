// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function useAuthUserId() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const lastKnownUserIdRef = useRef<string | null>(null);
  const resolvingRef = useRef(false);

  const applyUser = (nextId: string | null) => {
    lastKnownUserIdRef.current = nextId;
    setUserId(nextId);
  };

  const resolveSession = async (reason: string) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    try {
      // When returning to a tab, restart refresh loop if available
      try {
        (supabase.auth as any).startAutoRefresh?.();
      } catch {}

      // First, try fast session read
      const { data, error } = await supabase.auth.getSession();

      if (!mountedRef.current) return;

      if (error) {
        setAuthError(error.message);
      } else {
        setAuthError(null);
      }

      let sessionUserId = data.session?.user?.id ?? null;

      // If we have no session after tab switch, try to refresh once
      if (!sessionUserId) {
        try {
          const refreshFn = (supabase.auth as any).refreshSession;
          if (typeof refreshFn === "function") {
            const refreshed = await refreshFn.call(supabase.auth);
            sessionUserId = refreshed?.data?.session?.user?.id ?? null;
          }
        } catch {
          // ignore refresh errors, treat as signed out if still null
        }
      }

      applyUser(sessionUserId);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setAuthError(e?.message ?? "Auth error");
    } finally {
      if (!mountedRef.current) return;
      setAuthLoading(false);
      resolvingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Initial resolve
    void resolveSession("mount");

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      setAuthError(null);

      if (event === "SIGNED_OUT") {
        applyUser(null);
        setAuthLoading(false);
        return;
      }

      const nextId = session?.user?.id ?? null;

      // Ignore transient null sessions for non sign-out events
      if (!nextId) return;

      applyUser(nextId);
      setAuthLoading(false);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void resolveSession("visibility");
      } else {
        // Optional: stop refresh when hidden (saves resources)
        try {
          (supabase.auth as any).stopAutoRefresh?.();
        } catch {}
      }
    };

    const onFocus = () => {
      void resolveSession("focus");
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [supabase]);

  return { userId, authLoading, authError };
}
