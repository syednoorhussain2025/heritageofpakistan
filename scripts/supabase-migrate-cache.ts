// scripts/supabase-migrate-cache.ts
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Optional: quick sanity log
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

// Bucket and roots to process
const BUCKET = "site-images";
const ROOT_FOLDERS = ["covers", "gallery"];

// 1 year in seconds
const CACHE_CONTROL = "31536000";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Recursively list all file paths under a given prefix.
 * Folders are returned with null metadata.
 */
async function listAllFiles(prefix: string): Promise<string[]> {
  const result: string[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw error;
    }
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

      const isFolder = !item.metadata; // folders have null metadata
      if (isFolder) {
        const childFiles = await listAllFiles(fullPath);
        result.push(...childFiles);
      } else {
        result.push(fullPath);
      }
    }

    if (data.length < pageSize) break;
    offset += data.length;
  }

  return result;
}

async function migrate() {
  console.log("Starting cacheControl migration");
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Roots: ${ROOT_FOLDERS.join(", ")}`);
  console.log(`Target cacheControl: ${CACHE_CONTROL} seconds\n`);

  let allFiles: string[] = [];

  for (const root of ROOT_FOLDERS) {
    console.log(`Listing files under "${root}"...`);
    const files = await listAllFiles(root);
    console.log(`  Found ${files.length} files`);
    allFiles = allFiles.concat(files);
  }

  console.log(`\nTotal files to process: ${allFiles.length}\n`);

  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const path of allFiles) {
    processed += 1;
    try {
      // Download existing file
      const { data: downloadData, error: downloadError } =
        await supabase.storage.from(BUCKET).download(path);

      if (downloadError || !downloadData) {
        throw downloadError || new Error("No data returned from download");
      }

      const arrayBuffer = await downloadData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Reupload with cacheControl and upsert
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          cacheControl: CACHE_CONTROL,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      success += 1;
      console.log(`[${processed}/${allFiles.length}] ✅ Updated ${path}`);
    } catch (err) {
      failed += 1;
      console.error(`[${processed}/${allFiles.length}] ❌ FAILED ${path}`, err);
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  console.log("\nMigration finished");
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${success}`);
  console.log(`Failed: ${failed}`);
}

migrate().catch((err) => {
  console.error("Fatal error during migration", err);
  process.exit(1);
});
