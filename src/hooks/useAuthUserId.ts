// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

const AUTH_OP_TIMEOUT_MS = 10000;

type AuthState = {
  userId: string | null;
  authLoading: boolean;
  authError: string | null;
};

let sharedClient: SupabaseClient | null = null;
let sharedInitialized = false;
let sharedResolving = false;
let sharedQueuedResolve = false;

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

async function resolveSharedAuth() {
  if (sharedResolving) {
    sharedQueuedResolve = true;
    return;
  }
  sharedResolving = true;

  try {
    const supabase = getClient();
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_OP_TIMEOUT_MS
    );
    if (sessionError) throw sessionError;

    const session = sessionData.session;

    if (session?.user?.id) {
      patchState({
        userId: session.user.id,
        authLoading: false,
        authError: null,
      });
      return;
    }

    patchState({
      userId: null,
      authLoading: false,
      authError: null,
    });
  } catch (e: any) {
    patchState({
      userId: sharedState.userId,
      authLoading: false,
      authError: e?.message ?? "Auth error",
    });
  } finally {
    sharedResolving = false;

    if (sharedQueuedResolve) {
      sharedQueuedResolve = false;
      void resolveSharedAuth();
    }
  }
}

function initSharedAuthRuntime() {
  if (sharedInitialized) return;
  if (typeof window === "undefined") return;

  sharedInitialized = true;
  const supabase = getClient();

  void resolveSharedAuth();

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
      event === "USER_UPDATED"
    ) {
      void resolveSharedAuth();
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void resolveSharedAuth();
    }
  };

  const onFocus = () => {
    void resolveSharedAuth();
  };

  const onOnline = () => {
    void resolveSharedAuth();
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
