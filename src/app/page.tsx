// src/app/page.tsx

import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { createPublicClient } from "@/lib/supabase/public-server";
import type { HomeInitialData } from "./HomeClient";

/* ------------------------------------------------------------------
   SEO metadata
-------------------------------------------------------------------*/
const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

const pageTitle = "Heritage of Pakistan — Discover, Explore, Preserve";
const description =
  "Heritage of Pakistan is your guide to the country's most remarkable heritage sites — ancient forts, mosques, Buddhist monasteries, archaeological ruins, and natural wonders. Search by region, type and location.";
const canonicalUrl = siteBase;
const ogImage = `${siteBase}/og-default.jpg`;

export const metadata: Metadata = {
  title: pageTitle,
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
  },
  openGraph: {
    title: pageTitle,
    description,
    url: canonicalUrl,
    type: "website",
    siteName: "Heritage of Pakistan",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Heritage of Pakistan — Discover, Explore, Preserve",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description,
    images: [ogImage],
  },
};

/* ------------------------------------------------------------------
   JSON-LD — WebSite + SearchAction (enables Google Sitelinks searchbox)
-------------------------------------------------------------------*/
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Heritage of Pakistan",
  url: canonicalUrl,
  description,
  inLanguage: "en",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteBase}/explore?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
  publisher: {
    "@type": "Organization",
    name: "Heritage of Pakistan",
    url: canonicalUrl,
  },
};

const SITE_SELECT =
  "id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, province_slug, tagline, cover_slideshow_image_ids, latitude, longitude";

/* ------------------------------------------------------------------
   PAGE (Server Component) — fetches all homepage data before render
-------------------------------------------------------------------*/
export default async function HomePage() {
  let initialData: HomeInitialData | null = null;

  try {
    const sb = createPublicClient();

    // Round 1: config + categories + provinces (parallel)
    const [cfgRes, catRes, provRes] = await Promise.all([
      sb.from("global_settings").select("value").eq("key", "mobile_homepage").maybeSingle(),
      sb.from("categories").select("id, name, slug").order("name"),
      sb.from("regions").select("id, name, slug, parent_id").is("parent_id", null).order("name"),
    ]);

    const cfg = (cfgRes.data?.value || {}) as {
      featured?: string[];
      popular?: string[];
      unknown_pakistan?: string[];
      architecture?: string[];
      beyond_tourist_trail?: string[];
      category_pills?: string[];
      province_covers?: Record<string, string>;
    };

    const featuredIds = cfg.featured ?? [];
    const popularIds = cfg.popular ?? [];
    const archIds = (cfg.architecture?.length ?? 0) > 0 ? (cfg.architecture ?? []) : (cfg.unknown_pakistan ?? []);
    const beyondIds = cfg.beyond_tourist_trail ?? [];
    const provRows = (provRes.data ?? []) as { id: string; name: string; slug: string; parent_id: string | null }[];

    // Round 2: all site lists + province counts (parallel)
    const [featRes, popRes, archRes, beyondRes, countRes] = await Promise.all([
      featuredIds.length > 0
        ? sb.from("sites").select(SITE_SELECT).in("id", featuredIds).eq("is_published", true)
        : Promise.resolve({ data: [] as unknown[] }),
      popularIds.length > 0
        ? sb.from("sites").select(SITE_SELECT).in("id", popularIds).eq("is_published", true)
        : Promise.resolve({ data: [] as unknown[] }),
      archIds.length > 0
        ? sb.from("sites").select(SITE_SELECT).in("id", archIds).eq("is_published", true)
        : Promise.resolve({ data: [] as unknown[] }),
      beyondIds.length > 0
        ? sb.from("sites").select(SITE_SELECT).in("id", beyondIds).eq("is_published", true)
        : Promise.resolve({ data: [] as unknown[] }),
      sb.from("sites").select("province_id").eq("is_published", true).not("province_id", "is", null),
    ]);

    function ordered<T extends { id: string }>(ids: string[], rows: T[]): T[] {
      const map = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => map.get(id)).filter(Boolean) as T[];
    }

    const counts: Record<string, number> = {};
    for (const row of (countRes.data ?? []) as { province_id: string }[]) {
      if (row.province_id) counts[row.province_id] = (counts[row.province_id] ?? 0) + 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Row = any;
    initialData = {
      config: {
        featured: featuredIds,
        popular: popularIds,
        unknown_pakistan: cfg.unknown_pakistan ?? [],
        architecture: cfg.architecture ?? [],
        beyond_tourist_trail: beyondIds,
        category_pills: cfg.category_pills ?? [],
        province_covers: cfg.province_covers ?? {},
      },
      featuredSites: ordered(featuredIds, (featRes.data ?? []) as Row[]),
      popularSites: ordered(popularIds, (popRes.data ?? []) as Row[]),
      architectureSites: ordered(archIds, (archRes.data ?? []) as Row[]),
      beyondTrailSites: ordered(beyondIds, (beyondRes.data ?? []) as Row[]),
      categories: (catRes.data ?? []) as { id: string; name: string; slug: string }[],
      provinces: provRows
        .filter((p) => p.parent_id === null)
        .map((p) => ({ id: p.id, name: p.name, slug: p.slug, site_count: counts[p.id] ?? 0 })),
    };
  } catch {
    // Server fetch failed — client will fall back to its own fetches
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient initialData={initialData} />
    </>
  );
}
