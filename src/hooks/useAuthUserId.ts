// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

const AUTH_OP_TIMEOUT_MS = 8000;
const REFRESH_WINDOW_SECONDS = 120;

type AuthState = {
  userId: string | null;
  authLoading: boolean;
  authError: string | null;
};

let sharedClient: SupabaseClient | null = null;
let sharedInitialized = false;
let sharedResolving = false;
let sharedQueuedForceRefresh = false;

let sharedState: AuthState = {
  userId: null,
  authLoading: true,
  authError: null,
};

const sharedListeners = new Set<(state: AuthState) => void>();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Auth operation timed out after ${timeoutMs}ms`));
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

function getClient(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient();
  }
  return sharedClient;
}

function emitState() {
  for (const listener of sharedListeners) {
    listener(sharedState);
  }
}

function patchState(patch: Partial<AuthState>) {
  sharedState = { ...sharedState, ...patch };
  emitState();
}

async function resolveSharedAuth(forceRefresh = false) {
  if (sharedResolving) {
    sharedQueuedForceRefresh = sharedQueuedForceRefresh || forceRefresh;
    return;
  }
  sharedResolving = true;

  try {
    const supabase = getClient();
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

    if (session?.user?.id) {
      patchState({
        userId: session.user.id,
        authLoading: false,
        authError: null,
      });
      return;
    }

    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_OP_TIMEOUT_MS
    );

    if (userError) {
      patchState({
        userId: null,
        authLoading: false,
        authError: userError.message,
      });
      return;
    }

    patchState({
      userId: userData.user?.id ?? null,
      authLoading: false,
      authError: null,
    });
  } catch (e: any) {
    patchState({
      userId: null,
      authLoading: false,
      authError: e?.message ?? "Auth error",
    });
  } finally {
    sharedResolving = false;

    if (sharedQueuedForceRefresh) {
      const rerunForce = sharedQueuedForceRefresh;
      sharedQueuedForceRefresh = false;
      void resolveSharedAuth(rerunForce);
    }
  }
}

function initSharedAuthRuntime() {
  if (sharedInitialized) return;
  if (typeof window === "undefined") return;

  sharedInitialized = true;
  const supabase = getClient();

  void resolveSharedAuth(true);

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      patchState({ userId: null, authError: null, authLoading: false });
      return;
    }

    const nextUserId = session?.user?.id ?? null;
    if (nextUserId) {
      patchState({ userId: nextUserId, authError: null, authLoading: false });
      return;
    }

    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED"
    ) {
      void resolveSharedAuth(false);
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void resolveSharedAuth(true);
    }
  };

  const onFocus = () => {
    void resolveSharedAuth(true);
  };

  const onOnline = () => {
    void resolveSharedAuth(true);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  window.addEventListener("beforeunload", () => {
    sub.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
  });
}

export function useAuthUserId() {
  const [state, setState] = useState<AuthState>(sharedState);

  useEffect(() => {
    initSharedAuthRuntime();

    const onState = (nextState: AuthState) => {
      setState(nextState);
    };

    sharedListeners.add(onState);
    onState(sharedState);

    return () => {
      sharedListeners.delete(onState);
    };
  }, []);

  return state;
}
