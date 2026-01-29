// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.ts

import React from "react";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type RouteContext = {
  params: Promise<{ region: string; slug: string }>;
};

function toBase64(u8: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    const chunk = u8.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function tryFetchAsDataUrl(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        // helps some CDNs return an image response
        Accept: "image/*",
      },
      // keep it simple, no cache hints here since Vercel edge will cache your whole response anyway
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = await res.arrayBuffer();
    const b64 = toBase64(new Uint8Array(buf));
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const { region, slug } = await ctx.params;

    let title = slug.replace(/-/g, " ");
    let locationFree: string | null = null;
    let tagline: string | null = null;
    let coverPhotoUrl: string | null = null;

    if (supabaseUrl && supabaseAnonKey) {
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
        // fallback
      }
    }

    const readableRegion = region.replace(/-/g, " ");
    const subtitle =
      locationFree != null
        ? `${locationFree} • ${readableRegion}`
        : readableRegion;

    const footerText = "Heritage of Pakistan • Photo gallery";

    // If cover exists, prefetch and embed as data URL so ImageResponse does not need to fetch remotely
    const safeRemoteCoverUrl =
      coverPhotoUrl != null ? encodeURI(coverPhotoUrl) : null;

    const coverDataUrl =
      safeRemoteCoverUrl != null ? await tryFetchAsDataUrl(safeRemoteCoverUrl) : null;

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
              coverDataUrl == null
                ? "linear-gradient(135deg, #111827 0%, #1f2937 40%, #f97316 100%)"
                : "#000000",
          },
        },

        // Background image, embedded
        coverDataUrl
          ? h("img", {
              src: coverDataUrl,
              style: {
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              },
            })
          : null,

        // Overlay
        h("div", {
          style: {
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.9))",
          },
        }),

        // Content
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

          // Title block
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
          "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: any) {
    // If anything fails, do not return a fake 200 png with empty body
    return new Response(
      `OG route error: ${err?.message || "unknown error"}`,
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}
