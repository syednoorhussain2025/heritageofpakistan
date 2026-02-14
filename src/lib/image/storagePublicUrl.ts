// src/lib/image/storagePublicUrl.ts

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

export function storagePublicUrl(bucket: string, path: string) {
  if (!path) return "";

  // Already absolute URL (legacy rows or external source)
  if (/^https?:\/\//i.test(path)) return path;

  if (!SUPABASE_URL) {
    // Keep behavior predictable in misconfigured envs.
    return path;
  }

  const cleanBucket = String(bucket || "").replace(/^\/+|\/+$/g, "");
  const cleanPath = String(path).replace(/^\/+/, "");

  return `${SUPABASE_URL}/storage/v1/object/public/${cleanBucket}/${cleanPath}`;
}
