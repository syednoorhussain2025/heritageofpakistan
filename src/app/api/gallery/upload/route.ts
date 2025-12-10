// src/app/api/gallery/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "site-images";

type Variant = "thumb" | "sm" | "md" | "lg" | "hero";

const VARIANT_LONG_EDGES: Record<Variant, number> = {
  thumb: 400,
  sm: 600,
  md: 1000,
  lg: 1300,
  hero: 1600,
};

function makeVariantPath(baseKey: string, variant: Variant): string {
  // Example baseKey: "gallery/123/1700000000000-my-photo.jpg"
  const lastDot = baseKey.lastIndexOf(".");
  if (lastDot === -1) {
    return `${baseKey}_${variant}`;
  }
  const name = baseKey.slice(0, lastDot);
  const ext = baseKey.slice(lastDot); // ".jpg" or ".jpeg" or ".png"
  return `${name}_${variant}${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const siteId = formData.get("siteId") as string | null;
    const key = formData.get("key") as string | null;

    if (!file || !siteId || !key) {
      return NextResponse.json(
        { error: "Missing file, siteId or key" },
        { status: 400 }
      );
    }

    // Read file into a buffer once
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // 1) Upload original Lightroom export unchanged
    {
      const { error: originalError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(key, inputBuffer, {
          upsert: true,
          cacheControl: "31536000",
          contentType: file.type || "image/jpeg",
        });

      if (originalError) {
        console.error("supabase upload error (original)", key, originalError);
        throw new Error(
          `Supabase upload failed for original (${key}): ${originalError.message}`
        );
      }
    }

    // 2) Generate downscaled variants using long-edge resizing
    const variants: Variant[] = ["thumb", "sm", "md", "lg", "hero"];

    for (const variant of variants) {
      const target = VARIANT_LONG_EDGES[variant];

      let output: Buffer;
      try {
        output = await sharp(inputBuffer)
          .rotate()
          .resize({
            width: target,
            height: target,
            fit: "inside", // long edge <= target for both orientations
            withoutEnlargement: true, // do not upscale smaller originals
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (err) {
        console.error("sharp failed for variant", variant, err);
        throw new Error(
          `sharp failed for ${variant}: ${
            (err as any)?.message || String(err)
          }`
        );
      }

      const path = makeVariantPath(key, variant);

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, output, {
          upsert: true,
          cacheControl: "31536000",
          contentType: "image/jpeg",
        });

      if (uploadError) {
        console.error("supabase upload error", variant, path, uploadError);
        throw new Error(
          `Supabase upload failed for ${variant} (${path}): ${uploadError.message}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      siteId,
      key,
    });
  } catch (error: any) {
    console.error("Variant upload failed", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          (typeof error === "string" ? error : "Variant upload failed"),
      },
      { status: 500 }
    );
  }
}
