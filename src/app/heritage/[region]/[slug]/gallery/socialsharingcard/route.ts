// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.ts

import React from "react";
import { ImageResponse } from "next/og";

export const runtime = "nodejs"; // important: avoids edge rendering quirks
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function toThumbVariant(url: string): string {
  // If you already store cover_photo_url as a variant, this does no harm.
  // If it is the original, this turns .../abc.jpg into .../abc_thumb.jpg
  // If it already ends with _hero/_lg/_md/_sm/_thumb it normalizes to _thumb.
  return url
    .replace(/(_hero|_lg|_md|_sm|_thumb)(\.(jpe?g|png|webp))$/i, "_thumb$2")
    .replace(/(\.(jpe?g|png|webp))$/i, "_thumb$1");
}

async function readParams(ctx: any): Promise<{ region: string; slug: string }> {
  const raw = ctx?.params;
  if (raw && typeof raw.then === "function") {
    const awaited = await raw;
    return { region: awaited?.region ?? "", slug: awaited?.slug ?? "" };
  }
  return { region: raw?.region ?? "", slug: raw?.slug ?? "" };
}

async function fetchSite(slug: string) {
  // Node-safe plain REST call, no supabase-js
  const url =
    `${supabaseUrl}/rest/v1/sites` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&select=title,location_free,tagline,cover_photo_url`;

  const res = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: "application/json",
    },
    // keep it fresh so you can test repeatedly
    cache: "no-store",
  });

  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  return rows?.[0] ?? null;
}

export async function GET(_req: Request, ctx: any) {
  const h = React.createElement;

  try {
    const { region, slug } = await readParams(ctx);

    // safe defaults so OG always renders
    let title = (slug || "Gallery").replace(/-/g, " ");
    let locationFree: string | null = null;
    let tagline: string | null = null;
    let coverPhotoUrl: string | null = null;

    if (slug) {
      const data = await fetchSite(slug);
      if (data?.title) title = data.title;
      locationFree = data?.location_free ?? null;
      tagline = data?.tagline ?? null;
      coverPhotoUrl = data?.cover_photo_url ?? null;
    }

    const subtitle =
      locationFree != null
        ? `${locationFree} • ${region.replace(/-/g, " ")}`
        : region.replace(/-/g, " ");

    const footerText = "Heritage of Pakistan • Photo gallery";

    // Use your variants (thumb) for reliability and speed
    const thumbUrl =
      coverPhotoUrl != null ? encodeURI(toThumbVariant(coverPhotoUrl)) : null;

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
                : "#111827",
          },
        },

        // Background image via <img> is more reliable than CSS url() in OG renderers
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

        // Overlay for contrast
        h("div", {
          style: {
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.88))",
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
              padding: "52px 72px",
              width: "100%",
              boxSizing: "border-box",
            },
          },

          h(
            "div",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                borderRadius: 999,
                backgroundColor: "rgba(15, 23, 42, 0.70)",
                fontSize: 18,
                letterSpacing: 1,
                textTransform: "uppercase",
              },
            },
            h("div", {
              style: {
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#f97316",
              },
            }),
            h("span", null, "Photo gallery")
          ),

          h(
            "div",
            { style: { maxWidth: "82%" } },
            h(
              "div",
              {
                style: {
                  fontSize: 56,
                  lineHeight: 1.08,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
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
                  opacity: 0.92,
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
                      opacity: 0.9,
                      maxWidth: "92%",
                    },
                  },
                  tagline
                )
              : null
          ),

          h(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 30,
                fontSize: 18,
                opacity: 0.92,
              },
            },
            h(
              "div",
              { style: { fontWeight: 700, letterSpacing: "0.08em" } },
              "HERITAGE OF PAKISTAN"
            ),
            h("div", null, footerText)
          )
        )
      ),
      {
        width: size.width,
        height: size.height,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: any) {
    // If anything fails, you still get a non-empty image that proves the route ran
    const msg = String(err?.message ?? err ?? "unknown error").slice(0, 120);

    return new ImageResponse(
      React.createElement(
        "div",
        {
          style: {
            width: size.width,
            height: size.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
            color: "#f9fafb",
            fontSize: 28,
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            padding: 60,
            boxSizing: "border-box",
            textAlign: "center",
          },
        },
        `OG ERROR: ${msg}`
      ),
      { width: size.width, height: size.height }
    );
  }
}
