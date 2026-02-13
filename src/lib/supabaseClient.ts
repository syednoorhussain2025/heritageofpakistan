// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/browser";

export const supabase: SupabaseClient = createBrowserSupabaseClient();

// Compatibility wrapper for our other files
export const createClient = () => supabase;
