// src/lib/supabase/browser.ts
// Client-side Supabase singleton with durable session refresh.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export const createClient = () => {
  if (browserClient) return browserClient;

  browserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }
  );

  // Ensure auto refresh is running even if the app sits open for a long time.
  try {
    browserClient.auth.startAutoRefresh();
  } catch {
    // startAutoRefresh exists in supabase-js v2, ignore if unavailable.
  }

  return browserClient;
};
