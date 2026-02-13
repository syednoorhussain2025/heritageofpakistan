// src/lib/supabase/browser.ts
"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __HOP_SUPABASE__?: SupabaseClient;
    __HOP_SUPABASE_INIT__?: boolean;
  }
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

  // Already created → always reuse
  if (window.__HOP_SUPABASE__) return window.__HOP_SUPABASE__;

  // Prevent duplicate creation during parallel module execution
  if (window.__HOP_SUPABASE_INIT__) {
    // wait until the first initializer finishes
    const start = Date.now();
    while (!window.__HOP_SUPABASE__ && Date.now() - start < 50) {}
    if (window.__HOP_SUPABASE__) return window.__HOP_SUPABASE__;
  }

  window.__HOP_SUPABASE_INIT__ = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const client = createSupabaseClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  window.__HOP_SUPABASE__ = client;
  window.__HOP_SUPABASE_INIT__ = false;

  return client;
};
