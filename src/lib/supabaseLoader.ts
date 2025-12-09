// src/lib/supabaseLoader.ts
import { ImageLoaderProps } from 'next/image';

export default function supabaseLoader({ src, width, quality }: ImageLoaderProps) {
  // 1. Safety check: If it's not a Supabase URL, return it as-is
  // (Useful if you occasionally use local images or other sources)
  if (!src.includes("supabase.co")) {
    return src;
  }

  // 2. Switch from the standard "object" API to the "render" API
  // Original: .../storage/v1/object/public/...
  // Resized:  .../storage/v1/render/image/public/...
  const transformedPath = src.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/"
  );

  // 3. Return the URL with width and quality parameters
  // Supabase will automatically preserve the aspect ratio
  return `${transformedPath}?width=${width}&quality=${quality || 75}`;
}