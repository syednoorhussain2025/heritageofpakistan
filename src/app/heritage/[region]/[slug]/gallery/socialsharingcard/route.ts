// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.ts

import React from "react";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const size = { width: 1200, height: 630 };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

export async function GET(_req: Request, ctx: any) {
  const region = normalizeText(ctx?.params?.region);
  const slug = normalizeText(ctx?.params?.slug);

  let title = slug ? slug.replace(/-/g, " ") : "Photo gallery";
  let locationFree: string | null = null;
  let tagline: string | null = null;
  let coverPhotoUrl: string | null = null;

  if (supabaseUrl && supabaseAnonKey && slug) {
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { data } = await supabase
        .from("sites")
        .select("title, location_free, tagline, cover_photo_url")
        .eq("slug", slug)
        .single();

      if (data?.title) title = data.title;
      locationFree = data?.location_free ?? null;
      tagline = data?.tagline ?? null;
      coverPhotoUrl = data?.cover_photo_url ?? null;
    } catch {
      // keep fallbacks
    }
  }

  const readableRegion = region ? region.replace(/-/g, " ") : "";
  const subtitle =
    locationFree != null && readableRegion
      ? `${locationFree} • ${readableRegion}`
      : locationFree != null
      ? locationFree
      : readableRegion || "Heritage of Pakistan";

  const footerText = "Heritage of Pakistan • Photo gallery";

  // Encode spaces and other unsafe chars
  const safeCoverUrl = coverPhotoUrl ? encodeURI(coverPhotoUrl) : null;

  const h = React.createElement;

  const renderCard = (useCover: boolean) => {
    const backgroundStyle = useCover && safeCoverUrl
      ? ({
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.9)), url("${safeCoverUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } as const)
      : ({
          backgroundImage:
            "linear-gradient(135deg, #111827 0%, #1f2937 40%, #f97316 100%)",
        } as const);

    return new ImageResponse(
      h(
        "div",
        {
          style: {
            width: size.width,
            height: size.height,
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            color: "#f9fafb",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            ...backgroundStyle,
          },
        },
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "48px 72px",
              width: "100%",
              boxSizing: "border-box",
            },
          },

          // Top label
          h(
            "div",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(15, 23, 42, 0.75)",
                fontSize: 18,
                letterSpacing: 1,
                textTransform: "uppercase",
              },
            },
            h("div", {
              style: {
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: "#f97316",
              },
            }),
            h("span", null, "Photo gallery")
          ),

          // Center
          h(
            "div",
            { style: { maxWidth: "80%" } },
            h(
              "div",
              {
                style: {
                  fontSize: 52,
                  lineHeight: 1.1,
                  fontWeight: 750,
                  letterSpacing: "-0.04em",
                  textShadow: "0 10px 40px rgba(0,0,0,0.8)",
                },
              },
              title
            ),
            h(
              "div",
              {
                style: {
                  marginTop: 16,
                  fontSize: 24,
                  opacity: 0.9,
                  textShadow: "0 6px 24px rgba(0,0,0,0.8)",
                },
              },
              subtitle
            ),
            tagline
              ? h(
                  "div",
                  {
                    style: {
                      marginTop: 18,
                      fontSize: 20,
                      maxWidth: "90%",
                      color: "#e5e7eb",
                      textShadow: "0 4px 18px rgba(0,0,0,0.75)",
                    },
                  },
                  tagline
                )
              : null
          ),

          // Footer
          h(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 32,
              },
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                },
              },
              h("div", {
                style: {
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background:
                    "radial-gradient(circle at 30% 30%, #fed7aa, #f97316)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
                },
              }),
              h(
                "div",
                {
                  style: {
                    fontSize: 22,
                    fontWeight: 650,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  },
                },
                "Heritage of Pakistan"
              )
            ),
            h(
              "div",
              {
                style: {
                  fontSize: 18,
                  color: "#e5e7eb",
                  opacity: 0.9,
                },
              },
              footerText
            )
          )
        )
      ),
      {
        width: size.width,
        height: size.height,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control":
            "public, s-maxage=604800, stale-while-revalidate=86400",
        },
      }
    );
  };

  // Important: if cover image rendering throws, return the gradient card instead
  try {
    return renderCard(true);
  } catch {
    return renderCard(false);
  }
}
