// src/app/admin/listings/[id]/gallery-actions.ts
"use server";

import { createClient } from "@supabase/supabase-js";
import { logAIUsage } from "@/server/ai/usage";

export type InputImage = {
  id: string;
  publicUrl: string;
  filename: string;
  alt?: string | null;
};

type AiImage = { aiId: string; realId: string; url: string; filename: string };
export type CaptionAltOut = { id: string; alt: string; caption: string };

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

/** Create a resized image URL for AI (max 500px long edge) */
function resizedForAI(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("transform", "width=500,quality=70");
    return u.toString();
  } catch {
    return url; // fallback
  }
}

/** Public server action the UI can call to know what model Captions will use. */
export async function getCaptionEngineInfo(): Promise<{
  modelId: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number | null;
  captionsMaxWords: number;
}> {
  type Row = {
    scope?: string | null;
    data?: {
      modelId?: string | null;
      temperature?: number | null;
      topP?: number | null;
      maxOutputTokens?: number | null;
      captions?: { modelId?: string | null; maxWords?: number | null } | null;
    } | null;
  };

  const FALLBACK = {
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

    return {
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
  context: string
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
        "Do not invent details. Output JSON exactly as requested.",
    },
  ];
  const expectedIds = images.map((x) => x.aiId);
  const content: any[] = [
    {
      type: "text",
      text:
        "Site context:\n" +
        context +
        "\n\nTask:\n" +
        "- For each image, return BOTH alt and caption.\n" +
        "- Alt = factual description for accessibility.\n" +
        "- Caption = short narrative line.\n" +
        `- Each <= ${cfg.maxWords} words.\n` +
        "- Use EXACT ids I provide (do not rename or reorder).\n" +
        "- Output JSON ONLY with this schema:\n" +
        '  {"images":[{"id":"img1","alt":"...","caption":"..."}, {"id":"img2","alt":"...","caption":"..."}]}\n' +
        `Expected ids (all must be present once each): ${expectedIds.join(
          ", "
        )}`,
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
      const out: Record<string, { alt: string; caption: string }> = {};
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
        out[item.id] = { alt, caption };
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
    data?: Record<string, { alt: string; caption: string }>
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
      });
    }
  };

  async function runBatchWithFallback(batch: AiImage[]) {
    try {
      const { captions, usage } = await callOpenAIVisionBatch(
        cfg,
        batch,
        contextArticle
      );
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
