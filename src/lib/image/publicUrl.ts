import { createClient } from "@/lib/supabase/browser";

/** Get a direct public URL (no Supabase image transformation). */
export function getPublicUrl(
  bucket: "user-photos" | "avatars",
  path: string
) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
