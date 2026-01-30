// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.ts

import React from "react";
import { ImageResponse } from "next/og";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function toThumbVariant(url: string): string {
  return url
    .replace(/(_thumb|_sm|_md|_lg|_hero)(\.(jpe?g|png|webp))$/i, "_thumb$2")
    .replace(/(\.(jpe?g|png|webp))$/i, "_thumb$1");
}

export async function GET(_req: Request, ctx: any) {
  const { region, slug } = ctx.params;

  let title = slug.replace(/-/g, " ");
  let locationFree: string | null = null;
  let tagline: string | null = null;
  let coverPhotoUrl: string | null = null;

  // ✅ EDGE-SAFE: use REST API
  const res = await fetch(
    `${supabaseUrl}/rest/v1/sites?slug=eq.${slug}&select=title,location_free,tagline,cover_photo_url`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    }
  );

  const rows = await res.json();
  const data = rows?.[0];

  if (data?.title) title = data.title;
  locationFree = data?.location_free ?? null;
  tagline = data?.tagline ?? null;
  coverPhotoUrl = data?.cover_photo_url ?? null;

  const subtitle =
    locationFree != null
      ? `${locationFree} • ${region.replace(/-/g, " ")}`
      : region.replace(/-/g, " ");

  const footerText = "Heritage of Pakistan • Photo gallery";

  const thumbUrl =
    coverPhotoUrl != null ? encodeURI(toThumbVariant(coverPhotoUrl)) : null;

  const h = React.createElement;

  return new ImageResponse(
    h(
      "div",
      {
        style: {
          width: size.width,
          height: size.height,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          color: "#f9fafb",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background:
            thumbUrl == null
              ? "linear-gradient(135deg, #111827 0%, #1f2937 40%, #f97316 100%)"
              : undefined,
        },
      },

      thumbUrl
        ? h("img", {
            src: thumbUrl,
            style: {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            },
          })
        : null,

      h("div", {
        style: {
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.9))",
        },
      }),

      h(
        "div",
        {
          style: {
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 72px",
            width: "100%",
          },
        },

        h("div", null, "Photo gallery"),

        h(
          "div",
          null,
          h("div", { style: { fontSize: 52, fontWeight: 700 } }, title),
          h("div", { style: { fontSize: 24, marginTop: 12 } }, subtitle),
          tagline
            ? h("div", { style: { fontSize: 20, marginTop: 16 } }, tagline)
            : null
        ),

        h("div", null, footerText)
      )
    ),
    {
      width: size.width,
      height: size.height,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=604800",
      },
    }
  );
}
