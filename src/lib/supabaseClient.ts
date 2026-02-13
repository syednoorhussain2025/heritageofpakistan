// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public-server";

let serverClient: SupabaseClient | null = null;

export const createClient = (): SupabaseClient => {
  if (serverClient) return serverClient;
  serverClient = createPublicClient();
  return serverClient;
};

export const supabase: SupabaseClient = createClient();
