// scripts/regenerate-thumbs.ts
//
// Regenerates thumb variants at 800px long edge.
// By default runs in --verify mode: checks each existing thumb's actual
// dimensions and only re-processes ones that are missing or still at the
// old 400px size. Use --force to reprocess everything regardless.
//
// Usage:
//   npx ts-node scripts/regenerate-thumbs.ts            # smart verify + fix
//   npx ts-node scripts/regenerate-thumbs.ts --force    # reprocess all
//   npx ts-node scripts/regenerate-thumbs.ts --dry-run  # list without uploading

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "site-images";
const THUMB_LONG_EDGE = 800;
const CONCURRENCY = 3;
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const VARIANT_SUFFIXES = ["_thumb", "_sm", "_md", "_lg", "_hero"];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function isOriginal(path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  const base = lastDot === -1 ? path : path.slice(0, lastDot);
  return !VARIANT_SUFFIXES.some((s) => base.endsWith(s));
}

function thumbPath(originalPath: string): string {
  const lastDot = originalPath.lastIndexOf(".");
  if (lastDot === -1) return `${originalPath}_thumb`;
  return `${originalPath.slice(0, lastDot)}_thumb${originalPath.slice(lastDot)}`;
}

async function listAllFiles(prefix: string): Promise<string[]> {
  const PAGE = 1000;
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(`list("${prefix}") failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id == null) {
        const children = await listAllFiles(fullPath);
        paths.push(...children);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return paths;
}

async function download(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`download("${path}") failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Returns the long edge of the thumb if it exists and is readable, or null if
 * the file is missing or unreadable.
 */
async function getThumbLongEdge(path: string): Promise<number | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    const buf = Buffer.from(await data.arrayBuffer());
    const { width, height } = await sharp(buf).metadata();
    if (!width || !height) return null;
    return Math.max(width, height);
  } catch {
    return null;
  }
}

async function processOne(originalPath: string): Promise<void> {
  const dest = thumbPath(originalPath);

  if (DRY_RUN) {
    console.log(`  [dry-run] ${originalPath} → ${dest}`);
    return;
  }

  const inputBuffer = await download(originalPath);

  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: THUMB_LONG_EDGE,
      height: THUMB_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(dest, outputBuffer, {
      upsert: true,
      cacheControl: "31536000",
      contentType: "image/jpeg",
    });

  if (error) throw new Error(`upload("${dest}") failed: ${error.message}`);
}

async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onDone: (index: number) => void
): Promise<{ errors: { index: number; error: unknown }[] }> {
  const errors: { index: number; error: unknown }[] = [];
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        await tasks[i]();
        onDone(i);
      } catch (err) {
        errors.push({ index: i, error: err });
        console.error(`\n  ❌ task ${i + 1}/${tasks.length} failed:`, (err as any)?.message ?? err);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return { errors };
}

async function main() {
  console.log(`\n🔍 Listing all files in bucket "${BUCKET}"...`);
  const allFiles = await listAllFiles("gallery");
  const originals = allFiles.filter(isOriginal);
  const thumbSet = new Set(allFiles.filter((f) => {
    const lastDot = f.lastIndexOf(".");
    const base = lastDot === -1 ? f : f.slice(0, lastDot);
    return base.endsWith("_thumb");
  }));

  console.log(`   Total files : ${allFiles.length}`);
  console.log(`   Originals   : ${originals.length}`);
  console.log(`   Thumbs found: ${thumbSet.size}`);

  let toProcess: string[];

  if (FORCE) {
    toProcess = originals;
    console.log(`\n⚡ --force: reprocessing all ${toProcess.length} originals.`);
  } else {
    // Verify stage: check each thumb
    console.log(`\n🔎 Verifying existing thumbs (downloading headers to check dimensions)...`);

    const missing: string[] = [];
    const outdated: string[] = [];
    const ok: string[] = [];

    let checked = 0;
    const verifyTasks = originals.map((orig) => async () => {
      const dest = thumbPath(orig);
      if (!thumbSet.has(dest)) {
        missing.push(orig);
      } else {
        const longEdge = await getThumbLongEdge(dest);
        if (longEdge === null || longEdge < THUMB_LONG_EDGE) {
          outdated.push(orig);
        } else {
          ok.push(orig);
        }
      }
      checked++;
      process.stdout.write(`\r   Checked ${checked}/${originals.length}...`);
    });

    await pLimit(verifyTasks, CONCURRENCY, () => {});
    process.stdout.write("\n");

    console.log(`\n--- Verification results ---`);
    console.log(`   Already up to date : ${ok.length}`);
    console.log(`   Missing thumb       : ${missing.length}`);
    console.log(`   Outdated (< 800px)  : ${outdated.length}`);

    toProcess = [...missing, ...outdated];

    if (toProcess.length === 0) {
      console.log(`\n✅ All thumbs are already up to date. Nothing to do.`);
      return;
    }

    console.log(`\n🚀 Processing ${toProcess.length} images...`);
  }

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN — no uploads will happen.\n`);
  }

  let done = 0;
  const tasks = toProcess.map((p) => () => processOne(p));

  const { errors } = await pLimit(tasks, CONCURRENCY, (i) => {
    done++;
    process.stdout.write(`\r   ✅ ${done}/${toProcess.length}  (${toProcess[i]})`);
  });

  process.stdout.write("\n");

  console.log(`\n--- Summary ---`);
  console.log(`  Processed : ${toProcess.length - errors.length}/${toProcess.length}`);
  if (errors.length > 0) {
    console.log(`  Failed    : ${errors.length}`);
    for (const { index, error } of errors) {
      console.log(`    • ${toProcess[index]} — ${(error as any)?.message ?? error}`);
    }
    process.exit(1);
  } else {
    console.log(`  All done! ✅`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
