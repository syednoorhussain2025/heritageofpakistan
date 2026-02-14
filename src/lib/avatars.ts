import { createClient } from "@/lib/supabase/browser";
import { assertFileAcceptable } from "./image/validate";
import { compressAvatarToWebP } from "./image/compressAvatar";
import { avatarPath } from "./image/paths";
import { getPublicUrl } from "./image/publicUrl";

export async function uploadAvatar(userId: string, file: File) {
  assertFileAcceptable(file, "avatar");

  const supabase = createClient();
  const bucket = "avatars" as const;

  const compressed = await compressAvatarToWebP(file);
  const path = avatarPath(userId);

  // Upsert = true (replace previous avatar)
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, compressed, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000",
    });
  if (error) throw error;

  const publicUrl = getPublicUrl(bucket, path, {
    width: 256,
    quality: 70,
  });

  return { bucket, path, publicUrl, size: compressed.size, mime: "image/webp" };
}
