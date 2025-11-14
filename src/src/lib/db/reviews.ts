// src/lib/db/reviews.ts
import { createClient } from "@/lib/supabaseClient";

export type ReviewRow = {
  id: string;
  user_id: string;
  site_id: string;
  rating: number;
  review_text: string | null;
  visited_year: number | null;
  visited_month: number | null;
  status: string | null;
  created_at: string;
};

const supabase = createClient();

export async function listUserReviews(userId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id,user_id,site_id,rating,review_text,visited_year,visited_month,status,created_at"
    )
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ReviewRow[]) ?? [];
}

export async function softDeleteReview(id: string, userId: string) {
  // This function now only soft-deletes the review.
  const { error } = await supabase
    .from("reviews")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
