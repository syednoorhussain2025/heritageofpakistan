import imageCompression from "browser-image-compression";
import { TARGET_MAX_BYTES, AVATAR_MAX_DIM } from "./constants";

/** Compress/crop avatars to square WebP <=300KB, max 1024x1024. */
export async function compressAvatarToWebP(file: File): Promise<File> {
  // image-compression can't crop; we rely on square sources or client UI cropper later.
  // Here we just cap size & re-encode to WebP.
  const options: imageCompression.Options = {
    maxSizeMB: TARGET_MAX_BYTES / (1024 * 1024),
    maxWidthOrHeight: AVATAR_MAX_DIM,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/webp",
  };
  const compressed = await imageCompression(file, options);

  if (compressed.size > TARGET_MAX_BYTES) {
    const second = await imageCompression(file, {
      ...options,
      initialQuality: 0.72,
      maxWidthOrHeight: Math.min(AVATAR_MAX_DIM, 900),
    });
    return second;
  }
  return compressed;
}
