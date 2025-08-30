import { createClient } from "@/lib/supabaseClient";

/** Get a public URL, optionally with Supabase transform (width/quality/format). */
export function getPublicUrl(
  bucket: "user-photos" | "avatars",
  path: string,
  transform?: {
    width?: number;
    quality?: number;
    format?: "webp" | "png" | "jpg";
  }
) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
    transform: transform
      ? {
          width: transform.width,
          quality: transform.quality,
          format: transform.format,
        }
      : undefined,
  });
  return data.publicUrl;
}
