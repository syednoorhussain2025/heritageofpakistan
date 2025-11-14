import { createClient } from "@/lib/supabaseClient";

export async function toggleHelpful(reviewId: string, voterId: string) {
  const supabase = createClient();

  // check if already exists
  const { data: existing, error: selErr } = await supabase
    .from("helpful_votes")
    .select("id")
    .eq("review_id", reviewId)
    .eq("voter_id", voterId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    // remove vote
    const { error } = await supabase
      .from("helpful_votes")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
    return { voted: false };
  } else {
    // add vote
    const { error } = await supabase
      .from("helpful_votes")
      .insert({ review_id: reviewId, voter_id: voterId });
    if (error) throw error;
    return { voted: true };
  }
}

/** Check if current user already voted helpful on a review */
export async function hasUserVoted(reviewId: string, voterId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("helpful_votes")
    .select("id")
    .eq("review_id", reviewId)
    .eq("voter_id", voterId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
