// scripts/backfill-image-dimensions.ts
import dotenv from "dotenv";
dotenv.config();

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { encode } from "blurhash";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("🔑 SUPABASE_URL:", SUPABASE_URL);
console.log(
  "🔑 Key prefix:",
  SUPABASE_SERVICE_ROLE_KEY
    ? SUPABASE_SERVICE_ROLE_KEY.slice(0, 15)
    : "MISSING"
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Make sure they are set in your .env / .env.local file."
  );
  process.exit(1);
}

// Your bucket name
const STORAGE_BUCKET = "site-images";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ImageRow = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  blur_hash: string | null;
  blur_data_url: string | null;
};

async function backfillBatch(limit = 50): Promise<number> {
  // 1. Fetch a batch of images missing ANY of the fields
  const { data: images, error } = await supabase
    .from("site_images")
    .select("id, storage_path, width, height, blur_hash, blur_data_url")
    .or(
      "width.is.null,height.is.null,blur_hash.is.null,blur_data_url.is.null"
    )
    .limit(limit);

  if (error) {
    console.error("Error fetching images:", error);
    return 0;
  }

  if (!images || images.length === 0) {
    return 0;
  }

  for (const img of images as ImageRow[]) {
    try {
      console.log(`Processing image ${img.id} (${img.storage_path})`);

      // 2. Download the image from Storage
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(img.storage_path);

      if (downloadErr || !fileData) {
        console.error("  ❌ download error:", downloadErr);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      // 3. Use sharp to read metadata (width/height)
      const metadata = await sharp(buffer).metadata();
      const width = metadata.width ?? img.width ?? null;
      const height = metadata.height ?? img.height ?? null;

      if (!width || !height) {
        console.warn("  ⚠️ could not read width/height");
      }

      // 4. Generate BlurHash + tiny blurDataURL if missing
      let blurHash = img.blur_hash;
      let blurDataURL = img.blur_data_url;

      try {
        if (!blurHash || !blurDataURL) {
          // Resize to small thumbnail and get *actual* resized dimensions
          const thumb = await sharp(buffer)
            .resize(32, 32, { fit: "inside" })
            .raw()
            .ensureAlpha()
            .toBuffer({ resolveWithObject: true });

          const rawPixels = thumb.data;          // Buffer
          const bhWidth = thumb.info.width;      // actual width after resize
          const bhHeight = thumb.info.height;    // actual height after resize

          if (bhWidth && bhHeight && rawPixels.length === bhWidth * bhHeight * 4) {
            blurHash = encode(
              new Uint8ClampedArray(rawPixels),
              bhWidth,
              bhHeight,
              4, // componentsX
              4  // componentsY
            );
          } else {
            console.warn(
              "  ⚠️ mismatch between raw pixel length and width/height for blurhash; skipping blurhash for this image"
            );
          }

          // Tiny JPEG for Next/Image blurDataURL
          const tinyJpeg = await sharp(buffer)
            .resize(20, 20, { fit: "inside" })
            .jpeg({ quality: 40 })
            .toBuffer();

          blurDataURL = `data:image/jpeg;base64,${tinyJpeg.toString("base64")}`;
        }
      } catch (e) {
        console.warn("  ⚠️ could not generate blurhash/blurDataURL:", e);
      }

      // 5. Build update payload (only fields we actually have)
      const updatePayload: Partial<ImageRow> = {};

      if (width && height) {
        updatePayload.width = width;
        updatePayload.height = height;
      }
      if (blurHash) {
        updatePayload.blur_hash = blurHash;
      }
      if (blurDataURL) {
        updatePayload.blur_data_url = blurDataURL;
      }

      if (Object.keys(updatePayload).length === 0) {
        console.log("  ℹ️ nothing to update for this image");
        continue;
      }

      // 6. Update site_images row
      const { error: updateErr } = await supabase
        .from("site_images")
        .update(updatePayload)
        .eq("id", img.id);

      if (updateErr) {
        console.error("  ❌ update error:", updateErr);
      } else {
        console.log(
          `  ✅ updated: width=${updatePayload.width ?? img.width}, height=${
            updatePayload.height ?? img.height
          }, blurHash=${blurHash ? "yes" : "no"}, blurDataURL=${
            blurDataURL ? "yes" : "no"
          }`
        );
      }
    } catch (e) {
      console.error("  ❌ unexpected error:", e);
    }
  }

  return images.length;
}

async function main() {
  let processed = 0;

  while (true) {
    const count = await backfillBatch(50);
    if (count === 0) break;
    processed += count;
    console.log(`Processed so far: ${processed}`);
  }

  console.log("✅ Backfill complete. Total images updated:", processed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
