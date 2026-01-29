// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.ts

import React from "react";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ← THIS IS THE FIX

const size = { width: 1200, height: 630 };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type RouteContext = {
  params: { region: string; slug: string };
};

export async function GET(_req: Request, ctx: RouteContext) {
  const { region, slug } = ctx.params;

  let title = slug.replace(/-/g, " ");
  let locationFree: string | null = null;
  let tagline: string | null = null;
  let coverPhotoUrl: string | null = null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data } = await supabase
      .from("sites")
      .select("title, location_free, tagline, cover_photo_url")
      .eq("slug", slug)
      .single();

    if (data?.title) title = data.title;
    locationFree = data?.location_free ?? null;
    tagline = data?.tagline ?? null;
    coverPhotoUrl = data?.cover_photo_url ?? null;
  } catch {}

  const readableRegion = region.replace(/-/g, " ");
  const subtitle =
    locationFree != null
      ? `${locationFree} • ${readableRegion}`
      : readableRegion;

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
          color: "white",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
      },

      coverPhotoUrl
        ? h("img", {
            src: coverPhotoUrl,
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
            "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.85))",
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

        h(
          "div",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              backgroundColor: "rgba(15,23,42,0.8)",
              fontSize: 18,
              textTransform: "uppercase",
            },
          },
          "Photo gallery"
        ),

        h(
          "div",
          null,
          h(
            "div",
            { style: { fontSize: 52, fontWeight: 700 } },
            title
          ),
          h(
            "div",
            { style: { marginTop: 16, fontSize: 24, opacity: 0.9 } },
            subtitle
          ),
          tagline
            ? h(
                "div",
                { style: { marginTop: 18, fontSize: 20 } },
                tagline
              )
            : null
        ),

        h(
          "div",
          { style: { fontSize: 20, letterSpacing: "0.08em" } },
          "Heritage of Pakistan"
        )
      )
    ),
    {
      width: size.width,
      height: size.height,
    }
  );
}
