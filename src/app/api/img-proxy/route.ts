// src/app/api/img-proxy/route.ts
// Resize & compress images from Supabase public URLs to reduce AI costs.
// Usage: /api/img-proxy?url=<PUBLIC_URL>&w=512&q=60
// Requires `sharp` in dependencies.

import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const w = parseInt(searchParams.get("w") || "512", 10);
    const q = parseInt(searchParams.get("q") || "60", 10);

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const upstream = await fetch(url, { cache: "force-cache" });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Fetch failed" }, { status: 400 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());

    const resizedBuffer = await sharp(buf)
      .rotate() // respect EXIF
      .resize({
        width: Math.min(Math.max(w, 128), 1024),
        withoutEnlargement: true,
      })
      .jpeg({ quality: Math.min(Math.max(q, 40), 80), mozjpeg: true })
      .toBuffer();

    // Use Uint8Array to satisfy BodyInit typing
    const body = new Uint8Array(resizedBuffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "proxy error" },
      { status: 500 }
    );
  }
}
