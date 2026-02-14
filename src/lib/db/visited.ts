// src/lib/db/visited.ts
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

/**
 * Return count of active reviews for a user.
 * This is now the source of truth for the badge system.
 */
export async function countUserVisits(userId: string) {
  const { count, error } = await supabase
    .from("reviews") // <-- Counts from the reviews table
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "deleted"); // <-- Only counts active reviews
  if (error) throw error;
  return count ?? 0;
}
