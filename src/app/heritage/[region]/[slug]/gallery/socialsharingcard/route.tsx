// src/app/heritage/[region]/[slug]/gallery/socialsharingcard/route.tsx

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

const size = {
  width: 1200,
  height: 630,
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

type RouteParams = Promise<{ region: string; slug: string }>;

export async function GET(
  _req: Request,
  { params }: { params: RouteParams }
) {
  const { region, slug } = await params;

  let title = slug.replace(/-/g, " ");
  let locationFree: string | null = null;
  let tagline: string | null = null;
  let coverPhotoUrl: string | null = null;

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
  } catch {
    // fallback
  }

  const readableRegion = region.replace(/-/g, " ");
  const subtitle =
    locationFree != null
      ? `${locationFree} • ${readableRegion}`
      : readableRegion;

  const footerText = "Heritage of Pakistan • Photo gallery";

  const backgroundImageStyle =
    coverPhotoUrl != null
      ? {
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.9)), url(${coverPhotoUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {
          backgroundImage:
            "linear-gradient(135deg, #111827 0%, #1f2937 40%, #f97316 100%)",
        };

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          ...backgroundImageStyle,
          color: "#f9fafb",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 72px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {/* Top label */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              fontSize: 18,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: "#f97316",
              }}
            />
            <span>Photo gallery</span>
          </div>

          {/* Center title */}
          <div style={{ maxWidth: "80%" }}>
            <div
              style={{
                fontSize: 52,
                lineHeight: 1.1,
                fontWeight: 750,
                letterSpacing: "-0.04em",
                textShadow: "0 10px 40px rgba(0,0,0,0.8)",
              }}
            >
              {title}
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: 24,
                opacity: 0.9,
                textShadow: "0 6px 24px rgba(0,0,0,0.8)",
              }}
            >
              {subtitle}
            </div>

            {tagline && (
              <div
                style={{
                  marginTop: 18,
                  fontSize: 20,
                  maxWidth: "90%",
                  color: "#e5e7eb",
                  textShadow: "0 4px 18px rgba(0,0,0,0.75)",
                }}
              >
                {tagline}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 32,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background:
                    "radial-gradient(circle at 30% 30%, #fed7aa, #f97316)",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
                }}
              />
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 650,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Heritage of Pakistan
              </div>
            </div>

            <div
              style={{
                fontSize: 18,
                color: "#e5e7eb",
                opacity: 0.9,
              }}
            >
              {footerText}
            </div>
          </div>
        </div>
      </div>
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
}
