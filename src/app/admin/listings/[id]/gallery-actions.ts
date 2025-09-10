// src/app/admin/listings/[id]/gallery-actions.ts
"use server";

/**
 * Server action to generate short, site-aware captions for a gallery.
 * - Uses Supabase's public render endpoint to serve low-res images (HTTPS, fetchable by OpenAI)
 * - Batches images per request with short, AI-friendly IDs (img1, img2, …)
 * - Strict mapping back to real DB ids to avoid misalignment/shuffling
 */

type InputImage = {
  id: string; // real DB row id
  publicUrl: string; // Supabase public URL
  filename: string;
  alt?: string | null;
};

type AiImage = {
  aiId: string; // img1, img2, …
  realId: string; // DB id
  url: string; // low-res, public HTTPS URL
  filename: string;
};

type CaptionOut = { id: string; caption: string };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set (caption generation will fail).");
}

/**
 * Turn a Supabase "object" public URL into a "render/image" URL with width/quality params.
 * Example:
 *   https://xyz.supabase.co/storage/v1/object/public/site-images/gallery/foo.jpg
 * → https://xyz.supabase.co/storage/v1/render/image/public/site-images/gallery/foo.jpg?width=512&quality=60
 */
function supabaseRenderUrl(u: string, w = 512, q = 60): string {
  try {
    const url = new URL(u);
    url.pathname = url.pathname.replace(
      "/storage/v1/object/",
      "/storage/v1/render/image/"
    );
    url.searchParams.set("width", String(w));
    url.searchParams.set("quality", String(q));
    url.searchParams.set("resize", "contain");
    return url.toString();
  } catch {
    return u; // fallback (still fetchable, just larger)
  }
}

function limitWords(s: string, maxWords = 12): string {
  const words = (s || "").trim().split(/\s+/);
  if (words.length <= maxWords) return s.trim();
  return words.slice(0, maxWords).join(" ");
}

async function callOpenAIVisionBatch(
  images: AiImage[],
  context: string
): Promise<Record<string, string>> {
  // Build strict, ID-locked prompt
  const system = [
    {
      role: "system",
      content:
        "You are a captioning assistant for a heritage & travel website. " +
        "Write a single, concise caption (<= 12 words), in plain English, " +
        "factually tied to the provided context. Do not invent details.",
    },
  ];

  const expectedIds = images.map((x) => x.aiId);

  const content: any[] = [];
  content.push({
    type: "text",
    text:
      "Site context:\n" +
      context +
      "\n\nTask:\n" +
      "- For each image, return ONE short caption (<= 12 words).\n" +
      "- Use the EXACT ids I provide (do not rename or reorder them).\n" +
      "- Output JSON ONLY with this exact schema:\n" +
      '  {"captions":[{"id":"img1","caption":"..."},{"id":"img2","caption":"..."}]}\n' +
      `Expected ids (all must be present, exactly once each): ${expectedIds.join(
        ", "
      )}`,
  });

  for (const img of images) {
    content.push({
      type: "text",
      text: `Image id: ${img.aiId}  filename: ${img.filename}`,
    });
    content.push({ type: "image_url", image_url: { url: img.url } });
  }

  const body = {
    model: "gpt-4o-mini",
    messages: [...system, { role: "user", content }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || "{}";

  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  const out: Record<string, string> = {};
  const arr = Array.isArray(parsed?.captions) ? parsed.captions : [];
  for (const item of arr) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.caption !== "string"
    )
      continue;
    out[item.id] = limitWords(item.caption.trim(), 12);
  }
  return out; // map of aiId -> caption
}

/**
 * Generate short captions for images using a site context article.
 * - Transforms each input into an AI-friendly entry (img1, img2, …)
 * - Calls the model in batches
 * - Maps captions back to real DB ids and guarantees alignment
 */
export async function generateCaptionsAction(args: {
  contextArticle: string;
  imagesIn: InputImage[];
}): Promise<CaptionOut[]> {
  const { contextArticle, imagesIn } = args;

  if (!contextArticle?.trim())
    throw new Error("Please paste a short site context article first.");
  if (!imagesIn?.length) return [];

  // Build AI-friendly batch items
  const aiItems: AiImage[] = imagesIn.map((img, i) => ({
    aiId: `img${i + 1}`,
    realId: img.id,
    filename: img.filename || img.publicUrl.split("/").pop() || "image",
    url: supabaseRenderUrl(img.publicUrl, 512, 60),
  }));

  // Batch for efficiency (6 per request is a good balance)
  const BATCH = 6;
  const results: CaptionOut[] = [];

  for (let i = 0; i < aiItems.length; i += BATCH) {
    const slice = aiItems.slice(i, i + BATCH);

    // Call model
    const aiIdToCaption = await callOpenAIVisionBatch(slice, contextArticle);

    // Map back to real DB ids; ensure every aiId gets a caption
    for (const item of slice) {
      const cap = aiIdToCaption[item.aiId];
      const caption =
        typeof cap === "string" && cap.trim()
          ? limitWords(cap.trim(), 12)
          : "Photo of Chauburji monument."; // simple fallback
      results.push({ id: item.realId, caption });
    }
  }

  return results;
}
