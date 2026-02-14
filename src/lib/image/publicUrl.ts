import { createClient } from "@/lib/supabase/browser";

/** Get a public URL, optionally with Supabase transform (width/quality). */
export function getPublicUrl(
  bucket: "user-photos" | "avatars",
  path: string,
  transform?: {
    width?: number;
    quality?: number;
  }
) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
    transform: transform
      ? {
          width: transform.width,
          quality: transform.quality,
        }
      : undefined,
  });
  return data.publicUrl;
}
