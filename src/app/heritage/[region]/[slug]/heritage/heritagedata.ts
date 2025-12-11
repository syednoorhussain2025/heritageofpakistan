import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getVariantPublicUrl } from "@/lib/imagevariants";

/* -------------------------------------------------------
   TRAVEL GUIDE SUMMARY
-------------------------------------------------------- */
export type TravelGuideSummary = {
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

/* -------------------------------------------------------
   SITE TYPE
-------------------------------------------------------- */
export type Site = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;

  // Original storage path or URL for the cover
  cover_photo_url?: string | null;

  // Legacy fields; kept for backward compatibility
  cover_photo_hero_url?: string | null;
  cover_photo_thumb_url?: string | null;

  avg_rating?: number | null;
  review_count?: number | null;
  heritage_type?: string | null;
  location_free?: string | null;

  latitude?: string | null;
  longitude?: string | null;

  town_city_village?: string | null;
  tehsil?: string | null;
  district?: string | null;
  province_id?: number | null;

  province_slug?: string | null;
  region_travel_guide_id?: string | null;

  cover_image_id?: string | null;

  architectural_style?: string | null;
  construction_materials?: string | null;
  local_name?: string | null;
  architect?: string | null;
  construction_date?: string | null;
  built_by?: string | null;
  dynasty?: string | null;
  conservation_status?: string | null;
  current_use?: string | null;
  restored_by?: string | null;
  known_for?: string | null;
  era?: string | null;
  inhabited_by?: string | null;

  national_park_established_in?: string | null;
  population?: string | null;
  ethnic_groups?: string | null;
  languages_spoken?: string | null;

  excavation_status?: string | null;
  excavated_by?: string | null;
  administered_by?: string | null;

  unesco_status?: string | null;
  unesco_line?: string | null;
  protected_under?: string | null;

  landform?: string | null;
  altitude?: string | null;
  mountain_range?: string | null;
  weather_type?: string | null;
  avg_temp_summers?: string | null;
  avg_temp_winters?: string | null;

  did_you_know?: string | null;

  travel_location?: string | null;
  travel_how_to_reach?: string | null;
  travel_nearest_major_city?: string | null;
  travel_airport_access?: string | null;
  travel_international_flight?: string | null;
  travel_access_options?: string | null;
  travel_road_type_condition?: string | null;
  travel_best_time_free?: string | null;
  travel_full_guide_url?: string | null;
  best_time_option_key?: string | null;

  history_layout_html?: string | null;
  architecture_layout_html?: string | null;
  climate_layout_html?: string | null;

  custom_sections_json?:
    | {
        id: string;
        title: string;
        layout_html?: string | null;
      }[]
    | null;

  stay_hotels_available?: string | null;
  stay_spending_night_recommended?: string | null;
  stay_camping_possible?: string | null;
  stay_places_to_eat_available?: string | null;

  cover?:
    | {
        // hero variant URL computed from cover_photo_url using imagevariants
        url: string;
        heroUrl?: string | null;
        thumbUrl?: string | null;
        width?: number | null;
        height?: number | null;
        blurhash?: string | null;
        blurDataURL?: string | null;
      }
    | null;
};

export type Taxonomy = { id: string; name: string | null; icon_key: string | null };

/* -------------------------------------------------------
   IMAGE ROW
-------------------------------------------------------- */
export type ImageRow = {
  id: string;
  site_id: string;
  storage_path: string;
  alt_text?: string | null;
  caption?: string | null;
  credit?: string | null;
  is_cover?: boolean | null;
  sort_order: number;

  publicUrl?: string | null;
  heroUrl?: string | null;
  thumbUrl?: string | null;

  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
};

/* -------------------------------------------------------
   BIBLIOGRAPHY
-------------------------------------------------------- */
export type BiblioItem = {
  id: string;
  csl: any;
  note?: string | null;
  sort_order: number;
};

async function loadGlobalCitationStyle(): Promise<string> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "citation")
      .maybeSingle();
    if (data?.value?.style) return data.value.style;
  } catch {}
  return "apa";
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

async function loadBibliographyForPublic(
  siteId: string
): Promise<BiblioItem[]> {
  const { data: links } = await supabase
    .from("listing_bibliography")
    .select(
      `
      biblio_id, sort_order, note,
      bibliography_sources:biblio_id ( id, title, type, authors, year, publisher_or_site, url, notes, csl )
    `
    )
    .eq("listing_id", siteId)
    .order("sort_order", { ascending: true });

  if (Array.isArray(links) && links.length) {
    return links.map((row: any) => {
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
      };
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

/* -------------------------------------------------------
   MAIN HOOK
-------------------------------------------------------- */
export function useHeritageData(slug: string, deepLinkNoteId: string | null) {
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState<Site | null>(null);
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [regions, setRegions] = useState<Taxonomy[]>([]);
  const [gallery, setGallery] = useState<ImageRow[]>([]);
  const [bibliography, setBibliography] = useState<BiblioItem[]>([]);
  const [hasPhotoStory, setHasPhotoStory] = useState(false);
  const [styleId, setStyleId] = useState<string>("apa");
  const [highlight, setHighlight] = useState<{
    quote: string | null;
    section_id: string | null;
  }>({ quote: null, section_id: null });

  const [travelGuideSummary, setTravelGuideSummary] =
    useState<TravelGuideSummary | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setLoading(true);

        /* -------------------------------------------------------
           1) LOAD SITE
        -------------------------------------------------------- */
        const { data: s } = await supabase
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

        if (!s) {
          setSite(null);
          setTravelGuideSummary(null);
          setProvinceName(null);
          return;
        }

        const rawSite: any = s;

        const siteBase: Site = {
          ...(rawSite as any),
          province_slug: rawSite?.province?.slug ?? null,
        };

        setProvinceName(rawSite?.province?.name ?? null);

        /* -------------------------------------------------------
           2) CITATION STYLE
        -------------------------------------------------------- */
        const style = await loadGlobalCitationStyle();
        setStyleId(style);

        /* -------------------------------------------------------
           3) CATEGORIES
        -------------------------------------------------------- */
        const { data: sc } = await supabase
          .from("site_categories")
          .select("categories(id, name, icon_key)")
          .eq("site_id", siteBase.id);
        setCategories(
          (sc || []).map((row: any) => row.categories).filter(Boolean)
        );

        /* -------------------------------------------------------
           4) REGIONS
        -------------------------------------------------------- */
        const { data: sr } = await supabase
          .from("site_regions")
          .select("regions(id, name, icon_key)")
          .eq("site_id", siteBase.id);
        setRegions((sr || []).map((row: any) => row.regions).filter(Boolean));

        /* -------------------------------------------------------
           5) GALLERY
           Use centralized variants instead of manual _hero/_thumb
        -------------------------------------------------------- */
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
          .eq("site_id", siteBase.id)
          .order("sort_order", { ascending: true });

        const galleryWithUrls: ImageRow[] = (imgs || []).map((r: any) => {
          let publicUrl: string | null = null;
          let heroUrl: string | null = null;
          let thumbUrl: string | null = null;

          if (r.storage_path) {
            try {
              // medium for general inline usage
              publicUrl = getVariantPublicUrl(r.storage_path, "md");
            } catch {
              publicUrl = null;
            }
            try {
              heroUrl = getVariantPublicUrl(r.storage_path, "hero");
            } catch {
              heroUrl = publicUrl;
            }
            try {
              thumbUrl = getVariantPublicUrl(r.storage_path, "thumb");
            } catch {
              thumbUrl = publicUrl;
            }
          }

          return {
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
            publicUrl,
            heroUrl,
            thumbUrl,
          };
        });

        setGallery(galleryWithUrls);

        /* -------------------------------------------------------
           6) COVER SELECTION
           Hero and thumb from centralized variants
        -------------------------------------------------------- */
        let cover: Site["cover"] = null;

        if (siteBase.cover_photo_url) {
          let heroUrl: string | null = null;
          let thumbUrl: string | null = null;

          try {
            heroUrl = getVariantPublicUrl(siteBase.cover_photo_url, "hero");
          } catch {
            heroUrl =
              siteBase.cover_photo_hero_url || siteBase.cover_photo_url || null;
          }

          try {
            thumbUrl = getVariantPublicUrl(siteBase.cover_photo_url, "thumb");
          } catch {
            thumbUrl = siteBase.cover_photo_thumb_url ?? null;
          }

          cover = {
            url: heroUrl || siteBase.cover_photo_url || "",
            heroUrl,
            thumbUrl,
            width: null,
            height: null,
            blurhash: null,
            blurDataURL: null,
          };
        }

        setSite({
          ...siteBase,
          cover,
        });

        /* -------------------------------------------------------
           7) BIBLIOGRAPHY
        -------------------------------------------------------- */
        const b = await loadBibliographyForPublic(siteBase.id);
        setBibliography(b);

        /* -------------------------------------------------------
           8) PHOTO STORY
        -------------------------------------------------------- */
        const { data: ps } = await supabase
          .from("photo_stories")
          .select("site_id")
          .eq("site_id", siteBase.id)
          .maybeSingle();
        setHasPhotoStory(!!ps);

        /* -------------------------------------------------------
           9) TRAVEL GUIDE SUMMARY
        -------------------------------------------------------- */
        if (siteBase.region_travel_guide_id) {
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
            .eq("guide_id", siteBase.region_travel_guide_id)
            .eq("region_travel_guides.status", "published")
            .maybeSingle();

          if (tgs) {
            const { region_travel_guides: _unused, ...summary } =
              (tgs as any) || {};
            setTravelGuideSummary(summary as TravelGuideSummary);
          } else {
            setTravelGuideSummary(null);
          }
        } else {
          setTravelGuideSummary(null);
        }

        /* -------------------------------------------------------
           10) DEEP LINKS
        -------------------------------------------------------- */
        if (deepLinkNoteId) {
          const { data: rn } = await supabase
            .from("research_notes")
            .select("id, quote_text, section_id")
            .eq("id", deepLinkNoteId)
            .maybeSingle();

          if (rn?.quote_text) {
            setHighlight({
              quote: rn.quote_text,
              section_id: rn.section_id || null,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, deepLinkNoteId]);

  /* -------------------------------------------------------
     GOOGLE MAPS HANDLING
  -------------------------------------------------------- */
  const maps = useMemo(() => {
    const lat = site?.latitude ? Number(site.latitude) : null;
    const lng = site?.longitude ? Number(site.longitude) : null;
    const embed =
      lat != null && lng != null
        ? `https://www.google.com/maps?q=${lat},${lng}&z=12&output=embed`
        : null;
    const link =
      lat != null && lng != null
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : null;
    return { embed, link };
  }, [site?.latitude, site?.longitude]);

  return {
    loading,
    site,
    provinceName,
    categories,
    regions,
    gallery,
    bibliography,
    styleId,
    hasPhotoStory,
    highlight,
    setHighlight,
    maps,
    travelGuideSummary,
  };
}
