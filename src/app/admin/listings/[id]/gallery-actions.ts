// src/app/admin/listings/[id]/gallery-actions.ts
"use server";

import { createClient } from "@supabase/supabase-js";
import { logAIUsage } from "@/server/ai/usage";
import { getVariantPublicUrl } from "@/lib/imagevariants";

export type InputImage = {
  id: string;
  publicUrl: string;
  filename: string;
  alt?: string | null;
};

type AiImage = { aiId: string; realId: string; url: string; filename: string };
export type CaptionAltOut = { id: string; alt: string; caption: string; sceneDescription?: string };

export type TagDimensionVocab = {
  slug: string;
  name: string;
  ai_enabled: boolean;
  values: string[]; // allowed values (empty for 'specific' free-text)
};

export type TagsOut = {
  /** site_image real id */
  imageId: string;
  /** dimension_slug → assigned values */
  tags: Record<string, string[]>;
};

const PROVIDER = "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) {
  console.warn("[captions] OPENAI_API_KEY is missing; calls will fail.");
}

/* ------------------ Pricing ------------------ */
const PRICE_PER_1K: Record<string, { input?: number; output?: number }> = {
  "gpt-4o-mini": { input: 0.15 / 1000, output: 0.6 / 1000 },
  "gpt-5": {},
  "gpt-5-mini": {},
  "gpt-5-nano": {},
  "gpt-5-chat-latest": {},
};
function estimateUsd(modelId: string, inTok = 0, outTok = 0): number | null {
  const p = PRICE_PER_1K[modelId];
  if (!p || p.input == null || p.output == null) return null;
  return +(inTok * p.input + outTok * p.output).toFixed(6);
}

/* ------------------ Supabase ------------------ */
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------ Helpers ------------------ */

/** Map system card names → API aliases */
function mapModelAlias(modelId: string): string {
  const map: Record<string, string> = {
    "gpt-5-thinking": "gpt-5",
    "gpt-5-thinking-mini": "gpt-5-mini",
    "gpt-5-thinking-nano": "gpt-5-nano",
    "gpt-5-main": "gpt-5-chat-latest",
  };
  return map[modelId] || modelId;
}

/** Use pre-generated small variant for AI (avoids Supabase image transformations). */
function resizedForAI(url: string): string {
  try {
    const idx = url.indexOf("/site-images/");
    if (idx !== -1) {
      const path = decodeURIComponent(url.slice(idx + "/site-images/".length).split("?")[0]);
      return getVariantPublicUrl(path, "sm");
    }
    return url.split("?")[0];
  } catch {
    return url;
  }
}

/** Public server action the UI can call to know what model Captions will use. */
export async function getCaptionEngineInfo(): Promise<{
  provider: string;
  modelId: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number | null;
  captionsMaxWords: number;
}> {
  type Row = {
    scope?: string | null;
    data?: {
      providerKey?: string | null;
      modelId?: string | null;
      temperature?: number | null;
      topP?: number | null;
      maxOutputTokens?: number | null;
      captions?: { modelId?: string | null; maxWords?: number | null } | null;
    } | null;
  };

  const FALLBACK = {
    provider: "openai",
    modelId: "gpt-4o-mini",
    temperature: 0.2,
    topP: 1,
    maxOutputTokens: 1200 as number | null,
    captionsMaxWords: 12,
  };

  try {
    const { data } = await svc()
      .from("ai_engine_settings")
      .select("data")
      .eq("scope", "admin")
      .maybeSingle<Row>();

    const settings = data?.data ?? {};
    const modelId =
      settings?.captions?.modelId?.trim() ||
      settings?.modelId?.trim() ||
      FALLBACK.modelId;

    // Infer provider from model id if not explicitly set
    const providerKey = settings?.providerKey?.trim() || FALLBACK.provider;
    const provider = modelId.startsWith("claude-") ? "anthropic" : providerKey;

    return {
      provider,
      modelId,
      temperature:
        typeof settings?.temperature === "number"
          ? settings.temperature
          : FALLBACK.temperature,
      topP: typeof settings?.topP === "number" ? settings.topP : FALLBACK.topP,
      maxOutputTokens:
        settings?.maxOutputTokens == null
          ? FALLBACK.maxOutputTokens
          : settings.maxOutputTokens,
      captionsMaxWords:
        settings?.captions?.maxWords && settings.captions.maxWords > 0
          ? settings.captions.maxWords
          : FALLBACK.captionsMaxWords,
    };
  } catch {
    return FALLBACK;
  }
}

function limitWords(s: string, maxWords = 12): string {
  const words = (s || "").trim().split(/\s+/);
  if (words.length <= maxWords) return (s || "").trim();
  return words.slice(0, maxWords).join(" ");
}

/** 429 retry helper */
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------ AI Call ------------------ */
async function callOpenAIVisionBatch(
  cfg: {
    modelId: string;
    temperature: number;
    topP: number;
    maxOutputTokens: number | null;
    maxWords: number;
  },
  images: AiImage[],
  context: string,
  siteName?: string | null
): Promise<{
  captions: Record<string, { alt: string; caption: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}> {
  const normalizedId = mapModelAlias(cfg.modelId);

  const system = [
    {
      role: "system",
      content:
        "You are assisting a heritage & travel website.\n" +
        `- ALT TEXT: factual, literal description of the image (<= ${cfg.maxWords} words).\n` +
        `- CAPTION: short narrative (<= ${cfg.maxWords} words), tied to heritage/travel context.\n` +
        (siteName
          ? `- SITE NAME for captions: "${siteName}". Naturally weave the site name into roughly 1 in 3 captions — not every caption. Vary placement (beginning, middle, end) and sentence structure each time so it never feels templated. Never force it; only include it where it reads naturally.\n`
          : "") +
        "- SCENE DESCRIPTION: exactly 3 sentences, 40-50 words total. Only what is visually present. No historical inference, no location names, no technical jargon. Match this style exactly:\n" +
        "  Example 1 (gateway): \"A symmetrical four-minaret gateway fills the frame, approached by a straight path flanked by low hedges. The facade is covered in dense polychrome tile panels — blue, yellow, green — across arched openings and octagonal minaret shafts. Urban buildings and power lines are visible through the central arch.\"\n" +
        "  Example 2 (tile detail): \"A single rectangular tile panel set flush in a weathered brick wall. A symmetrical flowering tree in deep blue, green, and brown spreads across a cream ground, bordered by bold yellow diamond tiles. Even daylight, no shadows.\"\n" +
        "  Example 3 (minaret close-up): \"Close-up of an octagonal minaret shaft covered edge to edge in individual polychrome tile panels. Each panel is distinct — floral vases, botanical sprays, geometric rosettes in vivid yellow, blue, and green on cream. Trees visible behind, bright midday light.\"\n" +
        "  Example 4 (wide landscape): \"A wide shot of a domed structure set within a walled garden, centred in the frame against an open sky. The dome is white with a drum base, flanked by two smaller domed chambers in red brick. Grass forecourt, no people.\"\n" +
        "Do not invent details. Output JSON exactly as requested.",
    },
  ];
  const expectedIds = images.map((x) => x.aiId);
  const content: any[] = [
    {
      type: "text",
      text:
        "Site context (use ONLY for alt and caption — do NOT use for scene_description):\n" +
        context +
        "\n\nTask:\n" +
        "- For each image, return alt, caption, and scene_description.\n" +
        "- Alt = factual description for accessibility.\n" +
        "- Caption = short narrative line.\n" +
        `- Alt and caption each <= ${cfg.maxWords} words.\n` +
        "- scene_description = ignore the site context above entirely. Write only what you can see in the photo: shapes, colours, textures, light, composition. No site names, no historical terms, no architectural jargon.\n" +
        "- Use EXACT ids I provide (do not rename or reorder).\n" +
        "- Output JSON ONLY with this schema:\n" +
        '  {"images":[{"id":"img1","alt":"...","caption":"...","scene_description":"..."}]}\n' +
        `Expected ids (all must be present once each): ${expectedIds.join(", ")}`,
    },
  ];
  for (const img of images) {
    content.push({
      type: "text",
      text: `Image id: ${img.aiId}  filename: ${img.filename}`,
    });
    content.push({ type: "image_url", image_url: { url: img.url } });
  }

  const body: Record<string, any> = {
    model: normalizedId,
    messages: [...system, { role: "user", content }],
    response_format: { type: "json_object" },
  };

  // Token parameter: GPT-5 uses max_completion_tokens; others use max_tokens
  if (cfg.maxOutputTokens != null) {
    if (normalizedId.startsWith("gpt-5")) {
      body.max_completion_tokens = cfg.maxOutputTokens;
    } else {
      body.max_tokens = cfg.maxOutputTokens;
    }
  }

  // Temperature/top_p:
  // - Allow tuning for GPT-4o family and full GPT-5 ("gpt-5").
  // - Omit for other GPT-5 variants (mini/nano/chat-latest) to avoid "unsupported_value".
  const supportsTuning =
    normalizedId.startsWith("gpt-4") || normalizedId === "gpt-5";
  if (supportsTuning) {
    body.temperature = cfg.temperature;
    body.top_p = cfg.topP;
  }
  // else: omit temperature/top_p

  // Retry loop (429)
  let attempts = 0;
  const maxAttempts = 6;
  while (true) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.status !== 429) {
      if (!res.ok) {
        const errText = await res.text();
        const err: any = new Error(`OpenAI error ${res.status}: ${errText}`);
        (err.status = res.status), (err.response = res);
        throw err;
      }
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content || "{}";
      let parsed: any = {};
      try {
        parsed = JSON.parse(text);
      } catch {}
      const out: Record<string, { alt: string; caption: string; sceneDescription?: string }> = {};
      const arr = Array.isArray(parsed?.images) ? parsed.images : [];
      for (const item of arr) {
        if (!item || typeof item.id !== "string") continue;
        const alt =
          typeof item.alt === "string"
            ? limitWords(item.alt.trim(), cfg.maxWords)
            : "Photo of heritage site.";
        const caption =
          typeof item.caption === "string"
            ? limitWords(item.caption.trim(), cfg.maxWords)
            : "Heritage site photo.";
        const sceneDescription =
          typeof item.scene_description === "string"
            ? item.scene_description.trim()
            : undefined;
        out[item.id] = { alt, caption, sceneDescription };
      }
      return { captions: out, usage: json?.usage ?? undefined };
    }

    attempts++;
    if (attempts > maxAttempts) {
      const errText = await res.text();
      const err: any = new Error(`OpenAI error 429 (max retries): ${errText}`);
      (err.status = 429), (err.response = res);
      throw err;
    }
    const retryAfterHeader =
      res.headers.get("retry-after") ||
      res.headers.get("x-ratelimit-reset-requests") ||
      res.headers.get("x-ratelimit-reset-tokens");
    let waitMs = 2000 * attempts;
    const parsed = Number(retryAfterHeader);
    if (!Number.isNaN(parsed) && parsed > 0)
      waitMs = Math.max(waitMs, parsed * 1000);
    await sleep(waitMs);
  }
}

/* ------------------ Anthropic Vision (captions) ------------------ */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function callAnthropicVisionBatch(
  cfg: { modelId: string; maxOutputTokens: number | null; maxWords: number },
  images: AiImage[],
  context: string,
  siteName?: string | null
): Promise<{
  captions: Record<string, { alt: string; caption: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

  const expectedIds = images.map((x) => x.aiId);
  const userContent: any[] = [
    {
      type: "text",
      text:
        "Site context (use ONLY for alt and caption — do NOT use for scene_description):\n" + context +
        "\n\nTask:\n" +
        "- For each image, return alt, caption, and scene_description.\n" +
        "- Alt = factual description for accessibility.\n" +
        "- Caption = short narrative line.\n" +
        `- Alt and caption each <= ${cfg.maxWords} words.\n` +
        "- scene_description = ignore the site context above entirely. Write only what you can see in the photo: shapes, colours, textures, light, composition. No site names, no historical terms, no architectural jargon.\n" +
        "- Use EXACT ids I provide.\n" +
        "- Output JSON ONLY: {\"images\":[{\"id\":\"img1\",\"alt\":\"...\",\"caption\":\"...\",\"scene_description\":\"...\"}]}\n" +
        `Expected ids: ${expectedIds.join(", ")}`,
    },
  ];
  for (const img of images) {
    userContent.push({ type: "text", text: `Image id: ${img.aiId}  filename: ${img.filename}` });
    userContent.push({ type: "image", source: { type: "url", url: img.url } });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.modelId,
      max_tokens: cfg.maxOutputTokens ?? 1200,
      system:
        "You are assisting a heritage & travel website.\n" +
        `- ALT TEXT: factual, literal description (<= ${cfg.maxWords} words).\n` +
        `- CAPTION: short narrative (<= ${cfg.maxWords} words), tied to heritage/travel context.\n` +
        (siteName
          ? `- SITE NAME for captions: "${siteName}". Naturally weave the site name into roughly 1 in 3 captions — not every caption. Vary placement (beginning, middle, end) and sentence structure each time so it never feels templated. Never force it; only include it where it reads naturally.\n`
          : "") +
        "- SCENE DESCRIPTION: exactly 3 sentences, 40-50 words total. Only what is visually present. No historical inference, no location names, no technical jargon. Match this style exactly:\n" +
        "  Example 1 (gateway): \"A symmetrical four-minaret gateway fills the frame, approached by a straight path flanked by low hedges. The facade is covered in dense polychrome tile panels — blue, yellow, green — across arched openings and octagonal minaret shafts. Urban buildings and power lines are visible through the central arch.\"\n" +
        "  Example 2 (tile detail): \"A single rectangular tile panel set flush in a weathered brick wall. A symmetrical flowering tree in deep blue, green, and brown spreads across a cream ground, bordered by bold yellow diamond tiles. Even daylight, no shadows.\"\n" +
        "  Example 3 (minaret close-up): \"Close-up of an octagonal minaret shaft covered edge to edge in individual polychrome tile panels. Each panel is distinct — floral vases, botanical sprays, geometric rosettes in vivid yellow, blue, and green on cream. Trees visible behind, bright midday light.\"\n" +
        "  Example 4 (wide landscape): \"A wide shot of a domed structure set within a walled garden, centred in the frame against an open sky. The dome is white with a drum base, flanked by two smaller domed chambers in red brick. Grass forecourt, no people.\"\n" +
        "Output JSON only.",
      messages: [{ role: "user", content: userContent }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${errText}`);
  }
  const json = await res.json();
  const raw = json?.content?.[0]?.text || "{}";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch {}
  const out: Record<string, { alt: string; caption: string; sceneDescription?: string }> = {};
  for (const item of (Array.isArray(parsed?.images) ? parsed.images : [])) {
    if (!item || typeof item.id !== "string") continue;
    out[item.id] = {
      alt: limitWords(typeof item.alt === "string" ? item.alt.trim() : "Photo of heritage site.", cfg.maxWords),
      caption: limitWords(typeof item.caption === "string" ? item.caption.trim() : "Heritage site photo.", cfg.maxWords),
      sceneDescription: typeof item.scene_description === "string" ? item.scene_description.trim() : undefined,
    };
  }
  return {
    captions: out,
    usage: json?.usage ? {
      prompt_tokens: json.usage.input_tokens ?? 0,
      completion_tokens: json.usage.output_tokens ?? 0,
      total_tokens: (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
    } : undefined,
  };
}

/* ------------------ Anthropic Vision (tags) ------------------ */
async function callAnthropicTagBatch(
  cfg: { modelId: string; maxOutputTokens: number | null },
  images: AiImage[],
  context: string,
  vocabulary: TagDimensionVocab[]
): Promise<{
  tags: Record<string, Record<string, string[]>>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

  const aiDimensions = vocabulary.filter((d) => d.ai_enabled);
  const vocabLines = aiDimensions.map((d) => {
    if (d.slug === "specific") return `- "${d.slug}": FREE TEXT array, max 3 short phrases describing only physical/visual details visible in THIS photo — materials, textures, construction techniques, decorative motifs. NEVER use building type names (mosque, tomb, fort, temple, caravanserai), site names, or era/dynasty names. Can be [].`;
    return `- "${d.slug}": pick 0–${d.values.length} values ONLY from: [${d.values.map((v) => `"${v}"`).join(", ")}]`;
  }).join("\n");

  const allowedMap = new Map<string, Set<string>>();
  for (const d of aiDimensions) {
    if (d.slug !== "specific") allowedMap.set(d.slug, new Set(d.values));
  }

  const expectedIds = images.map((x) => x.aiId);
  const userContent: any[] = [
    {
      type: "text",
      text:
        "Site context (for caption/alt reference only — do NOT use for tags):\n" + context +
        "\n\nDimensions and allowed values:\n" + vocabLines +
        "\n\nRules:\n" +
        "- Only include a dimension if the value is DIRECTLY AND CLEARLY VISIBLE in this specific photo.\n" +
        "- Do NOT infer from site context — if you cannot see it in the photo, do not tag it.\n" +
        "- For 'specific': physical/visual details only — materials, textures, construction, decorative motifs. No building types, no site names, no historical terms.\n" +
        "- Output JSON ONLY: {\"images\":[{\"id\":\"img1\",\"tags\":{\"architectural_structural\":[\"dome\"]}}]}\n" +
        `Expected ids: ${expectedIds.join(", ")}`,
    },
  ];
  for (const img of images) {
    userContent.push({ type: "text", text: `Image id: ${img.aiId}  filename: ${img.filename}` });
    userContent.push({ type: "image", source: { type: "url", url: img.url } });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.modelId,
      max_tokens: cfg.maxOutputTokens ?? 1200,
      system:
        "You are a visual analyst for a heritage photography website covering Pakistan.\n" +
        "Tag photos based ONLY on what is directly visible in each photo — not what you know about the site.\n" +
        "Never use building type names (mosque, tomb, fort, temple), site names, or historical terms as tags.\n" +
        "Output strict JSON only.",
      messages: [{ role: "user", content: userContent }],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${errText}`);
  }
  const json = await res.json();
  const raw = json?.content?.[0]?.text || "{}";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch {}

  const out: Record<string, Record<string, string[]>> = {};
  for (const item of (Array.isArray(parsed?.images) ? parsed.images : [])) {
    if (!item || typeof item.id !== "string") continue;
    const cleanTags: Record<string, string[]> = {};
    if (item.tags && typeof item.tags === "object") {
      for (const [slug, vals] of Object.entries(item.tags)) {
        if (!Array.isArray(vals)) continue;
        if (slug === "specific") {
          const specific = vals.filter((v) => typeof v === "string" && v.trim()).map((v) => String(v).trim()).slice(0, 3);
          if (specific.length) cleanTags[slug] = specific;
        } else {
          const allowed = allowedMap.get(slug);
          if (!allowed) continue;
          const valid = vals.filter((v) => typeof v === "string" && allowed.has(v)).map((v) => String(v));
          if (valid.length) cleanTags[slug] = valid;
        }
      }
    }
    out[item.id] = cleanTags;
  }
  return {
    tags: out,
    usage: json?.usage ? {
      prompt_tokens: json.usage.input_tokens ?? 0,
      completion_tokens: json.usage.output_tokens ?? 0,
      total_tokens: (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
    } : undefined,
  };
}

/* ------------------ Tag Generation ------------------ */

async function callOpenAITagBatch(
  cfg: {
    modelId: string;
    temperature: number;
    topP: number;
    maxOutputTokens: number | null;
  },
  images: AiImage[],
  context: string,
  vocabulary: TagDimensionVocab[]
): Promise<{
  tags: Record<string, Record<string, string[]>>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const normalizedId = mapModelAlias(cfg.modelId);

  // Build vocabulary description for the prompt
  const aiDimensions = vocabulary.filter((d) => d.ai_enabled);
  const vocabLines = aiDimensions.map((d) => {
    if (d.slug === "specific") {
      return `- "${d.slug}": FREE TEXT array, max 3 short phrases describing only physical/visual details visible in THIS photo — materials, textures, construction techniques, decorative motifs. NEVER use building type names (mosque, tomb, fort, temple, caravanserai), site names, or era/dynasty names. Can be empty [].`;
    }
    return `- "${d.slug}": pick 0–${d.values.length} values ONLY from: [${d.values.map((v) => `"${v}"`).join(", ")}]`;
  }).join("\n");

  const schemaExample = `{"images":[{"id":"img1","tags":{"architectural_structural":["dome","arch"],"color":["white","gold/yellow"],"specific":["carved wooden pulpit"]}}]}`;

  const system = [
    {
      role: "system",
      content:
        "You are a visual analyst for a heritage and travel photography website covering Pakistan.\n" +
        "Your job is to tag photos accurately based ONLY on what is visually present in each image.\n" +
        "Do not infer meaning from site context — describe only what you can see.\n" +
        "Output strict JSON exactly as requested. Do not invent values outside the allowed lists.",
    },
  ];

  const expectedIds = images.map((x) => x.aiId);
  const content: any[] = [
    {
      type: "text",
      text:
        "Site context (for caption/alt reference only — do NOT use for tags):\n" +
        context +
        "\n\nDimensions and allowed values:\n" +
        vocabLines +
        "\n\nRules:\n" +
        "- Only include a dimension if the value is DIRECTLY AND CLEARLY VISIBLE in this specific photo.\n" +
        "- Do NOT infer from site context — if you cannot see it in the photo, do not tag it.\n" +
        "- For 'specific': physical/visual details only — materials, textures, construction, decorative motifs. No building types, no site names, no historical terms.\n" +
        "- Use EXACT ids provided. Output JSON ONLY with this schema:\n" +
        `  ${schemaExample}\n` +
        `Expected ids (all must appear once): ${expectedIds.join(", ")}`,
    },
  ];

  for (const img of images) {
    content.push({ type: "text", text: `Image id: ${img.aiId}  filename: ${img.filename}` });
    content.push({ type: "image_url", image_url: { url: img.url } });
  }

  const body: Record<string, any> = {
    model: normalizedId,
    messages: [...system, { role: "user", content }],
    response_format: { type: "json_object" },
  };

  if (cfg.maxOutputTokens != null) {
    if (normalizedId.startsWith("gpt-5")) {
      body.max_completion_tokens = cfg.maxOutputTokens;
    } else {
      body.max_tokens = cfg.maxOutputTokens;
    }
  }

  const supportsTuning = normalizedId.startsWith("gpt-4") || normalizedId === "gpt-5";
  if (supportsTuning) {
    body.temperature = cfg.temperature;
    body.top_p = cfg.topP;
  }

  // Build allowed value sets per dimension for validation
  const allowedMap = new Map<string, Set<string>>();
  for (const d of aiDimensions) {
    if (d.slug !== "specific") {
      allowedMap.set(d.slug, new Set(d.values));
    }
  }

  let attempts = 0;
  const maxAttempts = 6;
  while (true) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.status !== 429) {
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI tag error ${res.status}: ${errText}`);
      }
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content || "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(text); } catch {}

      const out: Record<string, Record<string, string[]>> = {};
      const arr = Array.isArray(parsed?.images) ? parsed.images : [];
      for (const item of arr) {
        if (!item || typeof item.id !== "string") continue;
        const cleanTags: Record<string, string[]> = {};
        if (item.tags && typeof item.tags === "object") {
          for (const [slug, vals] of Object.entries(item.tags)) {
            if (!Array.isArray(vals)) continue;
            if (slug === "specific") {
              // Free text — just trim and limit to 3
              const specific = vals
                .filter((v) => typeof v === "string" && v.trim())
                .map((v) => String(v).trim())
                .slice(0, 3);
              if (specific.length) cleanTags[slug] = specific;
            } else {
              // Validate against allowed values — drop anything not in list
              const allowed = allowedMap.get(slug);
              if (!allowed) continue;
              const valid = vals
                .filter((v) => typeof v === "string" && allowed.has(v))
                .map((v) => String(v));
              if (valid.length) cleanTags[slug] = valid;
            }
          }
        }
        out[item.id] = cleanTags;
      }
      return { tags: out, usage: json?.usage ?? undefined };
    }

    attempts++;
    if (attempts > maxAttempts) throw new Error("OpenAI tag error 429 (max retries)");
    const retryAfter = res.headers.get("retry-after") || res.headers.get("x-ratelimit-reset-requests");
    let waitMs = 2000 * attempts;
    const parsed = Number(retryAfter);
    if (!Number.isNaN(parsed) && parsed > 0) waitMs = Math.max(waitMs, parsed * 1000);
    await sleep(waitMs);
  }
}

/* ------------------ Main Action ------------------ */
export async function generateAltAndCaptionsAction(args: {
  contextArticle: string;
  imagesIn: InputImage[];
  siteId?: string;
  siteName?: string;
}): Promise<{
  items: CaptionAltOut[];
  meta: {
    modelId: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    usdEstimate: number | null;
  };
}> {
  const { contextArticle, imagesIn, siteId, siteName } = args;
  if (!contextArticle?.trim())
    throw new Error("Please paste a short site context article first.");
  if (!imagesIn?.length)
    return {
      items: [],
      meta: {
        modelId: "—",
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        usdEstimate: null,
      },
    };

  const engine = await getCaptionEngineInfo();
  const cfg = {
    modelId: engine.modelId,
    temperature: engine.temperature,
    topP: engine.topP,
    maxOutputTokens: engine.maxOutputTokens,
    maxWords: engine.captionsMaxWords,
  };

  // Use resized image URL for AI
  const aiItems: AiImage[] = imagesIn.map((img, i) => ({
    aiId: `img${i + 1}`,
    realId: img.id,
    filename: img.filename || img.publicUrl.split("/").pop() || "image",
    url: resizedForAI(img.publicUrl),
  }));

  const PRIMARY_BATCH = 8;
  const MICRO_BATCH = 2;
  const SOLO_BATCH = 1;

  const results: CaptionAltOut[] = [];
  let totalIn = 0,
    totalOut = 0,
    total = 0;

  const consume = (
    slice: AiImage[],
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    },
    data?: Record<string, { alt: string; caption: string; sceneDescription?: string }>
  ) => {
    totalIn += usage?.prompt_tokens ?? 0;
    totalOut += usage?.completion_tokens ?? 0;
    total += usage?.total_tokens ?? 0;
    for (const item of slice) {
      const d = data?.[item.aiId];
      results.push({
        id: item.realId,
        alt: d?.alt || "Heritage site photo.",
        caption: d?.caption || "Heritage site image.",
        sceneDescription: d?.sceneDescription,
      });
    }
  };

  async function runBatchWithFallback(batch: AiImage[]) {
    try {
      const { captions, usage } = engine.provider === "anthropic"
        ? await callAnthropicVisionBatch(cfg, batch, contextArticle, siteName)
        : await callOpenAIVisionBatch(cfg, batch, contextArticle, siteName);
      consume(batch, usage, captions);
      return;
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isInvalidUrl =
        /invalid_image_url/i.test(msg) ||
        /Timeout while downloading/i.test(msg) ||
        /timed out/i.test(msg);
      const is429 = e?.status === 429 || /rate[_\s-]*limit/i.test(msg);

      if (is429) {
        if (batch.length > MICRO_BATCH) {
          for (let i = 0; i < batch.length; i += MICRO_BATCH) {
            await runBatchWithFallback(batch.slice(i, i + MICRO_BATCH));
          }
          return;
        }
        if (batch.length > SOLO_BATCH) {
          for (const item of batch) await runBatchWithFallback([item]);
          return;
        }
      }

      if (isInvalidUrl) {
        if (batch.length > MICRO_BATCH) {
          for (let i = 0; i < batch.length; i += MICRO_BATCH) {
            await runBatchWithFallback(batch.slice(i, i + MICRO_BATCH));
          }
          return;
        }
        if (batch.length > SOLO_BATCH) {
          for (const item of batch) await runBatchWithFallback([item]);
          return;
        }
        const item = batch[0];
        results.push({
          id: item.realId,
          alt: "Heritage site photo.",
          caption: "Heritage site image.",
        });
        return;
      }

      throw e;
    }
  }

  for (let i = 0; i < aiItems.length; i += PRIMARY_BATCH) {
    await runBatchWithFallback(aiItems.slice(i, i + PRIMARY_BATCH));
  }

  // Best-effort logging
  try {
    await logAIUsage({
      feature: "captions",
      siteId: siteId ?? null,
      provider: PROVIDER,
      modelId: cfg.modelId,
      inputTokens: totalIn,
      outputTokens: totalOut,
      totalTokens: total,
      usdEstimate: estimateUsd(cfg.modelId, totalIn, totalOut),
      durationMs: null,
      requestId: null,
      metadata: {
        images_count: imagesIn.length,
        site_name: siteName ?? null,
        batched: true,
        batch_size: PRIMARY_BATCH,
      },
    });
  } catch (e) {
    console.error("[captions] logAIUsage failed:", e);
  }

  // Write summary row in ai_caption_history
  try {
    const { error } = await svc()
      .from("ai_caption_history")
      .insert({
        site_id: siteId ?? null,
        site_name: siteName ?? null,
        images_count: imagesIn.length,
        model: cfg.modelId,
        tokens_input: totalIn,
        tokens_output: totalOut,
        total_tokens: total,
        cost_usd: estimateUsd(cfg.modelId, totalIn, totalOut),
      });
    if (error) console.error("[ai_caption_history] insert failed:", error);
  } catch (e) {
    console.error("[ai_caption_history] insert threw:", e);
  }

  return {
    items: results,
    meta: {
      modelId: cfg.modelId,
      usage: {
        prompt_tokens: totalIn,
        completion_tokens: totalOut,
        total_tokens: total,
      },
      usdEstimate: estimateUsd(cfg.modelId, totalIn, totalOut),
    },
  };
}

/* ------------------ Tag Generation Action ------------------ */

export async function generateTagsAction(args: {
  contextArticle: string;
  imagesIn: InputImage[];
  vocabulary: TagDimensionVocab[];
  siteId?: string;
  siteName?: string;
}): Promise<{
  items: TagsOut[];
  meta: {
    modelId: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    usdEstimate: number | null;
  };
}> {
  const { contextArticle, imagesIn, vocabulary, siteId, siteName } = args;

  if (!imagesIn?.length) {
    return {
      items: [],
      meta: { modelId: "—", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, usdEstimate: null },
    };
  }

  const engine = await getCaptionEngineInfo();
  const cfg = {
    modelId: engine.modelId,
    temperature: engine.temperature,
    topP: engine.topP,
    maxOutputTokens: engine.maxOutputTokens,
  };

  const aiItems: AiImage[] = imagesIn.map((img, i) => ({
    aiId: `img${i + 1}`,
    realId: img.id,
    filename: img.filename || img.publicUrl.split("/").pop() || "image",
    url: resizedForAI(img.publicUrl),
  }));

  const PRIMARY_BATCH = 6; // smaller batch for tags — more complex output
  const results: TagsOut[] = [];
  let totalIn = 0, totalOut = 0, total = 0;

  async function runTagBatchWithFallback(batch: AiImage[]) {
    try {
      const { tags, usage } = engine.provider === "anthropic"
        ? await callAnthropicTagBatch(cfg, batch, contextArticle ?? "", vocabulary)
        : await callOpenAITagBatch(cfg, batch, contextArticle ?? "", vocabulary);
      totalIn  += usage?.prompt_tokens    ?? 0;
      totalOut += usage?.completion_tokens ?? 0;
      total    += usage?.total_tokens      ?? 0;
      for (const item of batch) {
        results.push({ imageId: item.realId, tags: tags[item.aiId] ?? {} });
      }
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate[_\s-]*limit/i.test(String(e?.message));
      if (is429 && batch.length > 1) {
        for (const item of batch) await runTagBatchWithFallback([item]);
        return;
      }
      // On error for a single image, push empty tags rather than crashing
      for (const item of batch) {
        results.push({ imageId: item.realId, tags: {} });
      }
    }
  }

  for (let i = 0; i < aiItems.length; i += PRIMARY_BATCH) {
    await runTagBatchWithFallback(aiItems.slice(i, i + PRIMARY_BATCH));
  }

  // Log usage
  try {
    await logAIUsage({
      feature: "photo_tags",
      siteId: siteId ?? null,
      provider: PROVIDER,
      modelId: cfg.modelId,
      inputTokens: totalIn,
      outputTokens: totalOut,
      totalTokens: total,
      usdEstimate: estimateUsd(cfg.modelId, totalIn, totalOut),
      durationMs: null,
      requestId: null,
      metadata: { images_count: imagesIn.length, site_name: siteName ?? null },
    });
  } catch (e) {
    console.error("[photo_tags] logAIUsage failed:", e);
  }

  return {
    items: results,
    meta: {
      modelId: cfg.modelId,
      usage: { prompt_tokens: totalIn, completion_tokens: totalOut, total_tokens: total },
      usdEstimate: estimateUsd(cfg.modelId, totalIn, totalOut),
    },
  };
}
