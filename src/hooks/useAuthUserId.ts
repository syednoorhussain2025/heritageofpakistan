// src/hooks/useAuthUserId.ts
"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

type AuthState = {
  userId: string | null;
  authLoading: boolean;
  authError: string | null;
  authUnknown: boolean;
  lastValidatedAt: number | null;
};

let sharedClient: SupabaseClient | null = null;
let sharedInitialized = false;
let sharedResolving = false;
let sharedQueuedResolve = false;
let sharedRuntimeCleanup: (() => void) | null = null;

// Debounce repeated event-driven re-checks (visibility/focus/online) to avoid
// hammering the server when the user rapidly switches tabs.
let lastEventResolveMs = 0;
const EVENT_RESOLVE_DEBOUNCE_MS = 3000;

let sharedState: AuthState = {
  userId: null,
  authLoading: true,
  authError: null,
  authUnknown: true,
  lastValidatedAt: null,
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

/**
 * Only update shared state and trigger React re-renders when something
 * actually changed.  TOKEN_REFRESHED, tab-switch re-validations, and
 * duplicate SIGNED_IN events all fire patchState with the same userId —
 * without this guard they would cause the entire MapPage (and every other
 * subscriber) to re-render for no reason, causing visible UI jank.
 */
function patchState(patch: Partial<AuthState>) {
  const next = { ...sharedState, ...patch };
  if (
    next.userId === sharedState.userId &&
    next.authLoading === sharedState.authLoading &&
    next.authError === sharedState.authError &&
    next.authUnknown === sharedState.authUnknown &&
    next.lastValidatedAt === sharedState.lastValidatedAt
  ) {
    return; // nothing changed — skip the emit entirely
  }
  sharedState = next;
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
 * Exception: for event-driven re-checks (tab switch, focus, online) we first
 * consult the local session cache.  If the session is still valid and not close
 * to expiring we skip the round-trip entirely — the Supabase client's own
 * autoRefreshToken already handles silent renewal.
 *
 * @param fromEvent  true when called from a DOM event handler (applies debounce + local-cache fast-path)
 */
async function resolveSharedAuth(fromEvent = false) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    // Offline: avoid server calls; keep any known userId and mark auth as unresolved.
    patchState({
      authLoading: false,
      authError: null,
      authUnknown: true,
    });
    return;
  }

  if (fromEvent) {
    const now = Date.now();
    if (now - lastEventResolveMs < EVENT_RESOLVE_DEBOUNCE_MS) return;
    lastEventResolveMs = now;

    // Fast-path for tab-switch / focus / online events: if we already have a
    // known userId and the local session is fresh (> 60 s to expiry), there is
    // no need to hit the Supabase auth server.  autoRefreshToken handles silent
    // renewal automatically; we only need a server round-trip when the session
    // looks expired or is missing entirely.
    if (sharedState.userId !== null && !sharedState.authLoading) {
      try {
        const { data: { session } } = await getClient().auth.getSession();
        if (session?.user?.id === sharedState.userId) {
          // userId matches — session is still valid.
          // Only fall through to getUser() if expires_at is present AND close to expiry.
          const expiresAt = session.expires_at;
          if (
            typeof expiresAt !== "number" ||
            expiresAt * 1000 > Date.now() + 60_000
          ) {
            // Session is valid and fresh (or no expiry info — trust it).
            return;
          }
        }
      } catch {
        // Ignore — fall through to full getUser() check.
      }
    }
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
        patchState({
          userId: null,
          authLoading: false,
          authError: null,
          authUnknown: false,
          lastValidatedAt: Date.now(),
        });
      } else {
        // Transient network error — stop the loading spinner but keep state.
        patchState({
          authLoading: false,
          authError: null,
          authUnknown: true,
        });
      }
      return;
    }

    patchState({
      userId: user?.id ?? null,
      authLoading: false,
      authError: null,
      authUnknown: false,
      lastValidatedAt: Date.now(),
    });
  } catch {
    // Unknown error — stop loading, preserve existing state.
    patchState({
      authLoading: false,
      authError: null,
      authUnknown: true,
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

  if (sharedRuntimeCleanup) {
    try {
      sharedRuntimeCleanup();
    } catch {
      // no-op
    }
    sharedRuntimeCleanup = null;
  }

  sharedInitialized = true;
  const supabase = getClient();

  // Initial server-validated check on page load (no debounce).
  void resolveSharedAuth();

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      patchState({
        userId: null,
        authError: null,
        authLoading: false,
        authUnknown: false,
        lastValidatedAt: Date.now(),
      });
      return;
    }

    // For SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — if the event carries a
    // valid session we trust it directly (it came straight from Supabase).
    // patchState will no-op if the userId hasn't actually changed (e.g. on
    // TOKEN_REFRESHED for the same user), preventing pointless re-renders.
    const nextUserId = session?.user?.id ?? null;
    if (nextUserId) {
      patchState({
        userId: nextUserId,
        authError: null,
        authLoading: false,
        authUnknown: false,
        lastValidatedAt: Date.now(),
      });
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
  // or the device reconnects.  These use the debounce + local-cache fast-path
  // to avoid unnecessary server calls when the session is already valid.
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

  const cleanup = () => {
    sub.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("beforeunload", cleanup);
    sharedRuntimeCleanup = null;
    sharedInitialized = false;
  };

  sharedRuntimeCleanup = cleanup;
  window.addEventListener("beforeunload", cleanup);
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
