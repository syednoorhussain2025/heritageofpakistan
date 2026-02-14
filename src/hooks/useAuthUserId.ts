// src/hooks/useAuthUserId.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const AUTH_OP_TIMEOUT_MS = 8000;

type ResolveOptions = {
  forceRefresh?: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Auth operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export function useAuthUserId() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const resolvingRef = useRef(false);
  const rerunRef = useRef<ResolveOptions | null>(null);

  const resolveUser = useCallback(
    async (options: ResolveOptions = {}) => {
      if (resolvingRef.current) {
        rerunRef.current = {
          forceRefresh:
            Boolean(rerunRef.current?.forceRefresh) ||
            Boolean(options.forceRefresh),
        };
        return;
      }

      resolvingRef.current = true;

      try {
        let sessionUserId: string | null = null;

        const { data: sessionData } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_OP_TIMEOUT_MS
        );

        if (options.forceRefresh && sessionData.session) {
          const { data: refreshedData } = await withTimeout(
            supabase.auth.refreshSession(),
            AUTH_OP_TIMEOUT_MS
          );
          sessionUserId = refreshedData.session?.user?.id ?? null;
        } else {
          sessionUserId = sessionData.session?.user?.id ?? null;
        }

        if (sessionUserId) {
          if (!mountedRef.current) return;
          setAuthError(null);
          setUserId(sessionUserId);
          return;
        }

        const { data: userData, error: userError } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_OP_TIMEOUT_MS
        );

        if (!mountedRef.current) return;

        if (userError) {
          setAuthError(userError.message);
          setUserId(null);
          return;
        }

        setAuthError(null);
        setUserId(userData.user?.id ?? null);
      } catch (e: any) {
        if (!mountedRef.current) return;
        setAuthError(e?.message ?? "Auth error");
      } finally {
        if (!mountedRef.current) return;
        setAuthLoading(false);
        resolvingRef.current = false;

        if (rerunRef.current) {
          const next = rerunRef.current;
          rerunRef.current = null;
          void resolveUser(next);
        }
      }
    },
    [supabase]
  );

  useEffect(() => {
    mountedRef.current = true;

    void resolveUser({ forceRefresh: true });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === "SIGNED_OUT") {
        setAuthError(null);
        setUserId(null);
        setAuthLoading(false);
        return;
      }

      const nextUserId = session?.user?.id ?? null;
      if (nextUserId) {
        setAuthError(null);
        setUserId(nextUserId);
        setAuthLoading(false);
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void resolveUser({ forceRefresh: true });
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void resolveUser({ forceRefresh: true });
      }
    };

    const onFocus = () => {
      void resolveUser({ forceRefresh: true });
    };

    const onOnline = () => {
      void resolveUser({ forceRefresh: true });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [resolveUser, supabase]);

  return { userId, authLoading, authError };
}
