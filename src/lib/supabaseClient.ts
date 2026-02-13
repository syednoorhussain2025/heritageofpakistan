// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Server-safe singleton for server utilities (SSG, SSR, server helpers)
let serverClient: SupabaseClient | null = null;

export const createClient = (): SupabaseClient => {
  if (serverClient) return serverClient;
  serverClient = createServerClient() as unknown as SupabaseClient;
  return serverClient;
};

// Backwards compatible export if any file imports { supabase }
export const supabase: SupabaseClient = createClient();
