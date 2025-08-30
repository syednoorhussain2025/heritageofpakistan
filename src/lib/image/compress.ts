import imageCompression from "browser-image-compression";
import { TARGET_MAX_BYTES, TARGET_MAX_DIM } from "./constants";

/**
 * Compress a File to roughly <= TARGET_MAX_BYTES as WebP.
 * Note: exact byte target isn't guaranteed; we enforce again after.
 */
export async function compressToWebP(
  file: File,
  opts?: Partial<imageCompression.Options>
): Promise<File> {
  const options: imageCompression.Options = {
    maxSizeMB: TARGET_MAX_BYTES / (1024 * 1024), // ~0.3MB
    maxWidthOrHeight: TARGET_MAX_DIM,
    initialQuality: 0.82,
    useWebWorker: true,
    fileType: "image/webp",
    ...(opts || {}),
  };

  const compressed = await imageCompression(file, options);

  // Safety: if still > target, try one more pass with lower quality
  if (compressed.size > TARGET_MAX_BYTES) {
    const secondPass = await imageCompression(file, {
      ...options,
      initialQuality: 0.74,
      maxWidthOrHeight: Math.min(TARGET_MAX_DIM, 1400),
    });
    return secondPass;
  }
  return compressed;
}
