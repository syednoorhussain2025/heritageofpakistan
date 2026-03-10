// src/lib/supabase/browser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __HOP_SUPABASE__?: SupabaseClient;
    __HOP_SUPABASE_PUBLIC__?: SupabaseClient;
  }
}

/**
 * Drops the cached public client so the next getPublicClient() creates a new one.
 * Called automatically when the tab becomes visible so fetches use a fresh
 * client instance and don't reuse a connection that stalled while the tab
 * was hidden.
 */
export function invalidatePublicClient(): void {
  if (typeof window !== "undefined") {
    window.__HOP_SUPABASE_PUBLIC__ = undefined;
  }
}

// Register once per page load.  Invalidate the public client every time the
// tab becomes visible so any stale connection is discarded before the next
// React-Query refetch fires.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      invalidatePublicClient();
    }
  });
}

/**
 * Returns a Supabase client that never sends auth (no session).
 * Use for public read-only data (sites, regions, categories) so requests
 * stay fast and are not affected by authenticated session/RLS.
 */
export function getPublicClient(): SupabaseClient {
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing Supabase env");
    return createSupabaseClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  if (window.__HOP_SUPABASE_PUBLIC__) return window.__HOP_SUPABASE_PUBLIC__;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env");
  const client = createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  window.__HOP_SUPABASE_PUBLIC__ = client;
  return client;
}

export const createClient = (): SupabaseClient => {
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }

    // Server-side fallback for prerender/SSR paths that execute client modules.
    // Session persistence is browser-only, so keep auth stateless here.
    return createSupabaseClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  // Already created -> always reuse.
  if (window.__HOP_SUPABASE__) {
    return window.__HOP_SUPABASE__;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  // Custom fetch with AbortController so stale TCP connections are truly
  // terminated (not just the outer promise rejected) when requests hang after
  // the browser resumes a backgrounded tab and the server has closed the conn.
  const FETCH_TIMEOUT_MS = 15_000;
  const fetchWithTimeout = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () =>
        controller.abort(
          new Error(`supabase fetch timeout after ${FETCH_TIMEOUT_MS}ms`)
        ),
      FETCH_TIMEOUT_MS
    );
    // Forward any caller-supplied signal so it can also cancel the request.
    if (init?.signal) {
      init.signal.addEventListener("abort", () => controller.abort());
    }
    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
      window.clearTimeout(timer)
    );
  };

  // Use the SSR browser client so auth state is also mirrored into cookies.
  // Middleware/server components rely on these cookies to recognize sessions.
  //
  // autoRefreshToken: false — Supabase's built-in auto-refresh registers its
  // own visibilitychange listener and acquires a navigator.locks lock on tab
  // return. Our own getUser() calls also need that lock (acquireTimeout = -1,
  // meaning "wait forever"). The two compete, causing the app to freeze
  // permanently when the tab is restored after the access token has expired.
  // We manage token refresh explicitly in useAuthUserId.ts instead.
  const client = createBrowserClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });

  window.__HOP_SUPABASE__ = client;
  return client;
};

export const supabase = createClient();
