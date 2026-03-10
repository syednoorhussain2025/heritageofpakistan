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

// Used only for the initial server round-trip (getUser).
const AUTH_GET_USER_TIMEOUT_MS = 8000;
// getSession() should not block forever on auth lock contention.
const AUTH_GET_SESSION_TIMEOUT_MS = 5000;
// Token refresh is a single HTTP POST — allow a bit more time.
const REFRESH_SESSION_TIMEOUT_MS = 12_000;
// Refresh the access token if it expires within this many seconds.
const TOKEN_EXPIRY_BUFFER_SECS = 300; // 5 minutes
// Proactive refresh poll: check every 55 min while the tab is visible.
// (Default Supabase access tokens expire after 1 hour.)
const PROACTIVE_REFRESH_INTERVAL_MS = 55 * 60 * 1000;

let sharedState: AuthState = {
  userId: null,
  authLoading: true,
  authError: null,
  authUnknown: true,
  lastValidatedAt: null,
};

const sharedListeners = new Set<(state: AuthState) => void>();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
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

/**
 * Only emit to React when something meaningful changed.
 * TOKEN_REFRESHED, tab-switch re-validations, and duplicate events all fire
 * patchState with the same userId — without this guard they cause needless
 * re-renders of every subscriber.
 *
 * lastValidatedAt is intentionally excluded from the equality check: it
 * changes on every refresh even when the user hasn't changed, and would
 * cause a full render of every subscriber on every token refresh.
 */
function patchState(patch: Partial<AuthState>) {
  const next = { ...sharedState, ...patch };
  if (
    next.userId === sharedState.userId &&
    next.authLoading === sharedState.authLoading &&
    next.authError === sharedState.authError &&
    next.authUnknown === sharedState.authUnknown
  ) {
    sharedState = next; // persist lastValidatedAt silently
    return;
  }
  sharedState = next;
  emitState();
}

/**
 * Resolves auth state using a two-phase approach that avoids lock contention:
 *
 *   Phase 1 — getSession() (localStorage read, no network).
 *             Fast; runs on every tab-return.
 *
 *   Phase 2 — If the access token is expired/close to expiry: refreshSession().
 *             One network call, under OUR control (not Supabase's auto-refresh).
 *             With autoRefreshToken: false there is no competing lock holder,
 *             so the lock is acquired immediately every time.
 *
 *   Phase 3 — Only on initial page load (fullValidation=true): getUser().
 *             Validates the token with the Supabase server to detect revoked
 *             sessions. Skipped on ordinary tab-return checks to avoid an
 *             unnecessary round-trip when the local token is still valid.
 *
 * Why not autoRefreshToken: true?
 *   Supabase registers its own visibilitychange listener that calls
 *   _recoverAndRefresh(), which acquires a navigator.locks lock with no
 *   timeout. Our getUser() calls also acquire the same lock (acquireTimeout
 *   = -1 = wait forever). When the tab returns after token expiry, both race
 *   for the lock and the app freezes permanently until hard-refresh.
 */
async function resolveSharedAuth(fullValidation = false) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    patchState({ authLoading: false, authError: null, authUnknown: true });
    return;
  }

  if (sharedResolving) {
    sharedQueuedResolve = true;
    return;
  }
  sharedResolving = true;

  try {
    const supabase = getClient();

    // ── Phase 1: read session from storage (no network). ────────────────────
    const {
      data: { session },
    } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_GET_SESSION_TIMEOUT_MS,
      "auth.getSession"
    );

    if (!session) {
      patchState({
        userId: null,
        authLoading: false,
        authError: null,
        authUnknown: false,
        lastValidatedAt: Date.now(),
      });
      return;
    }

    // ── Phase 2: refresh if expired or close to expiry. ─────────────────────
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;

    if (expiresAt - now < TOKEN_EXPIRY_BUFFER_SECS) {
      try {
        const { data: refreshData, error: refreshError } = await withTimeout(
          supabase.auth.refreshSession(),
          REFRESH_SESSION_TIMEOUT_MS,
          "auth.refreshSession"
        );

        if (refreshError) {
          // __isAuthError = true → expired/revoked refresh token → sign out.
          // Network / AbortError → transient; keep existing userId, mark unknown.
          const isDefinitive = (refreshError as any).__isAuthError === true;
          patchState(
            isDefinitive
              ? {
                  userId: null,
                  authLoading: false,
                  authError: null,
                  authUnknown: false,
                  lastValidatedAt: Date.now(),
                }
              : { authLoading: false, authError: null, authUnknown: true }
          );
          return;
        }

        if (refreshData?.session) {
          patchState({
            userId: refreshData.session.user.id,
            authLoading: false,
            authError: null,
            authUnknown: false,
            lastValidatedAt: Date.now(),
          });
        }
      } catch {
        // Network error / fetch abort (stale TCP) — transient, don't sign out.
        patchState({ authLoading: false, authError: null, authUnknown: true });
      }
      return;
    }

    // ── Phase 3: token is locally valid. ────────────────────────────────────
    if (!fullValidation) {
      // Tab-return fast path: trust the local session. Avoids a server
      // round-trip on every tab switch when the token is still valid.
      patchState({
        userId: session.user.id,
        authLoading: false,
        authError: null,
        authUnknown: false,
        lastValidatedAt: Date.now(),
      });
      return;
    }

    // Initial page load: validate with the server to detect revoked sessions.
    const {
      data: { user },
      error,
    } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_GET_USER_TIMEOUT_MS,
      "auth.getUser"
    );

    if (error) {
      const isDefinitive = (error as any).__isAuthError === true;
      patchState(
        isDefinitive
          ? {
              userId: null,
              authLoading: false,
              authError: null,
              authUnknown: false,
              lastValidatedAt: Date.now(),
            }
          : { authLoading: false, authError: null, authUnknown: true }
      );
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
    patchState({ authLoading: false, authError: null, authUnknown: true });
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

  // Initial load: full server validation.
  void resolveSharedAuth(true);

  const queueResolve = (fullValidation = false) => {
    window.setTimeout(() => void resolveSharedAuth(fullValidation), 0);
  };

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      // Re-verify with the server before clearing state.  A dropped TCP
      // connection during a manual refreshSession() can cause Supabase to
      // fire SIGNED_OUT even though the session is still valid server-side.
      // Defer auth calls out of this callback to avoid lock re-entry.
      queueResolve();
      return;
    }

    // For SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — trust the event's session
    // directly. patchState no-ops when userId hasn't changed (e.g. TOKEN_REFRESHED
    // for the same user), preventing pointless re-renders.
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

    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "USER_UPDATED"
    ) {
      // Defer auth calls out of this callback to avoid lock re-entry.
      queueResolve();
    }
  });

  // On tab return, re-check auth state.
  //
  // With autoRefreshToken: false there is NO competing visibilitychange
  // listener from Supabase internals. resolveSharedAuth() is now cheap:
  //   • token still valid  → just a getSession() localStorage read (< 1 ms)
  //   • token expired      → one refreshSession() network call
  //
  // We schedule a second call 16 seconds after tab return as a safety net:
  // if the first attempt hits a stale TCP connection (global.fetch aborts it
  // after 15 s), the second attempt uses a fresh connection and recovers.
  let visibilityRetryTimerId: number | null = null;
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    void resolveSharedAuth();
    // Safety-net retry in case first attempt hits a stale TCP connection.
    if (visibilityRetryTimerId) window.clearTimeout(visibilityRetryTimerId);
    visibilityRetryTimerId = window.setTimeout(
      () => void resolveSharedAuth(),
      16_000
    );
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Proactive token refresh while the tab is visible.
  // Without autoRefreshToken, we poll every 55 minutes and refresh if the
  // token is within TOKEN_EXPIRY_BUFFER_SECS of expiry.
  const proactiveRefreshId = window.setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const {
        data: { session },
      } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_GET_SESSION_TIMEOUT_MS,
        "auth.getSession(proactive)"
      );
      if (!session) return;
      const now = Math.floor(Date.now() / 1000);
      if ((session.expires_at ?? 0) - now < TOKEN_EXPIRY_BUFFER_SECS) {
        void resolveSharedAuth();
      }
    } catch {
      // Transient contention/timeout. Skip this tick.
    }
  }, PROACTIVE_REFRESH_INTERVAL_MS);

  const cleanup = () => {
    sub.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (visibilityRetryTimerId) {
      window.clearTimeout(visibilityRetryTimerId);
      visibilityRetryTimerId = null;
    }
    window.clearInterval(proactiveRefreshId);
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
