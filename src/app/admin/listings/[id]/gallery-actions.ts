// src/app/admin/listings/[id]/gallery-actions.ts
"use server";

/**
 * Server action to generate short, site-aware alt text + captions for a gallery.
 * - Alt text = factual description for accessibility/SEO.
 * - Caption = short, narrative line for gallery storytelling.
 * - Uses Supabase's render endpoint to serve low-res images (HTTPS, fetchable by OpenAI).
 * - Batches images per request with AI-friendly ids (img1, img2, …).
 * - Strict mapping back to real DB ids to avoid misalignment/shuffling.
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

export type CaptionAltOut = { id: string; alt: string; caption: string };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set (caption/alt generation will fail).");
}

/**
 * Turn a Supabase object URL into a render URL with width/quality params.
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
    return u; // fallback
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
): Promise<Record<string, { alt: string; caption: string }>> {
  // System role
  const system = [
    {
      role: "system",
      content:
        "You are assisting a heritage & travel website.\n" +
        "- ALT TEXT: factual, literal description of the image (<= 12 words).\n" +
        "- CAPTION: short narrative (<= 12 words), tied to heritage/travel context.\n" +
        "Do not invent details. Output JSON exactly as requested.",
    },
  ];

  const expectedIds = images.map((x) => x.aiId);

  // Build prompt
  const content: any[] = [];
  content.push({
    type: "text",
    text:
      "Site context:\n" +
      context +
      "\n\nTask:\n" +
      "- For each image, return BOTH alt and caption.\n" +
      "- Alt = factual description for accessibility.\n" +
      "- Caption = short narrative line.\n" +
      "- Each <= 12 words.\n" +
      "- Use EXACT ids I provide (do not rename or reorder).\n" +
      "- Output JSON ONLY with this schema:\n" +
      '  {"images":[{"id":"img1","alt":"...","caption":"..."}, {"id":"img2","alt":"...","caption":"..."}]}\n' +
      `Expected ids (all must be present once each): ${expectedIds.join(", ")}`,
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

  const out: Record<string, { alt: string; caption: string }> = {};
  const arr = Array.isArray(parsed?.images) ? parsed.images : [];
  for (const item of arr) {
    if (!item || typeof item.id !== "string") continue;
    const alt =
      typeof item.alt === "string"
        ? limitWords(item.alt.trim(), 12)
        : "Photo of heritage site.";
    const caption =
      typeof item.caption === "string"
        ? limitWords(item.caption.trim(), 12)
        : "Heritage site photo.";
    out[item.id] = { alt, caption };
  }
  return out;
}

/**
 * Generate alt text + captions for images using a site context article.
 */
export async function generateAltAndCaptionsAction(args: {
  contextArticle: string;
  imagesIn: InputImage[];
}): Promise<CaptionAltOut[]> {
  const { contextArticle, imagesIn } = args;

  if (!contextArticle?.trim())
    throw new Error("Please paste a short site context article first.");
  if (!imagesIn?.length) return [];

  const aiItems: AiImage[] = imagesIn.map((img, i) => ({
    aiId: `img${i + 1}`,
    realId: img.id,
    filename: img.filename || img.publicUrl.split("/").pop() || "image",
    url: supabaseRenderUrl(img.publicUrl, 512, 60),
  }));

  const BATCH = 6;
  const results: CaptionAltOut[] = [];

  for (let i = 0; i < aiItems.length; i += BATCH) {
    const slice = aiItems.slice(i, i + BATCH);

    const aiIdToData = await callOpenAIVisionBatch(slice, contextArticle);

    for (const item of slice) {
      const data = aiIdToData[item.aiId];
      results.push({
        id: item.realId,
        alt: data?.alt || "Heritage site photo.",
        caption: data?.caption || "Heritage site image.",
      });
    }
  }

  return results;
}
