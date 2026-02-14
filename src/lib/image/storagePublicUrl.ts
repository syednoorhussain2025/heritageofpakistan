// src/lib/image/storagePublicUrl.ts
import { supabase } from "@/lib/supabase/browser";

export function storagePublicUrl(bucket: string, path: string) {
  // path should be exactly what you uploaded: e.g. "userId/abc123.webp"
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
