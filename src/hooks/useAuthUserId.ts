// src/hooks/useAuthUserId.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const AUTH_OP_TIMEOUT_MS = 8000;
const REFRESH_WINDOW_SECONDS = 120;

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
  const rerunForceRef = useRef(false);

  const resolveUser = useCallback(
    async (forceRefresh = false) => {
      if (resolvingRef.current) {
        rerunForceRef.current = rerunForceRef.current || forceRefresh;
        return;
      }
      resolvingRef.current = true;

      try {
        const { data: sessionData } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_OP_TIMEOUT_MS
        );

        let session = sessionData.session;

        if (forceRefresh && session) {
          const expiresAt = session.expires_at ?? 0;
          const nowSec = Math.floor(Date.now() / 1000);
          const expiresSoon =
            expiresAt > 0 && expiresAt - nowSec < REFRESH_WINDOW_SECONDS;

          if (expiresSoon) {
            const { data: refreshed } = await withTimeout(
              supabase.auth.refreshSession(),
              AUTH_OP_TIMEOUT_MS
            );
            session = refreshed.session;
          }
        }

        if (!mountedRef.current) return;

        if (session?.user?.id) {
          setAuthError(null);
          setUserId(session.user.id);
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
        } else {
          setAuthError(null);
          setUserId(userData.user?.id ?? null);
        }
      } catch (e: any) {
        if (!mountedRef.current) return;
        setAuthError(e?.message ?? "Auth error");
        setUserId(null);
      } finally {
        if (!mountedRef.current) return;
        setAuthLoading(false);
        resolvingRef.current = false;

        if (rerunForceRef.current) {
          const rerunForce = rerunForceRef.current;
          rerunForceRef.current = false;
          void resolveUser(rerunForce);
        }
      }
    },
    [supabase]
  );

  useEffect(() => {
    mountedRef.current = true;

    void resolveUser(true);

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
        void resolveUser(false);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void resolveUser(true);
      }
    };

    const onFocus = () => {
      void resolveUser(true);
    };

    const onOnline = () => {
      void resolveUser(true);
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
