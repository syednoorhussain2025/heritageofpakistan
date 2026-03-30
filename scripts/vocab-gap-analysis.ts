/**
 * scripts/vocab-gap-analysis.ts
 *
 * Automated vocab gap analysis for image tags.
 * - Runs through ALL unanalyzed sites in one go
 * - Within each site, picks 10 RANDOM photos (thumbs)
 * - Sends to Claude Haiku with current vocab
 * - Prints coverage table + identified gaps (max 1–2)
 * - Automatically writes gaps to Supabase (no confirmation needed)
 * - Tracks progress in scripts/vocab-gap-progress.json
 *
 * Usage:
 *   npm run vocab:gap                          all remaining sites
 *   npm run vocab:gap -- --site <site_id>      one specific site only
 *   npm run vocab:gap -- --dry-run             skip DB writes
 *   npm run vocab:gap -- --status              show progress and exit
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const BUCKET = "site-images";
const PHOTO_COUNT = 10;
const MODEL = "claude-haiku-4-5-20251001";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.join(__dir, "vocab-gap-progress.json");

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const ai = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Progress tracking ─────────────────────────────────────────────────────────

type Progress = { analyzed: string[]; all: string[] };

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  return { analyzed: [], all: [] };
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeThumbUrl(storagePath: string): string {
  const clean = storagePath.replace(/^\/+/, "");
  const lastDot = clean.lastIndexOf(".");
  const variantPath =
    lastDot === -1
      ? `${clean}_thumb`
      : `${clean.slice(0, lastDot)}_thumb${clean.slice(lastDot)}`;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(variantPath)}`;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mediaType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { data, mediaType };
  } catch { return null; }
}

// ── Vocab ─────────────────────────────────────────────────────────────────────

type VocabDim = { id: string; slug: string; name: string; is_multi: boolean; values: string[] };

async function fetchVocab(): Promise<VocabDim[]> {
  const { data: dims, error: dimErr } = await db
    .from("photo_tag_dimensions").select("id, slug, name, is_multi, ai_enabled")
    .eq("ai_enabled", true).order("sort_order");
  if (dimErr) throw dimErr;

  const { data: vals, error: valErr } = await db
    .from("photo_tag_values").select("dimension_id, value").eq("is_active", true);
  if (valErr) throw valErr;

  return (dims ?? []).map((d: any) => ({
    id: d.id, slug: d.slug, name: d.name, is_multi: d.is_multi,
    values: (vals ?? []).filter((v: any) => v.dimension_id === d.id).map((v: any) => v.value),
  }));
}

function vocabToText(vocab: VocabDim[]): string {
  return vocab
    .map((d) => `${d.name} (${d.slug}, ${d.is_multi ? "multi" : "single"}): ${d.values.length ? d.values.join(", ") : "(free-text)"}`)
    .join("\n");
}

// ── Analyze one site ──────────────────────────────────────────────────────────

async function analyzeSite(
  siteId: string,
  siteIndex: number,
  total: number,
  dryRun: boolean,
  progress: Progress
): Promise<void> {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📍 Site ${siteIndex}/${total}  —  ${siteId}`);

  const { data: allPhotos, error: photoErr } = await db
    .from("site_images").select("id, storage_path").eq("site_id", siteId);

  if (photoErr || !allPhotos?.length) {
    console.warn(`  ⚠️  No photos found — skipping.`);
    if (!progress.analyzed.includes(siteId)) progress.analyzed.push(siteId);
    saveProgress(progress);
    return;
  }

  // Random sample
  const sample = [...allPhotos].sort(() => Math.random() - 0.5).slice(0, PHOTO_COUNT);
  console.log(`📸 ${allPhotos.length} photos total, sampling ${sample.length} thumbs…`);

  // Download thumbs
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  let loaded = 0;
  for (const photo of sample) {
    const img = await fetchImageAsBase64(makeThumbUrl(photo.storage_path));
    if (!img) continue;
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType as any, data: img.data } });
    loaded++;
    process.stdout.write(`\r  Loaded ${loaded}/${sample.length} images…`);
  }
  console.log();

  if (imageBlocks.length === 0) {
    console.warn(`  ⚠️  No images loaded — skipping.`);
    return;
  }

  // Fetch fresh vocab each site so new additions are reflected
  const vocab = await fetchVocab();

  const systemPrompt = `You are a heritage photography analyst for Pakistan. Your job is to find CRITICAL gaps in an image tagging vocabulary — tags that would open up new discovery axes for general users browsing Pakistani heritage photos.

STRICT RULES:
- Maximum 1–2 gaps. Zero gaps is the most common correct answer — default to zero unless something is glaringly missing.
- A gap must be a BROAD, SIMPLE discovery axis that a general visitor would actually filter by (e.g. "waterfall", "cave", "bridge"). NOT academic/technical/niche terms.
- NEVER propose new dimensions. Only add values to existing dimensions. New dimensions are almost never needed.
- Never add anything already covered by existing vocab, even partially.
- Never add subcategories, damage types, ecosystem classifications, conservation terms, or specialist jargon.
- Ask yourself: "Would a curious non-expert tourist use this tag to find photos?" If not → zero gaps.

OUTPUT FORMAT (JSON only, no markdown):
{
  "site_description": "one sentence about what type of site/photos this is",
  "coverage": [
    { "visual_element": "what you see", "covered_by": "dimension_slug: value OR 'not covered'" }
  ],
  "gaps": [
    {
      "type": "new_value",
      "dimension_slug": "existing slug",
      "value": "the value to add",
      "rationale": "one sentence: why a general tourist would search for this"
    }
  ]
}`;

  const userMessage = `Here are ${imageBlocks.length} photos from a Pakistani heritage site.

EXISTING VOCAB (AI-enabled dimensions only):
${vocabToText(vocab)}

Analyze what is visually present in these photos against the existing vocab. Identify ONLY the most critical missing discovery axes — max 1–2 gaps. If everything is covered, return an empty gaps array.`;

  process.stdout.write("🤖 Analyzing…");
  let response: Anthropic.Message;
  while (true) {
    try {
      response = await ai.messages.create({
        model: MODEL, max_tokens: 1024, system: systemPrompt,
        messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: userMessage }] }],
      });
      break;
    } catch (err: any) {
      if (err?.status === 429) {
        const retryAfter = parseInt(err?.headers?.["retry-after"] ?? "60", 10);
        process.stdout.write(` rate limited, waiting ${retryAfter}s…`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
      } else {
        throw err;
      }
    }
  }
  console.log(" done.\n");

  const rawText = response!.content[0].type === "text" ? response!.content[0].text : "";
  let result: any;
  try {
    result = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? rawText);
  } catch {
    console.error("  Failed to parse response — skipping site.");
    return;
  }

  // Coverage table
  console.log(`🏛️  ${result.site_description}\n`);
  console.log("COVERAGE:");
  console.log("─".repeat(70));
  for (const row of result.coverage ?? []) {
    const covered = row.covered_by === "not covered" ? "❌ NOT COVERED" : `✅ ${row.covered_by}`;
    console.log(`  ${String(row.visual_element).padEnd(35)} ${covered}`);
  }
  console.log("─".repeat(70));

  // Hard filter: never allow new dimensions — values only
  result.gaps = (result.gaps ?? []).filter((g: any) => g.type === "new_value");

  if (!result.gaps.length) {
    console.log("\n✅ No critical gaps.\n");
    if (!progress.analyzed.includes(siteId)) progress.analyzed.push(siteId);
    saveProgress(progress);
    return;
  }

  console.log(`\n🔍 GAPS (${result.gaps.length}):\n`);
  for (const gap of result.gaps) {
    if (gap.type === "new_value") {
      console.log(`  + "${gap.value}"  →  ${gap.dimension_slug}`);
    } else {
      console.log(`  + NEW DIMENSION "${gap.dimension_name}" (${gap.dimension_slug})  →  first value: "${gap.value}"`);
    }
    console.log(`    ${gap.rationale}\n`);
  }

  if (dryRun) {
    console.log("  (dry-run — skipping writes)\n");
    if (!progress.analyzed.includes(siteId)) progress.analyzed.push(siteId);
    saveProgress(progress);
    return;
  }

  // Write gaps
  const added: string[] = [];
  const failed: string[] = [];

  for (const gap of result.gaps) {
    let dimensionId: string | null = null;

    if (gap.type === "new_dimension") {
      const { data: lastDim } = await db
        .from("photo_tag_dimensions").select("sort_order")
        .order("sort_order", { ascending: false }).limit(1).single();
      const nextSort = ((lastDim as any)?.sort_order ?? 10) + 1;

      const { data: newDim, error } = await db.from("photo_tag_dimensions")
        .insert({ slug: gap.dimension_slug, name: gap.dimension_name, is_multi: true, ai_enabled: true, sort_order: nextSort })
        .select("id").single();
      if (error) { failed.push(gap.dimension_name + ": " + error.message); continue; }
      dimensionId = (newDim as any).id;
    } else {
      const { data: dim, error } = await db.from("photo_tag_dimensions")
        .select("id").eq("slug", gap.dimension_slug).single();
      if (error || !dim) { failed.push(`${gap.value}: dimension not found (${gap.dimension_slug})`); continue; }
      dimensionId = (dim as any).id;
    }

    const { error } = await db.from("photo_tag_values")
      .insert({ dimension_id: dimensionId, value: gap.value, is_active: true });
    if (error) { failed.push(`${gap.value}: ${error.message}`); }
    else { added.push(gap.type === "new_dimension" ? `NEW DIM "${gap.dimension_name}" → "${gap.value}"` : `"${gap.value}" → ${gap.dimension_slug}`); }
  }

  if (!progress.analyzed.includes(siteId)) progress.analyzed.push(siteId);
  saveProgress(progress);

  if (added.length) { console.log(`\n  ✅ Added: ${added.join(", ")}`); }
  if (failed.length) { console.log(`  ❌ Failed: ${failed.join(", ")}`); }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const siteArg = args.includes("--site") ? args[args.indexOf("--site") + 1] : null;
  const dryRun = args.includes("--dry-run");
  const showStatus = args.includes("--status");

  // Fetch all distinct site_ids by paginating (table has 10k+ rows)
  const allSiteIds: string[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("site_images").select("site_id").range(offset, offset + PAGE - 1);
    if (error) { console.error("Could not fetch site IDs:", error); process.exit(1); }
    if (!data?.length) break;
    for (const r of data) {
      if (!allSiteIds.includes(r.site_id)) allSiteIds.push(r.site_id);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  if (!allSiteIds.length) { console.error("No sites found."); process.exit(1); }

  const progress = loadProgress();
  for (const id of allSiteIds) { if (!progress.all.includes(id)) progress.all.push(id); }
  saveProgress(progress);

  if (showStatus) {
    console.log(`\nProgress: ${progress.analyzed.length}/${progress.all.length} sites analyzed`);
    console.log(`Remaining: ${progress.all.length - progress.analyzed.length}\n`);
    return;
  }

  // Determine sites to process
  const sitesToProcess = siteArg
    ? [siteArg]
    : progress.all.filter((id) => !progress.analyzed.includes(id));

  if (!sitesToProcess.length) {
    console.log("\n✅ All sites have been analyzed. Run with --status to see summary.\n");
    return;
  }

  console.log(`\nStarting vocab gap analysis — ${sitesToProcess.length} site(s) to process.\n`);

  const sessionAdded: string[] = [];

  for (let i = 0; i < sitesToProcess.length; i++) {
    const prevAnalyzed = progress.analyzed.length;
    await analyzeSite(sitesToProcess[i], progress.all.indexOf(sitesToProcess[i]) + 1, progress.all.length, dryRun, progress);
    // Track anything added this session via progress delta (just count sites)
    if (progress.analyzed.length > prevAnalyzed) sessionAdded.push(sitesToProcess[i]);
  }

  // Final session summary
  console.log("\n" + "═".repeat(70));
  console.log("SESSION COMPLETE");
  console.log("═".repeat(70));
  console.log(`  Sites processed this run: ${sitesToProcess.length}`);
  console.log(`  Total progress: ${progress.analyzed.length}/${progress.all.length} sites done`);
  const remaining = progress.all.length - progress.analyzed.length;
  if (remaining > 0) console.log(`  Remaining: ${remaining} sites — run again to continue`);
  else console.log(`  All sites covered!`);
  console.log("═".repeat(70) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
