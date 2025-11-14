import { createClient } from "@/lib/supabaseClient";

export type ReviewPhotoRow = {
  id: string;
  review_id: string;
  user_id: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  ordinal: number; // 1..3
  created_at: string;
};

export type InsertableReviewPhoto = {
  review_id: string;
  user_id: string;
  storage_path: string;
  mime: string; // e.g., 'image/webp'
  size_bytes: number; // compressed size (≈ 300 KB)
  caption?: string | null;
  ordinal: number; // 1..3
  width?: number | null; // optional: set if you know it
  height?: number | null; // optional: set if you know it
};

/** List all photos for a given user, ordered by most recent first. */
export async function listAllUserPhotos(
  userId: string
): Promise<ReviewPhotoRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_photos")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ReviewPhotoRow[]) ?? [];
}

/** Insert up to 3 rows in review_photos (one call).
 *  Will throw if ordinal duplicates (DB unique constraint) or >3.
 */
export async function insertReviewPhotos(rows: InsertableReviewPhoto[]) {
  if (!rows.length) return []; // Defensive: ordinals must be 1..3

  for (const r of rows) {
    if (r.ordinal < 1 || r.ordinal > 3) {
      throw new Error(`Invalid ordinal ${r.ordinal}. Must be 1..3.`);
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_photos")
    .insert(
      rows.map((r) => ({
        review_id: r.review_id,
        user_id: r.user_id,
        storage_path: r.storage_path,
        mime: r.mime,
        size_bytes: r.size_bytes,
        width: r.width ?? null,
        height: r.height ?? null,
        caption: r.caption ?? null,
        ordinal: r.ordinal,
      }))
    )
    .select("*")
    .returns<ReviewPhotoRow[]>();

  if (error) throw error;
  return data!;
}

/** Get photos for a review ordered by ordinal (1..3). */
export async function listReviewPhotos(reviewId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_photos")
    .select("*")
    .eq("review_id", reviewId)
    .order("ordinal", { ascending: true })
    .returns<ReviewPhotoRow[]>();

  if (error) throw error;
  return data ?? [];
}

/** Update caption for a single photo. */
export async function updatePhotoCaption(
  photoId: string,
  caption: string | null
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("review_photos")
    .update({ caption: caption || null })
    .eq("id", photoId);

  if (error) {
    console.error("Error updating caption:", error);
    throw error;
  }
}

/** Update caption and/or ordinal for a single photo. */
export async function updateReviewPhoto(
  photoId: string,
  patch: {
    caption?: string | null;
    ordinal?: number; // 1..3
  }
) {
  if (patch.ordinal !== undefined && (patch.ordinal < 1 || patch.ordinal > 3)) {
    throw new Error(`Invalid ordinal ${patch.ordinal}. Must be 1..3.`);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_photos")
    .update({
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.ordinal !== undefined ? { ordinal: patch.ordinal } : {}),
    })
    .eq("id", photoId)
    .select("*")
    .single()
    .returns<ReviewPhotoRow>();

  if (error) throw error;
  return data!;
}

/** Delete DB row; optionally delete storage object too. */
export async function deleteReviewPhoto(photo: {
  id: string;
  user_id: string;
  storage_path: string;
  alsoDeleteStorage?: boolean;
}) {
  const supabase = createClient(); // 1) delete DB row

  const { error: delErr } = await supabase
    .from("review_photos")
    .delete()
    .eq("id", photo.id);

  if (delErr) throw delErr; // 2) optional: delete from storage

  if (photo.alsoDeleteStorage) {
    const { error: stErr } = await supabase.storage
      .from("user-photos")
      .remove([photo.storage_path]);
    if (stErr) throw stErr;
  }

  return true;
}
