import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Types kept here to avoid a separate file
export type Site = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  cover_photo_url?: string | null;
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
};

export type Taxonomy = { id: string; name: string; icon_key: string | null };

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
};

export type BiblioItem = {
  id: string;
  csl: any;
  note?: string | null;
  sort_order: number;
};

async function loadGlobalCitationStyle(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "citation")
      .maybeSingle();
    if (!error && data?.value?.style) return data.value.style as string;
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
      .map((s) => s.trim())
      .filter(Boolean)
      .map((full: string) => {
        const [family, given] = full.split(",").map((x) => x.trim());
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
    return (links as any[]).map((row) => {
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

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setLoading(true);

        const { data: s } = await supabase
          .from("sites")
          .select(
            `*, history_layout_html, architecture_layout_html, climate_layout_html, custom_sections_json`
          )
          .eq("slug", slug)
          .single();

        if (!s) {
          setSite(null);
          return;
        }
        const siteData = s as Site;
        setSite(siteData);

        const style = await loadGlobalCitationStyle();
        setStyleId(style);

        if (siteData.province_id) {
          const { data: p } = await supabase
            .from("provinces")
            .select("name")
            .eq("id", siteData.province_id)
            .maybeSingle();
          setProvinceName(p?.name ?? null);
        } else {
          setProvinceName(null);
        }

        const { data: sc } = await supabase
          .from("site_categories")
          .select("categories(id, name, icon_key)")
          .eq("site_id", siteData.id);
        setCategories(
          (sc || []).map((row: any) => row.categories).filter(Boolean)
        );

        const { data: sr } = await supabase
          .from("site_regions")
          .select("regions(id, name, icon_key)")
          .eq("site_id", siteData.id);
        setRegions((sr || []).map((row: any) => row.regions).filter(Boolean));

        const { data: imgs } = await supabase
          .from("site_images")
          .select("*")
          .eq("site_id", siteData.id)
          .order("sort_order", { ascending: true })
          .limit(6);

        const withUrls: ImageRow[] = await Promise.all(
          (imgs || []).map(async (r: any) => ({
            ...r,
            publicUrl: r.storage_path
              ? supabase.storage
                  .from("site-images")
                  .getPublicUrl(r.storage_path).data.publicUrl
              : null,
          }))
        );
        setGallery(withUrls);

        const b = await loadBibliographyForPublic(siteData.id);
        setBibliography(b);

        const { data: ps } = await supabase
          .from("photo_stories")
          .select("site_id")
          .eq("site_id", siteData.id)
          .maybeSingle();
        setHasPhotoStory(!!ps);

        if (deepLinkNoteId) {
          const { data: rn } = await supabase
            .from("research_notes")
            .select("id, quote_text, section_id")
            .eq("id", deepLinkNoteId)
            .maybeSingle();
          if (rn?.quote_text) {
            setHighlight({
              quote: rn.quote_text as string,
              section_id: (rn.section_id as string) || null,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, deepLinkNoteId]);

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
  };
}
