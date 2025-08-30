// Image rules used across the app
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_INPUT_BYTES = 3 * 1024 * 1024; // 3 MB pre-upload limit
export const TARGET_MAX_BYTES = 300 * 1024; // ~300 KB after compression
export const TARGET_MAX_DIM = 1600; // cap long edge for reviews/portfolio
export const AVATAR_MAX_DIM = 1024; // avatar square cap
