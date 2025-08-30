import { createClient } from "@/lib/supabaseClient";
import { assertFileAcceptable } from "./image/validate";
import { compressToWebP } from "./image/compress";
import { reviewPhotoPath } from "./image/paths";
import { getPublicUrl } from "./image/publicUrl";

export type UploadedReviewPhoto = {
  bucket: "user-photos";
  path: string;
  mime: string;
  size: number;
  publicUrl: string;
};

export async function uploadReviewPhotos(params: {
  userId: string;
  reviewId: string;
  files: File[]; // we will take first 3
}) {
  const { userId, reviewId } = params;
  const files = params.files.slice(0, 3);

  if (files.length === 0) return [];

  const supabase = createClient();
  const bucket = "user-photos" as const;

  const results: UploadedReviewPhoto[] = [];

  for (let i = 0; i < files.length; i++) {
    const original = files[i];
    assertFileAcceptable(original, `photo #${i + 1}`);

    // Compress to <= ~300KB WebP
    const compressed = await compressToWebP(original);
    const ext = "webp";
    const path = reviewPhotoPath(userId, reviewId, i + 1, ext);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, compressed, {
        upsert: false,
        contentType: "image/webp",
        cacheControl: "31536000",
      });
    if (error) throw error;

    // Optional: width transform for typical display (cards)
    const publicUrl = getPublicUrl(bucket, path, {
      width: 1200,
      quality: 70,
      format: "webp",
    });

    results.push({
      bucket,
      path,
      mime: "image/webp",
      size: compressed.size,
      publicUrl,
    });
  }

  return results;
}
