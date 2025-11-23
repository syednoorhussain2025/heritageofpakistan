// src/app/heritage/[region]/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
// @ts-ignore 3p library without TS types
import { Cite } from "@citation-js/core";
// @ts-ignore 3p library without TS types
import "@citation-js/plugin-csl";
import HeritageClient from "./HeritageClient";

type Params = { region: string; slug: string };

type HeritagePageProps = {
  // Next passes plain objects here; we await them for convenience
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
}

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

type Taxonomy = { id: string; name: string; icon_key: string | null };

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

type Highlight = { quote: string | null; section_id: string | null };

/* ---------- Helpers (server side) ---------- */

function buildPublicImageUrl(path: string | null) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  const clean = path.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/site-images/${clean}`;
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.com";

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

export default async function Page({ params, searchParams }: HeritagePageProps) {
  const { region, slug } = await params;
  const search = (await searchParams) || {};
  const deepLinkNoteId =
    typeof search.note === "string" && search.note.length > 0
      ? search.note
      : null;

  const supabase = await getSupabaseServerClient();

  /* 1. Site (with province relation and layout fields) */
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

  /* 2. Categories for this site */
  const { data: sc } = await supabase
    .from("site_categories")
    .select("categories(id, name, icon_key)")
    .eq("site_id", site.id);
  const categories: Taxonomy[] = (sc || [])
    .map((row: any) => row.categories)
    .filter(Boolean);

  /* 3. Regions for this site */
  const { data: sr } = await supabase
    .from("site_regions")
    .select("regions(id, name, icon_key)")
    .eq("site_id", site.id);
  const regions: Taxonomy[] = (sr || [])
    .map((row: any) => row.regions)
    .filter(Boolean);

  /* 4. Gallery images */
  const { data: imgs } = await supabase
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
    .order("sort_order", { ascending: true });

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

  /* 5. Cover for main hero (site_covers as source of truth, legacy fallback) */

  let coverForClient: HeroCoverForClient | null = null;

  try {
    const { data: coverRow } = await supabase
      .from("site_covers")
      .select(
        `
          storage_path,
          width,
          height,
          blur_hash,
          blur_data_url,
          caption,
          credit,
          is_active,
          created_at
        `
      )
      .eq("site_id", site.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (coverRow && coverRow.storage_path) {
      const url = buildPublicImageUrl(coverRow.storage_path);
      if (url) {
        coverForClient = {
          url,
          width: coverRow.width ?? null,
          height: coverRow.height ?? null,
          blurhash: coverRow.blur_hash ?? null,
          blurDataURL: coverRow.blur_data_url ?? null,
          caption: coverRow.caption ?? null,
          credit: coverRow.credit ?? null,
        };
      }
    }
  } catch (e) {
    console.error("Failed to load cover from site_covers", e);
  }

  // Legacy fallback if no site_covers row but cover_photo_url exists
  if (!coverForClient && (site as any).cover_photo_url) {
    const url = (site as any).cover_photo_url as string;
    coverForClient = {
      url,
      width: null,
      height: null,
      blurhash: null,
      blurDataURL: null,
      caption: null,
      credit: null,
    };
  }

  const siteDataForClient = {
    ...site,
    province_slug: provinceSlug,
    cover: coverForClient,
  };

  /* 6. Bibliography and citation style */
  const styleId = await loadGlobalCitationStyle(supabase);
  const bibliography = await loadBibliographyForPublic(supabase, site.id);

  // New: preformat bibliography entries on the server
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

  /* 7. Photo story presence */
  const { data: ps } = await supabase
    .from("photo_stories")
    .select("site_id")
    .eq("site_id", site.id)
    .maybeSingle();
  const hasPhotoStory = !!ps;

  /* 8. Linked travel guide summary (published only) */
  let travelGuideSummary: TravelGuideSummary | null = null;
  if (site.region_travel_guide_id) {
    const { data: tgs } = await supabase
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
      .maybeSingle();

    if (tgs) {
      const { region_travel_guides: _joined, ...summary } = (tgs as any) || {};
      travelGuideSummary = summary as TravelGuideSummary;
    }
  }

  /* 9. Deep link highlight for research notes */
  let highlight: Highlight = { quote: null, section_id: null };
  if (deepLinkNoteId) {
    const { data: rn } = await supabase
      .from("research_notes")
      .select("id, quote_text, section_id")
      .eq("id", deepLinkNoteId)
      .maybeSingle();
    if (rn?.quote_text) {
      highlight = {
        quote: rn.quote_text as string,
        section_id: (rn.section_id as string) || null,
      };
    }
  }

  /* 10. Neighbors (alphabetical inside same province) */
  let neighbors: NeighborProps = { prev: null, next: null };

  const { data: list } = await supabase
    .from("sites")
    .select(
      `
        slug,
        title,
        tagline,
        province_id,
        provinces ( slug ),
        site_covers (
          storage_path,
          width,
          height,
          blur_hash,
          blur_data_url
        )
      `
    )
    .eq("province_id", site.province_id)
    .order("title", { ascending: true });

  if (list) {
    const index = list.findIndex((s: any) => s.slug === slug);

    const hydrate = (row: any): NeighborLinkForClient | null =>
      row
        ? {
            slug: row.slug,
            title: row.title,
            tagline: row.tagline ?? null,
            province_slug: row.provinces?.slug ?? null,
            cover: row.site_covers?.[0]
              ? {
                  url: buildPublicImageUrl(
                    row.site_covers[0].storage_path
                  ) as string,
                  width: row.site_covers[0].width,
                  height: row.site_covers[0].height,
                  blurhash: row.site_covers[0].blur_hash,
                  blurDataURL: row.site_covers[0].blur_data_url,
                  caption: null,
                  credit: null,
                }
              : null,
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
        highlight={highlight}
        travelGuideSummary={travelGuideSummary}
      />
    </>
  );
}

/* ---------------- SEO ---------------- */

export async function generateMetadata({
  params,
}: HeritagePageProps): Promise<Metadata> {
  const { region, slug } = await params;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.com";
  const canonical = `${baseUrl}/heritage/${region}/${slug}`;

  const supabase = await getSupabaseServerClient();

  const { data: site } = await supabase
    .from("sites")
    .select(
      `
        id,
        title,
        tagline,
        summary,
        cover_photo_url,
        province:provinces!sites_province_id_fkey ( name, slug )
      `
    )
    .eq("slug", slug)
    .maybeSingle();

  // If site not found or region mismatch, return non-indexable metadata
  if (!site) {
    return {
      title: "Heritage site not found",
      description: "This heritage site could not be found.",
      alternates: { canonical },
      robots: { index: false, follow: false },
    };
  }

  const provinceRel: any = (site as any).province;
  const provinceSlug: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.slug ?? null
    : provinceRel?.slug ?? null;
  const provinceName: string | null = Array.isArray(provinceRel)
    ? provinceRel[0]?.name ?? null
    : provinceRel?.name ?? null;

  if (!provinceSlug || region !== provinceSlug) {
    return {
      title: "Heritage site not found",
      description: "This heritage site could not be found.",
      alternates: { canonical },
      robots: { index: false, follow: false },
    };
  }

  const baseTitle: string = (site as any).title ?? "Heritage site";

  const description: string =
    (site as any).summary ??
    (site as any).tagline ??
    (provinceName
      ? `Learn about ${baseTitle} in ${provinceName}, including history, architecture and travel tips.`
      : `Learn about ${baseTitle} with history, architecture and travel tips.`);

  // Prefer site_covers for OG image, fall back to cover_photo_url
  let coverUrl: string | null = null;

  try {
    const { data: coverRow } = await supabase
      .from("site_covers")
      .select("storage_path, is_active, created_at")
      .eq("site_id", (site as any).id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (coverRow?.storage_path) {
      coverUrl = buildPublicImageUrl(coverRow.storage_path);
    }
  } catch {
    // ignore, metadata should still resolve
  }

  if (!coverUrl && (site as any).cover_photo_url) {
    coverUrl = (site as any).cover_photo_url as string;
  }

  const ogTitle = `${baseTitle} | Heritage of Pakistan`;

  return {
    // This will be wrapped by the layout title template
    title: baseTitle,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      url: canonical,
      title: ogTitle,
      description,
      images: coverUrl
        ? [
            {
              url: coverUrl,
              width: 1200,
              height: 900,
              alt: baseTitle,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: coverUrl ? [coverUrl] : undefined,
    },
  };
}
