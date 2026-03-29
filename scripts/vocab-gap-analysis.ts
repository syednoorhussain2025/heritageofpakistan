/**
 * scripts/vocab-gap-analysis.ts
 *
 * Automated vocab gap analysis for image tags.
 * - Picks a random site (or use --site <id>)
 * - Downloads 10 random thumb images from that site
 * - Sends them to Claude Haiku with current vocab
 * - Prints coverage table + identified gaps (max 1–2)
 * - Prompts for confirmation before writing to Supabase
 *
 * Usage:
 *   npx ts-node scripts/vocab-gap-analysis.ts
 *   npx ts-node scripts/vocab-gap-analysis.ts --site <site_id>
 *   npx ts-node scripts/vocab-gap-analysis.ts --dry-run   (skip DB writes)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const BUCKET = "site-images";
const PHOTO_COUNT = 10;
const MODEL = "claude-haiku-4-5-20251001";

if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error("Missing env vars. Check .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const ai = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeThumbUrl(storagePath: string): string {
  const clean = storagePath.replace(/^\/+/, "");
  const lastDot = clean.lastIndexOf(".");
  const variantPath =
    lastDot === -1
      ? `${clean}_thumb`
      : `${clean.slice(0, lastDot)}_thumb${clean.slice(lastDot)}`;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${variantPath}`;
}

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.split(";")[0].trim();
    const buf = await res.arrayBuffer();
    const data = Buffer.from(buf).toString("base64");
    return { data, mediaType };
  } catch {
    return null;
  }
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Vocab fetching ────────────────────────────────────────────────────────────

async function fetchVocab(): Promise<
  { id: string; slug: string; name: string; is_multi: boolean; values: string[] }[]
> {
  const { data: dims, error: dimErr } = await db
    .from("photo_tag_dimensions")
    .select("id, slug, name, is_multi, ai_enabled")
    .eq("ai_enabled", true)
    .order("sort_order");

  if (dimErr) throw dimErr;

  const { data: vals, error: valErr } = await db
    .from("photo_tag_values")
    .select("dimension_id, value")
    .eq("is_active", true);

  if (valErr) throw valErr;

  return (dims ?? []).map((d: any) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    is_multi: d.is_multi,
    values: (vals ?? [])
      .filter((v: any) => v.dimension_id === d.id)
      .map((v: any) => v.value),
  }));
}

function vocabToText(
  vocab: { slug: string; name: string; is_multi: boolean; values: string[] }[]
): string {
  return vocab
    .map(
      (d) =>
        `${d.name} (${d.slug}, ${d.is_multi ? "multi" : "single"}): ${d.values.length ? d.values.join(", ") : "(free-text)"}`
    )
    .join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const siteArgIdx = args.indexOf("--site");
  const dryRun = args.includes("--dry-run");
  let siteId: string | null =
    siteArgIdx !== -1 ? args[siteArgIdx + 1] : null;

  // Pick site — derive distinct IDs from site_images (sites table has RLS)
  if (!siteId) {
    const { data: siteRows, error } = await db
      .from("site_images")
      .select("site_id")
      .limit(1000);
    if (error || !siteRows?.length) {
      console.error("Could not fetch site IDs from site_images:", error);
      process.exit(1);
    }
    const distinct = [...new Set(siteRows.map((r: any) => r.site_id))];
    siteId = distinct[Math.floor(Math.random() * distinct.length)] as string;
    console.log(`\n📍 Random site: ${siteId}`);
  } else {
    console.log(`\n📍 Site: ${siteId}`);
  }

  // Fetch photos for this site
  const { data: allPhotos, error: photoErr } = await db
    .from("site_images")
    .select("id, storage_path")
    .eq("site_id", siteId);

  if (photoErr || !allPhotos?.length) {
    console.error("No photos found for site:", photoErr);
    process.exit(1);
  }

  // Randomly sample PHOTO_COUNT
  const shuffled = [...allPhotos].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, PHOTO_COUNT);

  console.log(
    `📸 Fetched ${allPhotos.length} photos, sampling ${sample.length} thumbs…`
  );

  // Download thumbs
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  let loaded = 0;
  for (const photo of sample) {
    const url = makeThumbUrl(photo.storage_path);
    const img = await fetchImageAsBase64(url);
    if (!img) {
      console.warn(`  ⚠️  Could not load: ${url}`);
      continue;
    }
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType as any,
        data: img.data,
      },
    });
    loaded++;
    process.stdout.write(`\r  Loaded ${loaded}/${sample.length} images…`);
  }
  console.log();

  if (imageBlocks.length === 0) {
    console.error("No images could be loaded.");
    process.exit(1);
  }

  // Fetch vocab
  console.log("📚 Fetching current vocab…");
  const vocab = await fetchVocab();
  const vocabText = vocabToText(vocab);

  // Build prompt
  const systemPrompt = `You are a heritage photography analyst for Pakistan. Your job is to find CRITICAL gaps in an image tagging vocabulary — tags that would open up new discovery axes for users searching heritage photos.

STRICT RULES:
- Maximum 1–2 gaps per analysis. Zero gaps is a valid answer.
- Only identify gaps that are PRIMARY DISCOVERY AXES (things users would actually search/filter by).
- Never add noise, sub-categories, or marginal tags.
- Never add something already covered by existing vocab (even partially).
- If the existing vocab covers everything important in this cluster → output zero gaps.

OUTPUT FORMAT (JSON only, no markdown):
{
  "site_description": "one sentence about what type of site/photos this is",
  "coverage": [
    { "visual_element": "what you see", "covered_by": "dimension_slug: value OR 'not covered'" }
  ],
  "gaps": [
    {
      "type": "new_value" | "new_dimension",
      "dimension_slug": "existing slug (for new_value) or new slug (for new_dimension)",
      "dimension_name": "human label (for new_dimension only)",
      "value": "the value to add",
      "rationale": "one sentence: why this is a primary discovery axis"
    }
  ]
}`;

  const userMessage = `Here are ${imageBlocks.length} photos from a Pakistani heritage site.

EXISTING VOCAB (AI-enabled dimensions only):
${vocabText}

Analyze what is visually present in these photos against the existing vocab. Identify ONLY the most critical missing discovery axes — max 1–2 gaps. If everything is covered, return an empty gaps array.`;

  console.log("🤖 Sending to Claude Haiku…\n");

  const response = await ai.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [...imageBlocks, { type: "text", text: userMessage }],
      },
    ],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse JSON
  let result: any;
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch?.[0] ?? rawText);
  } catch {
    console.error("Failed to parse response:\n", rawText);
    process.exit(1);
  }

  // Print coverage table
  console.log(`\n🏛️  ${result.site_description}\n`);
  console.log("COVERAGE TABLE:");
  console.log("─".repeat(70));
  for (const row of result.coverage ?? []) {
    const covered = row.covered_by === "not covered" ? "❌ NOT COVERED" : `✅ ${row.covered_by}`;
    console.log(`  ${row.visual_element.padEnd(35)} ${covered}`);
  }
  console.log("─".repeat(70));

  if (!result.gaps?.length) {
    console.log("\n✅ No critical gaps — existing vocab covers this cluster well.\n");
    return;
  }

  console.log(`\n🔍 IDENTIFIED GAPS (${result.gaps.length}):\n`);
  for (const gap of result.gaps) {
    if (gap.type === "new_value") {
      console.log(`  + New value: "${gap.value}" → dimension: ${gap.dimension_slug}`);
    } else {
      console.log(`  + New dimension: ${gap.dimension_name} (${gap.dimension_slug})`);
      console.log(`    First value: "${gap.value}"`);
    }
    console.log(`    Rationale: ${gap.rationale}\n`);
  }

  if (dryRun) {
    console.log("(dry-run — skipping DB writes)\n");
    return;
  }

  const confirm = await ask("Write these to Supabase? (y/N): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.\n");
    return;
  }

  // Write to Supabase
  for (const gap of result.gaps) {
    let dimensionId: string | null = null;

    if (gap.type === "new_dimension") {
      // Get next sort_order
      const { data: lastDim } = await db
        .from("photo_tag_dimensions")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      const nextSort = ((lastDim as any)?.sort_order ?? 10) + 1;

      const { data: newDim, error } = await db
        .from("photo_tag_dimensions")
        .insert({
          slug: gap.dimension_slug,
          name: gap.dimension_name,
          is_multi: true,
          ai_enabled: true,
          sort_order: nextSort,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`  ❌ Failed to insert dimension ${gap.dimension_slug}:`, error.message);
        continue;
      }
      dimensionId = (newDim as any).id;
      console.log(`  ✅ Created dimension: ${gap.dimension_name} (${dimensionId})`);
    } else {
      // Look up existing dimension id by slug
      const { data: dim, error } = await db
        .from("photo_tag_dimensions")
        .select("id")
        .eq("slug", gap.dimension_slug)
        .single();

      if (error || !dim) {
        console.error(`  ❌ Dimension not found: ${gap.dimension_slug}`);
        continue;
      }
      dimensionId = (dim as any).id;
    }

    // Insert value using dimension_id
    const { error } = await db.from("photo_tag_values").insert({
      dimension_id: dimensionId,
      value: gap.value,
      is_active: true,
    });
    if (error) {
      console.error(`  ❌ Failed to insert value "${gap.value}":`, error.message);
    } else {
      console.log(`  ✅ Added value: "${gap.value}" → ${gap.dimension_slug}`);
    }
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
