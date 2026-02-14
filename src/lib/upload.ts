// src/lib/upload.ts
import { supabase } from "@/lib/supabase/browser";

export async function uploadToBucket(
  bucket: "site-images" | "photo-story",
  file: File,
  pathPrefix: string
) {
  // Require signed-in user (admin)
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Please sign in as admin to upload.");

  const filename = `${pathPrefix}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, file, { upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}
