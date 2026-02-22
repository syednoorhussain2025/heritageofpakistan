// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

type AuthState = {
  userId: string | null;
  authLoading: boolean;
  authError: string | null;
};

let sharedClient: SupabaseClient | null = null;
let sharedInitialized = false;
let sharedResolving = false;
let sharedQueuedResolve = false;

// Debounce repeated event-driven re-checks (visibility/focus/online) to avoid
// hammering the server when the user rapidly switches tabs.
let lastEventResolveMs = 0;
const EVENT_RESOLVE_DEBOUNCE_MS = 3000;

let sharedState: AuthState = {
  userId: null,
  authLoading: true,
  authError: null,
};

const sharedListeners = new Set<(state: AuthState) => void>();

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

/**
 * Validate auth state with the Supabase server.
 *
 * We intentionally use `getUser()` — NOT `getSession()` — because:
 *   • `getSession()` reads from localStorage/memory and can return a stale or
 *     expired token without checking the server.
 *   • `getUser()` validates the JWT with Supabase, triggers a token refresh if
 *     the access token is expired (using the refresh token), and returns null
 *     when the session is truly gone.
 *
 * @param fromEvent  true when called from a DOM event handler (applies debounce)
 */
async function resolveSharedAuth(fromEvent = false) {
  if (fromEvent) {
    const now = Date.now();
    if (now - lastEventResolveMs < EVENT_RESOLVE_DEBOUNCE_MS) return;
    lastEventResolveMs = now;
  }

  if (sharedResolving) {
    sharedQueuedResolve = true;
    return;
  }
  sharedResolving = true;

  try {
    const supabase = getClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      // Supabase auth errors (JWT expired, invalid token, etc.) have
      // __isAuthError === true.  These mean the user is definitively signed out.
      // Plain network / fetch errors don't have that flag — in that case we
      // preserve the existing userId so a momentary connectivity blip doesn't
      // silently sign the user out of the UI.
      const isDefinitiveAuthFailure = (error as any).__isAuthError === true;
      if (isDefinitiveAuthFailure) {
        patchState({ userId: null, authLoading: false, authError: null });
      } else {
        // Transient network error — stop the loading spinner but keep state.
        patchState({ authLoading: false, authError: null });
      }
      return;
    }

    patchState({
      userId: user?.id ?? null,
      authLoading: false,
      authError: null,
    });
  } catch {
    // Unknown error — stop loading, preserve existing state.
    patchState({ authLoading: false, authError: null });
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

  // Initial server-validated check on page load (no debounce).
  void resolveSharedAuth();

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      patchState({ userId: null, authError: null, authLoading: false });
      return;
    }

    // For SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — if the event carries a
    // valid session we trust it directly (it came straight from Supabase).
    const nextUserId = session?.user?.id ?? null;
    if (nextUserId) {
      patchState({ userId: nextUserId, authError: null, authLoading: false });
      return;
    }

    // Session is null for INITIAL_SESSION (no user) or unusual SIGNED_IN /
    // USER_UPDATED without a session — fall back to a server round-trip.
    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "USER_UPDATED"
    ) {
      void resolveSharedAuth();
    }
  });

  // Re-validate auth when the tab becomes visible, the window regains focus,
  // or the device reconnects.  These use the debounce to avoid back-to-back
  // network calls when e.g. alt-tabbing rapidly.
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
    // Sync immediately in case sharedState changed between render and effect.
    onState(sharedState);

    return () => {
      sharedListeners.delete(onState);
    };
  }, []);

  return state;
}
