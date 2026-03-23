// src/app/heritage/[region]/[slug]/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
// @ts-ignore 3p library without TS types
import { Cite } from "@citation-js/core";
// @ts-ignore 3p library without TS types
import "@citation-js/plugin-csl";
import HeritageClient from "./HeritageClient";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { createPublicClient } from "@/lib/supabase/public-server";

// **Static revalidation: 3600 seconds (1 hour)**
// Important: must be a literal, not an expression like 60 * 60
export const revalidate = 3600;

type Params = { region: string; slug: string };

/**
 * Pre-build every site page at deploy time so that navigating from the
 * explore page hits a cached HTML response instead of running DB queries
 * on each request.  ISR (revalidate = 3600) regenerates stale pages in
 * the background so content stays fresh without blocking the user.
 */
export async function generateStaticParams(): Promise<Params[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("sites")
    .select("slug, provinces!sites_province_id_fkey ( slug )")
    .not("slug", "is", null)
    .not("province_id", "is", null);

  if (!data) return [];

  return (data as any[]).flatMap(row => {
    const provinceSlug = Array.isArray(row.provinces)
      ? row.provinces[0]?.slug
      : row.provinces?.slug;
    if (!provinceSlug || !row.slug) return [];
    return [{ region: provinceSlug, slug: row.slug }];
  });
}

type HeritagePageProps = {
  params: Promise<Params>;
};

/* ---------- Types for data sent to the client ---------- */

type HeroCoverForClient = {
  url: string;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
  caption?: string | null;
  credit?: string | null;
};

type SlideshowPhotoForClient = {
  url: string;
  thumbUrl?: string | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
  width?: number | null;
  height?: number | null;
};

type TravelGuideSummary = {
  location?: string | null;
  how_to_reach?: string | null;
  nearest_major_city?: string | null;
  airport_access?: boolean | null;
  access_options?:
    | "by_road_only"
    | "by_trek_only"
    | "by_jeep_and_trek_only"
    | "by_road_and_railway"
    | "by_road_and_airport"
    | "by_road_railway_airport"
    | null;
  road_type_condition?: string | null;
  best_time_to_visit?:
    | "year_long"
    | "winters"
    | "summers"
    | "spring"
    | "spring_and_summers"
    | "winter_and_spring"
    | null;
  hotels_available?: "yes" | "no" | "limited_options" | null;
  spending_night_recommended?:
    | "yes"
    | "not_recommended"
    | "not_suitable"
    | null;
  camping?: "possible" | "not_suitable" | "with_caution" | null;
  places_to_eat?: "yes" | "no" | "limited_options" | null;
  altitude?: string | null;
  landform?:
    | "mountains"
    | "plains"
    | "river"
    | "plateau"
    | "mountain_peak"
    | "valley"
    | "desert"
    | "coastal"
    | "wetlands"
    | "forest"
    | "canyon_gorge"
    | "glacier"
    | "lake_basin"
    | "steppe"
    | null;
  mountain_range?: string | null;
  climate_type?: string | null;
  temp_winter?: string | null;
  temp_summers?: string | null;
};

type Taxonomy = {
  id: string;
  name: string;
  icon_key: string | null;
  icon_svg?: string | null;
};

type ImageRow = {
  id: string;
  site_id: string;
  storage_path: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  is_cover?: boolean | null;
  sort_order: number;
  publicUrl?: string | null;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
};

type BiblioItem = {
  id: string;
  csl: any;
  note?: string | null;
  sort_order: number;
};

type NeighborLinkForClient = {
  slug: string;
  province_slug: string | null;
  title: string;
  tagline: string | null;
  cover: HeroCoverForClient | null;
};

type NeighborProps = {
  prev: NeighborLinkForClient | null;
  next: NeighborLinkForClient | null;
};

/* ---------- Helpers (server side) ---------- */

function buildPublicImageUrl(path: string | null) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/site-images/${clean}`;
}

/**
 * Helper to derive the hero image URL from a cover value.
 *
 * If the value looks like a storage path (no http/https), use the hero variant.
 * If it looks like a full URL (legacy data), return it as is.
 */
function getCoverVariantUrl(
  cover: string | null | undefined
): string | null {
  if (!cover) return null;
  const trimmed = cover.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    // Legacy full URL, cannot apply variants safely
    return trimmed;
  }
  try {
    return getVariantPublicUrl(trimmed, "hero");
  } catch {
    return buildPublicImageUrl(trimmed);
  }
}

function buildFallbackCSL(src: any): any {
  const out: any = {
    id: src?.id,
    type: src?.type || "book",
    title: src?.title || "",
  };
  if (src?.authors) {
    out.author = String(src.authors)
      .split(";")
      .map(s => s.trim())
      .filter(Boolean)
      .map((full: string) => {
        const [family, given] = full.split(",").map(x => x.trim());
        return family || given
          ? { family: family || undefined, given }
          : { literal: full };
      });
  }
  if (src?.publisher_or_site) out.publisher = src.publisher_or_site;
  if (src?.url) out.URL = src.url;
  if (src?.year)
    out.issued = {
      "date-parts": [[Number(src.year) || new Date().getFullYear()]],
    };
  return out;
}

async function loadGlobalCitationStyle(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "citation")
      .maybeSingle();
    if (!error && data?.value?.style) {
      return data.value.style as string;
    }
  } catch {}
  return "apa";
}

async function loadBibliographyForPublic(
  supabase: any,
  siteId: string
): Promise<BiblioItem[]> {
  const { data: links, error: e1 } = await supabase
    .from("listing_bibliography")
    .select(
      `
      biblio_id, sort_order, note,
      bibliography_sources:biblio_id ( id, title, type, authors, year, publisher_or_site, url, notes, csl )
    `
    )
    .eq("listing_id", siteId)
    .order("sort_order", { ascending: true });

  if (!e1 && Array.isArray(links) && links.length) {
    return (links as any[]).map(row => {
      const src = row.bibliography_sources || {};
      const csl =
        src?.csl && typeof src.csl === "object"
          ? src.csl
          : buildFallbackCSL(src);
      return {
        id: src.id,
        csl,
        note: row?.note ?? src?.notes ?? null,
        sort_order: row?.sort_order ?? 0,
      } as BiblioItem;
    });
  }

  const { data: legacy } = await supabase
    .from("bibliography_sources")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });

  return (legacy || []).map((src: any, i: number) => ({
    id: src.id,
    csl:
      src?.csl && typeof src.csl === "object" ? src.csl : buildFallbackCSL(src),
    note: src?.notes ?? null,
    sort_order: src?.sort_order ?? i,
  }));
}

/* ---------- JSON-LD helpers ---------- */

function cleanJsonLd(value: any): any {
  if (Array.isArray(value)) {
    const arr = value
      .map(cleanJsonLd)
      .filter(
        v =>
          v !== undefined &&
          v !== null &&
          (!(typeof v === "object") || Object.keys(v).length > 0)
      );
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out: any = {};
    Object.entries(value).forEach(([key, val]) => {
      const cleaned = cleanJsonLd(val);
      if (
        cleaned !== undefined &&
        cleaned !== null &&
        (!(typeof cleaned === "object") || Object.keys(cleaned).length > 0)
      ) {
        out[key] = cleaned;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function buildJsonLdForSite(args: {
  site: any;
  provinceName: string | null;
  region: string;
  slug: string;
  cover: HeroCoverForClient | null;
  gallery: ImageRow[];
  categories: Taxonomy[];
}) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

  const pageUrl = `${baseUrl}/heritage/${args.region}/${args.slug}`;

  const images: string[] = [];
  if (args.cover?.url) {
    images.push(args.cover.url);
  }
  for (const img of args.gallery) {
    if (img.publicUrl && !images.includes(img.publicUrl)) {
      images.push(img.publicUrl);
    }
    if (images.length >= 5) break;
  }

  const tourismCategories = args.categories
    .map(c => c?.name)
    .filter(Boolean) as string[];

  const jsonLd: any = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    "@id": pageUrl,
    url: pageUrl,
    name: args.site.title || undefined,
    description: args.site.summary || args.site.tagline || undefined,
    image: images.length ? images : undefined,
    geo:
      args.site.latitude && args.site.longitude
        ? {
            "@type": "GeoCoordinates",
            latitude: args.site.latitude,
            longitude: args.site.longitude,
          }
        : undefined,
    address:
      args.provinceName || args.site.location_free
        ? {
            "@type": "PostalAddress",
            addressRegion: args.provinceName || undefined,
            addressLocality: args.site.location_free || undefined,
            addressCountry: "Pakistan",
          }
        : undefined,
    touristType: tourismCategories.length ? tourismCategories : undefined,
  };

  return cleanJsonLd(jsonLd);
}

/* ---------- Page component ---------- */

export default async function Page({ params }: HeritagePageProps) {
  const { region, slug } = await params;

  const supabase = createPublicClient();

  /* 1. Site — must resolve first; every other query depends on site.id / province */
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select(
      `
        *,
        history_layout_html,
        architecture_layout_html,
        climate_layout_html,
        custom_sections_json,
        province:provinces!sites_province_id_fkey ( name, slug )
      `
    )
    .eq("slug", slug)
    .maybeSingle();

  if (siteErr || !site) return notFound();

  const provinceRel: any = (site as any).province;
  const provinceSlug: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.slug ?? null
    : provinceRel?.slug ?? null;
  const provinceName: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.name ?? null
    : provinceRel?.name ?? null;

  if (!provinceSlug || region !== provinceSlug) return notFound();

  /* 2. All remaining queries fired in parallel — no sequential round-trips */
  const [
    { data: sc },
    { data: sr },
    { data: imgs },
    styleId,
    bibliography,
    { data: ps },
    { data: travelGuideRaw },
    { data: list },
  ] = await Promise.all([
    /* 2a. Categories */
    supabase
      .from("site_categories")
      .select("categories(id, name, icon_key)")
      .eq("site_id", site.id),

    /* 2b. Regions */
    supabase
      .from("site_regions")
      .select("regions(id, name, icon_key)")
      .eq("site_id", site.id),

    /* 2c. Gallery images */
    supabase
      .from("site_images")
      .select(
        `
          id,
          site_id,
          storage_path,
          alt_text,
          caption,
          credit,
          is_cover,
          sort_order,
          width,
          height,
          blur_hash,
          blur_data_url
        `
      )
      .eq("site_id", site.id)
      .order("sort_order", { ascending: true }),

    /* 2d. Global citation style */
    loadGlobalCitationStyle(supabase),

    /* 2e. Bibliography */
    loadBibliographyForPublic(supabase, site.id),

    /* 2f. Photo story presence */
    supabase
      .from("photo_stories")
      .select("site_id")
      .eq("site_id", site.id)
      .maybeSingle(),

    /* 2g. Travel guide summary (skipped when no guide is linked) */
    site.region_travel_guide_id
      ? supabase
          .from("region_travel_guide_summary")
          .select(
            `
              location, how_to_reach, nearest_major_city,
              airport_access, access_options,
              road_type_condition, best_time_to_visit,
              hotels_available, spending_night_recommended, camping, places_to_eat,
              altitude, landform, mountain_range, climate_type, temp_winter, temp_summers,
              region_travel_guides!inner ( status )
            `
          )
          .eq("guide_id", site.region_travel_guide_id)
          .eq("region_travel_guides.status", "published")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    /* 2h. All sites in same province — used for prev/next neighbors */
    supabase
      .from("sites")
      .select(
        `
          slug,
          title,
          tagline,
          province_id,
          cover_photo_url,
          provinces ( slug )
        `
      )
      .eq("province_id", site.province_id)
      .order("title", { ascending: true }),

  ]);

  /* 3. Category icon SVGs — one extra round-trip, only if icons are needed */
  const categoriesBase: Taxonomy[] = (sc || [])
    .map((row: any) => row.categories)
    .filter(Boolean);

  const categoryIconKeys = Array.from(
    new Set(
      categoriesBase
        .map(c => (typeof c.icon_key === "string" ? c.icon_key.trim() : ""))
        .filter(Boolean)
    )
  );

  let categories: Taxonomy[] = categoriesBase;
  if (categoryIconKeys.length > 0) {
    const supabasePublic = createPublicClient();
    const { data: iconRows } = await supabasePublic
      .from("icons")
      .select("name, svg_content")
      .in("name", categoryIconKeys);

    const iconSvgByName = new Map<string, string>();
    for (const row of iconRows || []) {
      if (row?.name && typeof row.svg_content === "string") {
        iconSvgByName.set(String(row.name), row.svg_content);
      }
    }

    categories = categoriesBase.map(c => {
      const key =
        typeof c.icon_key === "string" ? c.icon_key.trim() : c.icon_key;
      if (!key) return { ...c, icon_key: null, icon_svg: null };

      const svg =
        iconSvgByName.get(key) ||
        iconSvgByName.get(key.replace(/_/g, "-")) ||
        iconSvgByName.get(key.replace(/-/g, "_")) ||
        null;

      return { ...c, icon_key: key, icon_svg: svg };
    });
  }

  /* Regions */
  const regions: Taxonomy[] = (sr || [])
    .map((row: any) => row.regions)
    .filter(Boolean);

  /* Gallery */
  const gallery: ImageRow[] = (imgs || []).map((r: any) => ({
    id: r.id,
    site_id: r.site_id,
    storage_path: r.storage_path,
    alt_text: r.alt_text,
    caption: r.caption,
    credit: r.credit,
    is_cover: r.is_cover,
    sort_order: r.sort_order ?? 0,
    width: r.width,
    height: r.height,
    blurhash: r.blur_hash ?? null,
    blurDataURL: r.blur_data_url ?? null,
    publicUrl: buildPublicImageUrl(r.storage_path),
  }));

  /* Cover */
  let coverForClient: HeroCoverForClient | null = null;

  const coverUrl = getCoverVariantUrl((site as any).cover_photo_url || null);
  if (coverUrl) {
    coverForClient = {
      url: coverUrl,
      width: null,
      height: null,
      blurhash: null,
      blurDataURL: null,
      caption: null,
      credit: null,
    };
  }

  /* Slideshow photos */
  const slideshowIds: string[] = (site as any).cover_slideshow_image_ids ?? [];
  let slideshowPhotos: SlideshowPhotoForClient[] = [];

  if (slideshowIds.length > 0) {
    const { data: ssImgs } = await supabase
      .from("site_images")
      .select("id, storage_path, width, height, blur_hash, blur_data_url")
      .eq("site_id", site.id)
      .in("id", slideshowIds);

    if (ssImgs && ssImgs.length > 0) {
      // Preserve the admin-defined order
      const byId = new Map(ssImgs.map((r: any) => [r.id, r]));
      slideshowPhotos = slideshowIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r: any) => {
          const storagePath = (r.storage_path ?? "").trim();
          let url: string | null = null;
          if (/^https?:\/\//i.test(storagePath)) {
            url = storagePath || null;
          } else {
            try { url = getVariantPublicUrl(storagePath, "lg"); } catch { /* noop */ }
            if (!url) url = getCoverVariantUrl(r.storage_path);
          }
          if (!url) return null;
          let thumbUrl: string | null = null;
          if (!/^https?:\/\//i.test(storagePath)) {
            try { thumbUrl = getVariantPublicUrl(storagePath, "md"); } catch { /* noop */ }
          }
          return {
            url,
            thumbUrl,
            width: r.width ?? null,
            height: r.height ?? null,
            blurhash: r.blur_hash ?? null,
            blurDataURL: r.blur_data_url ?? null,
          } as SlideshowPhotoForClient;
        })
        .filter((x): x is SlideshowPhotoForClient => x !== null);
    }
  }

  const siteDataForClient = {
    ...site,
    province_slug: provinceSlug,
    cover: coverForClient,
    slideshowPhotos,
  };

  /* Format bibliography — CPU only, data already fetched in phase 2 */
  let bibliographyEntries: string[] = [];
  if (bibliography.length) {
    try {
      const cite = new Cite(bibliography.map(b => b.csl));
      const html = cite.format("bibliography", {
        format: "html",
        template: styleId,
        lang: "en-US",
      }) as string;

      let formatted = html
        .split(/<\/div>\s*/i)
        .map(chunk => chunk.trim())
        .filter(Boolean)
        .map(chunk =>
          chunk.replace(
            /^.*?<div[^>]*class="csl-entry"[^>]*>/i,
            ""
          )
        );

      if (formatted.length > bibliography.length) {
        formatted = formatted.slice(0, bibliography.length);
      }
      if (formatted.length < bibliography.length) {
        formatted = formatted.concat(
          Array(bibliography.length - formatted.length).fill("")
        );
      }

      bibliographyEntries = formatted;
    } catch (e) {
      console.error("Failed to format bibliography", e);
      bibliographyEntries = Array(bibliography.length).fill("");
    }
  }

  /* Photo story */
  const hasPhotoStory = !!ps;

  /* Travel guide summary */
  let travelGuideSummary: TravelGuideSummary | null = null;
  if (travelGuideRaw) {
    const { region_travel_guides: _joined, ...summary } =
      (travelGuideRaw as any) || {};
    travelGuideSummary = summary as TravelGuideSummary;
  }

  /* Neighbors (alphabetical within same province) */
  let neighbors: NeighborProps = { prev: null, next: null };

  if (list) {
    const index = list.findIndex((s: any) => s.slug === slug);

    const hydrate = (row: any): NeighborLinkForClient | null =>
      row
        ? {
            slug: row.slug,
            title: row.title,
            tagline: row.tagline ?? null,
            province_slug: row.provinces?.slug ?? null,
            cover: (() => {
              const url = getCoverVariantUrl(row.cover_photo_url || null);
              return url
                ? {
                    url,
                    width: null,
                    height: null,
                    blurhash: null,
                    blurDataURL: null,
                    caption: null,
                    credit: null,
                  }
                : null;
            })(),
          }
        : null;

    neighbors = {
      prev: hydrate(list[index - 1] ?? null),
      next: hydrate(list[index + 1] ?? null),
    };
  }

  /* 11. Build JSON-LD for this site */
  const jsonLd = buildJsonLdForSite({
    site,
    provinceName,
    region,
    slug,
    cover: coverForClient,
    gallery,
    categories,
  });

  /* 12. Render */
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Suspense>
        <HeritageClient
          site={siteDataForClient}
          neighbors={neighbors}
          provinceName={provinceName}
          categories={categories}
          regions={regions}
          gallery={gallery}
          bibliography={bibliography}
          bibliographyEntries={bibliographyEntries}
          styleId={styleId}
          hasPhotoStory={hasPhotoStory}
          travelGuideSummary={travelGuideSummary}
        />
      </Suspense>
    </>
  );
}

/* ---------------- SEO ---------------- */

export async function generateMetadata({
  params,
}: HeritagePageProps): Promise<Metadata> {
  const { region, slug } = await params;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";
  const canonical = `${baseUrl}/heritage/${region}/${slug}`;

  // Fallback title from slug if DB lookup fails
  const slugTitle = slug
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  let title = slugTitle;
  let description: string | undefined;
  let coverUrl: string | null = null;

  try {
    const supabase = createPublicClient();

    const { data: site } = await supabase
      .from("sites")
      .select(
        `
        id,
        title,
        tagline,
        summary,
        cover_photo_url,
        province:provinces!sites_province_id_fkey ( name )
      `
      )
      .eq("slug", slug)
      .maybeSingle();

    if (site) {
      title = site.title ?? slugTitle;

      const provinceRel: any = (site as any).province;
      const provinceName: string | null = Array.isArray(provinceRel)
        ? provinceRel[0]?.name ?? null
        : provinceRel?.name ?? null;

      description =
        site.summary ??
        site.tagline ??
        (provinceName
          ? `Learn about ${title} in ${provinceName} including history, architecture and travel tips.`
          : `Learn about ${title} with history, architecture and travel tips.`);

      coverUrl = getCoverVariantUrl((site as any).cover_photo_url || null);
    }
  } catch {
    // On any error we fall back to slug based metadata
  }

  const finalDescription =
    description ??
    `Discover heritage site ${title} on Heritage of Pakistan with history, architecture and travel insights.`;

  const ogTitle = `${title} | Heritage of Pakistan`;

  return {
    title, // layout template will wrap this
    description: finalDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      url: canonical,
      title: ogTitle,
      description: finalDescription,
      images: coverUrl
        ? [
            {
              url: coverUrl,
              width: 1200,
              height: 900,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: finalDescription,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}
