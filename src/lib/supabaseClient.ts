// src/lib/supabaseClient.ts
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

// Create one shared browser client instance for legacy imports
export const supabase = createBrowserClient();

// Compatibility wrapper for our other files
export const createClient = () => supabase;
