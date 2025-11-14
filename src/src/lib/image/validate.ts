import { ALLOWED_MIME, MAX_INPUT_BYTES } from "./constants";

export function assertFileAcceptable(file: File, label = "image") {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(
      `${label}: unsupported format ${file.type}. Allowed: JPG, PNG, WebP, HEIC/HEIF`
    );
  }
  if (file.size > MAX_INPUT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`${label}: file is ${mb} MB. Max allowed is 3 MB.`);
  }
}
