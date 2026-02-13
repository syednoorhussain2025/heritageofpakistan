// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function useAuthUserId() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const resolvingRef = useRef(false);

  const resolveUser = async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;

    try {
      // getUser is the recommended stable call in supabase-js v2
      const { data, error } = await supabase.auth.getUser();

      if (!mountedRef.current) return;

      if (error) {
        setAuthError(error.message);
        setUserId(null);
      } else {
        setAuthError(null);
        setUserId(data.user?.id ?? null);
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      setAuthError(e?.message ?? "Auth error");
      setUserId(null);
    } finally {
      if (!mountedRef.current) return;
      setAuthLoading(false);
      resolvingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Initial resolve
    void resolveUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      setAuthError(null);
      setUserId(session?.user?.id ?? null);
      setAuthLoading(false);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") void resolveUser();
    };

    const onFocus = () => {
      void resolveUser();
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
