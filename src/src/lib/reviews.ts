import { createClient } from "@/lib/supabaseClient";

/** Create a review row. Returns the new review id. */
export async function createReview(input: {
  site_id: string;
  user_id: string;
  rating: number;
  review_text?: string;
  visited_year?: number | null;
  visited_month?: number | null;
}) {
  const supabase = createClient();

  const payload = {
    site_id: input.site_id,
    user_id: input.user_id,
    rating: input.rating,
    review_text: input.review_text ?? null,
    visited_year: input.visited_year ?? null,
    visited_month: input.visited_month ?? null,
    status: "published" as const,
  };

  const { data, error } = await supabase
    .from("reviews")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}
