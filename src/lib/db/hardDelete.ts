import { createClient } from "@/lib/supabaseClient";

/**
 * Permanently remove a review (owned by userId) and everything attached to it.
 * Steps:
 * 1) List every object under user-photos/${userId}/${reviewId}/ and remove them
 * 2) Delete review_photos rows (defensive — also avoids orphan rows)
 * 3) Delete helpful_votes rows for this review
 * 4) Delete the review row itself (owner-guarded)
 */
export async function hardDeleteReview(reviewId: string, userId: string) {
  const supabase = createClient();
  const bucket = "user-photos";
  const folder = `${userId}/${reviewId}`;

  // 1) Storage: remove any files under the folder
  // (our upload paths were `${userId}/${reviewId}/${timestamp}_i.webp`)
  // List supports pagination; we loop until everything is fetched.
  let offset = 0;
  const toRemove: string[] = [];

  // list in chunks of 100 (max for list)
  for (;;) {
    const { data: listed, error: listErr } = await supabase.storage
      .from(bucket)
      .list(folder, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (listErr) throw listErr;

    if (!listed || listed.length === 0) break;

    for (const f of listed) {
      if (f.name) toRemove.push(`${folder}/${f.name}`);
    }

    // if < 100, we're done
    if (listed.length < 100) break;
    offset += listed.length;
  }

  if (toRemove.length) {
    const { error: rmErr } = await supabase.storage
      .from(bucket)
      .remove(toRemove);
    if (rmErr) throw rmErr;
  }

  // 2) DB: remove photo link rows (defensive)
  const { error: delPhotosErr } = await supabase
    .from("review_photos")
    .delete()
    .eq("review_id", reviewId);
  if (delPhotosErr) throw delPhotosErr;

  // 3) DB: remove helpful votes for this review
  const { error: delVotesErr } = await supabase
    .from("helpful_votes")
    .delete()
    .eq("review_id", reviewId);
  if (delVotesErr) throw delVotesErr;

  // 4) DB: finally delete the review (only if owned by user)
  const { error: delReviewErr } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", userId);

  if (delReviewErr) throw delReviewErr;
}
