/** Path builders aligned with your Storage policies. */

export function reviewPhotoPath(
  userId: string,
  reviewId: string,
  index: number,
  ext: string
) {
  const safeExt = ext.startsWith(".") ? ext.slice(1) : ext;
  const ts = Date.now();
  return `${userId}/reviews/${reviewId}/${ts}-${index}.${safeExt}`;
}

export function avatarPath(userId: string) {
  return `${userId}/avatar.webp`;
}
