// src/lib/supabase/browser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __HOP_SUPABASE__?: SupabaseClient;
    __HOP_SUPABASE_AUTH_WIRED__?: boolean;
    __HOP_SUPABASE_AUTH_RECOVERING__?: boolean;
    __HOP_SUPABASE_AUTH_LAST_RECOVERY__?: number;
  }
}

const AUTH_RECOVERY_THROTTLE_MS = 12000;
const AUTH_RECOVERY_TIMEOUT_MS = 6000;
const REFRESH_WINDOW_SECONDS = 120;

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

function wireBrowserAuthRecovery(client: SupabaseClient) {
  if (typeof window === "undefined") return;
  if (window.__HOP_SUPABASE_AUTH_WIRED__) return;

  window.__HOP_SUPABASE_AUTH_WIRED__ = true;
  window.__HOP_SUPABASE_AUTH_LAST_RECOVERY__ = 0;

  const recover = async (force = false) => {
    if (window.__HOP_SUPABASE_AUTH_RECOVERING__) return;

    const now = Date.now();
    const last = window.__HOP_SUPABASE_AUTH_LAST_RECOVERY__ ?? 0;
    if (!force && now - last < AUTH_RECOVERY_THROTTLE_MS) return;

    window.__HOP_SUPABASE_AUTH_RECOVERING__ = true;
    window.__HOP_SUPABASE_AUTH_LAST_RECOVERY__ = now;

    try {
      // Ensure token timer is active after tab sleep/wake cycles.
      client.auth.startAutoRefresh();

      const { data, error } = await withTimeout(
        client.auth.getSession(),
        AUTH_RECOVERY_TIMEOUT_MS
      );
      if (error) throw error;

      const session = data.session;
      if (!session?.user) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = session.expires_at ?? 0;
      const expiresSoon =
        expiresAt > 0 && expiresAt - nowSec < REFRESH_WINDOW_SECONDS;

      if (force || expiresSoon) {
        await withTimeout(
          client.auth.refreshSession(),
          AUTH_RECOVERY_TIMEOUT_MS
        );
      }
    } catch (err) {
      console.warn("[supabase/browser] auth recovery failed", err);
    } finally {
      window.__HOP_SUPABASE_AUTH_RECOVERING__ = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void recover(true);
    }
  };

  const onFocus = () => {
    void recover(true);
  };

  const onOnline = () => {
    void recover(true);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event) => {
    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED"
    ) {
      void recover(false);
    }
  });

  // Fire one initial recovery after hydration.
  void recover(true);

  // Keep a best-effort cleanup in page lifecycle.
  window.addEventListener("beforeunload", () => {
    subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
  });
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
    wireBrowserAuthRecovery(window.__HOP_SUPABASE__);
    return window.__HOP_SUPABASE__;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  // Use the SSR browser client so auth state is also mirrored into cookies.
  // Middleware/server components rely on these cookies to recognize sessions.
  const client = createBrowserClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  window.__HOP_SUPABASE__ = client;
  wireBrowserAuthRecovery(client);
  return client;
};

export const supabase = createClient();
