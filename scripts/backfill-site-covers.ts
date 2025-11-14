// scripts/backfill-site-covers.ts
import dotenv from "dotenv";
dotenv.config();

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { encode as encodeBlurhash } from "blurhash";

/* -------------------------------------------------
   ENV – same pattern as backfill-image-dimensions.ts
-------------------------------------------------- */

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
    "❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. " +
      "Make sure they are set in your .env / .env.local file."
  );
  process.exit(1);
}

const STORAGE_BUCKET = "site-images";
const COVERS_PREFIX = "covers";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* -------------------------------------------------
   TYPES
-------------------------------------------------- */

type ExistingCoverRow = {
  id: string;
  storage_path: string;
  is_active: boolean;
};

/* -------------------------------------------------
   HELPERS
-------------------------------------------------- */

async function computeMeta(buffer: Buffer) {
  const img = sharp(buffer);

  const metadata = await img.metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  let blurHash: string | null = null;
  let blurDataURL: string | null = null;

  try {
    // Thumbnail for blurhash
    const thumb = await img
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rawPixels = thumb.data;
    const bhWidth = thumb.info.width;
    const bhHeight = thumb.info.height;

    if (
      bhWidth &&
      bhHeight &&
      rawPixels.length === bhWidth * bhHeight * 4
    ) {
      blurHash = encodeBlurhash(
        new Uint8ClampedArray(rawPixels),
        bhWidth,
        bhHeight,
        4,
        4
      );
    } else {
      console.warn(
        "⚠️ mismatch between raw pixel length and width/height for blurhash; skipping blurhash"
      );
    }

    // Tiny JPEG for blurDataURL
    const tinyJpeg = await img
      .resize(20, 20, { fit: "inside" })
      .jpeg({ quality: 40 })
      .toBuffer();

    blurDataURL = `data:image/jpeg;base64,${tinyJpeg.toString("base64")}`;
  } catch (e) {
    console.warn("⚠️ could not generate blurhash / blurDataURL:", e);
  }

  return { width, height, blurHash, blurDataURL };
}

async function upsertSiteCover(options: {
  siteId: string;
  storagePath: string;
  width: number | null;
  height: number | null;
  blurHash: string | null;
  blurDataURL: string | null;
  isActive: boolean;
  sortOrder: number;
}) {
  const {
    siteId,
    storagePath,
    width,
    height,
    blurHash,
    blurDataURL,
    isActive,
    sortOrder,
  } = options;

  // Check if row already exists for site + path
  const { data: existing, error: exErr } = await supabase
    .from("site_covers")
    .select("id, is_active")
    .eq("site_id", siteId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (exErr) {
    console.error(
      `  ❌ error checking existing site_covers for ${storagePath}:`,
      exErr
    );
    return;
  }

  const basePayload = {
    width,
    height,
    blur_hash: blurHash,
    blur_data_url: blurDataURL,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const payload = {
      ...basePayload,
      // if previously active, keep it active; else allow new isActive flag
      is_active: existing.is_active || isActive,
    };

    const { error: updateErr } = await supabase
      .from("site_covers")
      .update(payload)
      .eq("id", existing.id);

    if (updateErr) {
      console.error(`  ❌ update error for ${storagePath}:`, updateErr);
    } else {
      console.log(
        `  ✅ updated site_covers for ${storagePath} (active=${payload.is_active})`
      );
    }
  } else {
    const insertPayload = {
      site_id: siteId,
      storage_path: storagePath,
      width,
      height,
      blur_hash: blurHash,
      blur_data_url: blurDataURL,
      is_active: isActive,
      sort_order: sortOrder,
    };

    const { error: insertErr } = await supabase
      .from("site_covers")
      .insert(insertPayload);

    if (insertErr) {
      // Foreign-key violation if site_id doesn't exist; log and continue.
      console.error(`  ❌ insert error for ${storagePath}:`, insertErr);
    } else {
      console.log(
        `  ✅ inserted site_covers for ${storagePath} (active=${isActive})`
      );
    }
  }
}

/* -------------------------------------------------
   PER-SITE FOLDER PROCESSING
-------------------------------------------------- */

async function processSiteFolder(siteId: string) {
  const prefix = `${COVERS_PREFIX}/${siteId}`;
  console.log(`\n📍 Site ${siteId} → scanning ${prefix}`);

  // Existing covers for this site (to keep sort order / active flag sane)
  const { data: existingCovers, error: coversErr } = await supabase
    .from("site_covers")
    .select("id, storage_path, is_active")
    .eq("site_id", siteId);

  if (coversErr) {
    console.error("  ❌ error fetching existing site_covers:", coversErr);
    return;
  }

  const existingByPath: Record<string, ExistingCoverRow> = {};
  let hasActiveAlready = false;

  (existingCovers || []).forEach((row: any) => {
    existingByPath[row.storage_path] = row;
    if (row.is_active) hasActiveAlready = true;
  });

  const baseSortOrder = (existingCovers || []).length;

  // List files in this covers/<site_id> folder
  const { data: objects, error: listErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000 });

  if (listErr) {
    console.error("  ❌ storage.list error:", listErr);
    return;
  }

  const files = (objects || []).filter((o) => !o.name.endsWith("/"));

  if (!files.length) {
    console.log("  ℹ️ no files in this covers folder.");
    return;
  }

  console.log(`  🧾 found ${files.length} file(s)`);

  let sortOffset = 0;

  for (const file of files) {
    const storagePath = `${prefix}/${file.name}`;
    console.log(`  ➤ processing ${storagePath}`);

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (downloadErr || !fileData) {
      console.error("    ❌ download error:", downloadErr);
      continue;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { width, height, blurHash, blurDataURL } = await computeMeta(buffer);

    const isExisting = !!existingByPath[storagePath];

    // Make first *new* file active if there is currently no active cover
    const shouldBeActive =
      !hasActiveAlready && !isExisting && sortOffset === 0;

    if (shouldBeActive) hasActiveAlready = true;

    const sortOrder = baseSortOrder + sortOffset;
    sortOffset++;

    await upsertSiteCover({
      siteId,
      storagePath,
      width,
      height,
      blurHash,
      blurDataURL,
      isActive: shouldBeActive,
      sortOrder,
    });
  }
}

/* -------------------------------------------------
   MAIN – iterate all site folders under covers/
-------------------------------------------------- */

async function main() {
  console.log("🚀 Starting site_covers backfill…");

  // List "covers" root; entries here should be your site-id folders
  const { data: siteFolders, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(COVERS_PREFIX, { limit: 1000 });

  if (error) {
    console.error("❌ Error listing covers/ folder:", error);
    process.exit(1);
  }

  const siteIds = (siteFolders || [])
    .map((entry) => entry.name)
    .filter(Boolean);

  if (!siteIds.length) {
    console.log("ℹ️ No site folders found under covers/.");
    return;
  }

  console.log(`Found ${siteIds.length} site folder(s) under covers/.`);

  let processed = 0;

  for (const siteId of siteIds) {
    await processSiteFolder(siteId);
    processed++;
    console.log(`\nProgress: ${processed}/${siteIds.length} sites done.`);
  }

  console.log("✅ Backfill complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
