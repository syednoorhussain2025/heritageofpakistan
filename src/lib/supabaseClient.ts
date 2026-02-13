// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";

// IMPORTANT:
// - In the browser, reuse the singleton from "@/lib/supabase/browser"
// - On the server, use a public server client that does not rely on next/headers

let cached: SupabaseClient | null = null;

export const createClient = (): SupabaseClient => {
  if (cached) return cached;

  if (typeof window !== "undefined") {
    // Browser
    const { createClient } = require("@/lib/supabase/browser");
    cached = createClient();
    return cached;
  }

  // Server (public, no cookies)
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  cached = createSupabaseClient(url, anon);
  return cached;
};

export const supabase: SupabaseClient = createClient();
