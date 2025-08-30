// src/lib/image/avatarSrc.ts
import { storagePublicUrl } from "@/lib/image/storagePublicUrl";

export function avatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  // If it's already an absolute URL, use it.
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  // Otherwise treat it as a path inside the "avatars" bucket
  return storagePublicUrl("avatars", avatar_url);
}
