// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

export const createClient = (): SupabaseClient => {
  if (cached) return cached;

  if (typeof window !== "undefined") {
    // Browser
    const mod = require("@/lib/supabase/browser") as {
      createClient: () => SupabaseClient;
    };
    cached = mod.createClient();
    return cached;
  }

  // Server (public, no cookies)
  const mod = require("@supabase/supabase-js") as {
    createClient: (url: string, anon: string) => SupabaseClient;
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  cached = mod.createClient(url, anon);
  return cached;
};

export const supabase: SupabaseClient = createClient();
