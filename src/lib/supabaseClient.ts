// src/lib/supabaseClient.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

export const supabase: SupabaseClient = createBrowserClient();

// Compatibility wrapper for our other files
export const createClient = () => supabase;
