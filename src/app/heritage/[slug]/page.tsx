// src/app/heritage/[slug]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import DOMPurify from "isomorphic-dompurify";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import StickyHeader from "@/components/StickyHeader";
import CollectHeart from "@/components/CollectHeart";
import { saveResearchNote } from "@/lib/notebook";

// NEW: CSL renderer imports
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";

/* ───────────── UI helpers ───────────── */

function IconChip({
  iconName,
  label,
  id,
  type,
}: {
  iconName: string | null;
  label: string;
  id: string;
  type: "category" | "region";
}) {
  const href =
    type === "category" ? `/explore?cats=${id}` : `/explore?regs=${id}`;

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center flex-shrink-0">
        {iconName && <Icon name={iconName} size={16} className="text-white" />}
      </div>
      <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
        {label}
      </span>
    </Link>
  );
}

function Section({
  title,
  iconName,
  children,
  id,
}: {
  title: string;
  iconName?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2
        id={id}
        className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[17px] md:text-[18px] font-semibold"
        style={{
          color: "var(--brand-blue, #1f6be0)",
          fontFamily: "var(--font-article-heading, inherit)",
        }}
      >
        {iconName && (
          <Icon
            name={iconName}
            size={18}
            className="text-[var(--brand-orange)]"
          />
        )}
        <span>{title}</span>
      </h2>
      {children}
    </section>
  );
}

function KeyVal({ k, v }: { k: string; v?: string | number | null }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-black/5 last:border-b-0">
      <div className="text-[13px] font-semibold text-slate-900">{k}</div>
      <div className="text-[13px] text-slate-700 text-right">{String(v)}</div>
    </div>
  );
}

/* ───────────── Skeletons ───────────── */

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}
function SkeletonCircle({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-full bg-gray-200 ${className}`} />
  );
}
function HeroSkeleton() {
  return (
    <div className="relative w-full h-screen">
      <div className="w-full h-full bg-gray-200 animate-pulse" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
      <div className="absolute inset-0 flex items=end">
        <div className="w-full pb-6 grid grid-cols-1 md:grid-cols-2 gap-6 px-[54px] md:px-[82px] lg:px-[109px] max-w-screen-2xl mx-auto">
          <div className="text-white">
            <SkeletonBar className="h-10 w-72 mb-3" />
            <SkeletonBar className="h-4 w-96 mb-2" />
            <SkeletonBar className="h-4 w-64" />
            <div className="mt-4 flex items-center gap-3">
              <SkeletonBar className="h-4 w-20" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <SkeletonBar className="h-7 w-44 rounded-full" />
            <SkeletonBar className="h-7 w-64 rounded-full" />
            <SkeletonBar className="h-9 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
function SidebarCardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <SkeletonBar className="h-5 w-48 mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className="h-4 w-full mb-2" />
      ))}
    </div>
  );
}
function GallerySkeleton({ count = 6 }: { count?: number }) {
  return (
    <Section id="gallery" title="Photo Gallery" iconName="gallery">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden">
            <SkeletonBar className="h-40 w-full" />
            <SkeletonBar className="h-5 w-32 mt-2 ml-2 mb-2" />
          </div>
        ))}
      </div>
      <SkeletonBar className="h-9 w-48 rounded-lg mt-3" />
    </Section>
  );
}
function BibliographySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Section
      id="bibliography"
      title="Bibliography & Sources"
      iconName="bibliography-sources"
    >
      <ol className="list-decimal list-inside space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i}>
            <SkeletonBar className="h-4 w-3/4" />
          </li>
        ))}
      </ol>
    </Section>
  );
}
function ReviewsSkeleton() {
  return (
    <Section id="reviews" title="Traveler Reviews" iconName="star">
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <SkeletonCircle className="w-9 h-9" />
              <SkeletonBar className="h-4 w-40" />
            </div>
            <SkeletonBar className="h-4 w-full mb-2" />
            <SkeletonBar className="h-4 w-5/6 mb-2" />
            <SkeletonBar className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ───────────── Types ───────────── */

type Site = {
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
};

type PublicBiblioItem = {
  id: string;
  csl: any;
  note?: string | null;
  sort_order: number;
};

/* ───────────── CSL helpers ───────────── */

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

function batchFormatCSL(items: any[], styleId: string): string[] {
  if (!items.length) return [];
  const cite = new Cite(items);
  const html = cite.format("bibliography", {
    format: "html",
    template: styleId,
    lang: "en-US",
  });
  const container =
    typeof document !== "undefined" ? document.createElement("div") : null;
  if (!container) return [];
  container.innerHTML = html;
  const entries = Array.from(container.querySelectorAll(".csl-entry"));
  return entries.map((el) => el.innerHTML || "");
}

/* ───────────── Data loaders ───────────── */

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

async function loadBibliographyForPublic(
  siteId: string
): Promise<PublicBiblioItem[]> {
  const { data: links, error: e1 } = await supabase
    .from("listing_bibliography")
    .select(
      `
      biblio_id,
      sort_order,
      note,
      bibliography_sources:biblio_id (
        id, title, type, authors, year, publisher_or_site, url, notes, csl
      )
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
      } as PublicBiblioItem;
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

/* ───────────── Page ───────────── */

export default function HeritagePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = (params.slug as string) ?? "";
  const deepLinkNoteId = searchParams?.get("note") || null;

  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();

  const [site, setSite] = useState<Site | null>(null);
  const [provinceName, setProvinceName] = useState<string | null>(null);
  const [categories, setCategories] = useState<Taxonomy[]>([]);
  const [regions, setRegions] = useState<Taxonomy[]>([]);
  const [gallery, setGallery] = useState<ImageRow[]>([]);
  const [biblio, setBiblio] = useState<PublicBiblioItem[]>([]);
  const [hasPhotoStory, setHasPhotoStory] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [styleId, setStyleId] = useState<string>("apa");
  const [researchEnabled, setResearchEnabled] = useState<boolean>(false);

  const [highlight, setHighlight] = useState<{
    quote: string | null;
    section_id: string | null;
  }>({ quote: null, section_id: null });

  const contentRef = useRef<HTMLElement>(null);

  // Parallax (image-only)
  const heroRef = useRef<HTMLDivElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("researchMode");
      if (raw != null) setResearchEnabled(raw === "1" || raw === "true");
    } catch {}
  }, []);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setLoading(true);

        const { data: s } = await supabase
          .from("sites")
          .select(
            `*,
              history_layout_html,
              architecture_layout_html,
              climate_layout_html,
              custom_sections_json`
          )
          .eq("slug", slug)
          .single();

        if (!s) {
          setSite(null);
          return;
        }
        setSite(s as Site);

        const style = await loadGlobalCitationStyle();
        setStyleId(style);

        if (s.province_id) {
          const { data: p } = await supabase
            .from("provinces")
            .select("name")
            .eq("id", s.province_id)
            .maybeSingle();
          setProvinceName(p?.name ?? null);
        } else setProvinceName(null);

        const { data: sc } = await supabase
          .from("site_categories")
          .select("categories(id, name, icon_key)")
          .eq("site_id", s.id);
        setCategories(
          (sc || []).map((row: any) => row.categories).filter(Boolean)
        );

        const { data: sr } = await supabase
          .from("site_regions")
          .select("regions(id, name, icon_key)")
          .eq("site_id", s.id);
        setRegions((sr || []).map((row: any) => row.regions).filter(Boolean));

        const { data: imgs } = await supabase
          .from("site_images")
          .select("*")
          .eq("site_id", s.id)
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

        const b = await loadBibliographyForPublic(s.id);
        setBiblio(b);

        const { data: ps } = await supabase
          .from("photo_stories")
          .select("site_id")
          .eq("site_id", s.id)
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

  // UPDATED parallax logic
  useEffect(() => {
    const img = heroImgRef.current as HTMLElement | null;
    const hero = heroRef.current;
    if (!hero || !img) return;

    const strength = reducedMotion ? 0 : 500; // px of max shift

    const apply = () => {
      rafRef.current = null;
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop || 0;

      // The effect is only needed while the hero is visible.
      // This stops the calculation when it's off-screen.
      if (scrollTop > window.innerHeight) return;

      // Calculate progress as a value from 0 to 1.
      const progress = scrollTop / window.innerHeight;

      const y = progress * strength;
      img.style.setProperty("--y", `${y}px`);
    };

    const onScroll = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(apply);
    };
    const onResize = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(apply);
    };

    // Prime once
    apply();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [loading, reducedMotion]);

  useEffect(() => {
    if (!highlight.section_id) return;
    const el = document.getElementById(highlight.section_id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top =
      (window.scrollY || 0) +
      rect.top -
      (parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--sticky-offset"
        )
      ) || 72);
    window.scrollTo({ top, behavior: "smooth" });
  }, [highlight.section_id]);

  const lat = site?.latitude ? Number(site.latitude) : null;
  const lng = site?.longitude ? Number(site.longitude) : null;
  const mapEmbed =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}&z=12&output=embed`
      : null;
  const mapsLink =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const isBookmarked = isLoaded && site ? bookmarkedIds.has(site.id) : false;

  function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if ((navigator as any).share)
      (navigator as any).share({ title: site?.title || "Heritage", url });
    else {
      navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  }

  const cslRenderedEntries = useMemo(() => {
    try {
      const items = biblio.map((b) => b.csl);
      return batchFormatCSL(items, styleId);
    } catch {
      return [];
    }
  }, [biblio, styleId]);

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* HERO (image-only parallax) */}
      {loading || !site ? (
        <HeroSkeleton />
      ) : (
        <div
          ref={heroRef}
          className="relative w-full h-screen overflow-hidden"
          aria-label="Hero"
        >
          {/* IMAGE layer (parallax) */}
          {site.cover_photo_url ? (
            <img
              ref={heroImgRef as any}
              src={site.cover_photo_url}
              alt={site.title}
              className="w-full h-full object-cover parallax-img"
              draggable={false}
            />
          ) : (
            <div
              ref={heroImgRef as any}
              className="w-full h-full bg-gray-200 parallax-img"
            />
          )}

          {/* STATIC gradient veil */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/55 via-black/20 to-transparent" />

          {/* STATIC content overlay */}
          <div className="absolute inset-0 flex items-end">
            <div className="w-full pb-6 grid grid-cols-1 md:grid-cols-2 gap-6 px-[54px] md:px-[82px] lg:px-[109px] max-w-screen-2xl mx-auto">
              <div className="text-white">
                <h1 className="font-hero-title">{site.title}</h1>
                {site.tagline && (
                  <p className="mt-3 max-w-2xl font-hero-tagline">
                    {site.tagline}
                  </p>
                )}
                {(site.avg_rating != null || site.review_count != null) && (
                  <div className="mt-4 flex items-center gap-3 text-sm md:text-base">
                    <span className="font-medium">
                      {site.avg_rating != null
                        ? "★".repeat(Math.round(site.avg_rating))
                        : ""}{" "}
                      {site.avg_rating?.toFixed(1)}
                    </span>
                    <span className="opacity-90">
                      {site.review_count != null
                        ? `(${site.review_count} reviews)`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-white flex flex-col items-start md:items-end gap-2 md:gap-3">
                {site.heritage_type && (
                  <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur font-hero-cover-details">
                    Heritage Type:{" "}
                    <span className="font-semibold">{site.heritage_type}</span>
                  </div>
                )}
                {site.location_free && (
                  <div className="px-3 py-1 rounded-full bg-white/15 backdrop-blur font-hero-cover-details">
                    Location:{" "}
                    <span className="font-semibold">{site.location_free}</span>
                  </div>
                )}
                {hasPhotoStory && (
                  <a
                    href={`/heritage/${site.slug}/story`}
                    className="mt-2 inline-block px-4 py-2 rounded-lg bg-white font-button-photostory"
                  >
                    Open Photo Story
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      {!loading && site && (
        <StickyHeader
          site={{ id: site.id, slug: site.slug, title: site.title }}
          isBookmarked={isBookmarked}
          wishlisted={wishlisted}
          inTrip={inTrip}
          mapsLink={mapsLink}
          isLoaded={isLoaded}
          toggleBookmark={(id: string) => toggleBookmark(id)}
          setShowWishlistModal={(show: boolean) => setShowWishlistModal(show)}
          setInTrip={setInTrip}
          doShare={doShare}
          setShowReviewModal={(show: boolean) => setShowReviewModal(show)}
          researchMode={researchEnabled}
          onChangeResearchMode={(v) => {
            setResearchEnabled(v);
            try {
              localStorage.setItem("researchMode", v ? "1" : "0");
            } catch {}
          }}
        />
      )}

      {/* BODY */}
      <div className="max-w-screen-2xl mx-auto my-6 px-[54px] md:px-[82px] lg:px-[109px] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
        {/* LEFT SIDEBAR */}
        <aside className="space-y-5 w-full lg:w-auto lg:flex-shrink-0">
          {loading || !site ? (
            <>
              <SidebarCardSkeleton lines={7} />
              <SidebarCardSkeleton lines={5} />
              <SidebarCardSkeleton lines={12} />
              <SidebarCardSkeleton lines={3} />
              <SidebarCardSkeleton lines={4} />
              <SidebarCardSkeleton lines={5} />
              <SidebarCardSkeleton lines={4} />
            </>
          ) : (
            <>
              <Section title="Where is it?" iconName="where-is-it">
                {mapEmbed ? (
                  <div className="w-full overflow-hidden rounded-lg">
                    <iframe
                      src={mapEmbed}
                      className="w-full h-56"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title={`Map of ${site.title}`}
                    />
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    Location coordinates not available.
                  </div>
                )}
                {mapsLink && (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    Open Location
                  </a>
                )}
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="text-[13px] font-semibold text-slate-900">
                    Latitude
                  </div>
                  <div className="text-[13px] text-slate-700 text-right">
                    {site.latitude ?? "—"}
                  </div>
                  <div className="text-[13px] font-semibold text-slate-900">
                    Longitude
                  </div>
                  <div className="text-[13px] text-slate-700 text-right">
                    {site.longitude ?? "—"}
                  </div>
                </div>
              </Section>

              {/* Location */}
              <Section id="location" title="Location" iconName="location">
                <KeyVal k="Town/City/Village" v={site.town_city_village} />
                <KeyVal k="Tehsil" v={site.tehsil} />
                <KeyVal k="District" v={site.district} />
                <KeyVal k="Region/Province" v={provinceName} />
                <KeyVal k="Latitude" v={site.latitude} />
                <KeyVal k="Longitude" v={site.longitude} />
              </Section>

              <Section title="Regions" iconName="regions">
                {regions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {regions.map((r) => (
                      <IconChip
                        key={r.id}
                        id={r.id}
                        type="region"
                        iconName={r.icon_key}
                        label={r.name}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No regions specified.
                  </div>
                )}
              </Section>

              {/* General Information */}
              <Section
                id="general"
                title="General Information"
                iconName="general-info"
              >
                <KeyVal k="Heritage Type" v={site.heritage_type} />
                <KeyVal k="Architectural Style" v={site.architectural_style} />
                <KeyVal
                  k="Construction Materials"
                  v={site.construction_materials}
                />
                <KeyVal k="Local Name" v={site.local_name} />
                <KeyVal k="Architect" v={site.architect} />
                <KeyVal k="Construction Date" v={site.construction_date} />
                <KeyVal k="Built by" v={site.built_by} />
                <KeyVal k="Dynasty" v={site.dynasty} />
                <KeyVal k="Conservation Status" v={site.conservation_status} />
                <KeyVal k="Current Use" v={site.current_use} />
                <KeyVal k="Restored by" v={site.restored_by} />
                <KeyVal k="Known for" v={site.known_for} />
                <KeyVal k="Era" v={site.era} />
                <KeyVal k="Inhabited by" v={site.inhabited_by} />
                <KeyVal
                  k="National Park Established in"
                  v={site.national_park_established_in}
                />
                <KeyVal k="Population" v={site.population} />
                <KeyVal k="Ethnic Groups" v={site.ethnic_groups} />
                <KeyVal k="Languages Spoken" v={site.languages_spoken} />
                <KeyVal k="Excavation Status" v={site.excavation_status} />
                <KeyVal k="Excavated by" v={site.excavated_by} />
                <KeyVal k="Administered by" v={site.administered_by} />
              </Section>

              <Section title="UNESCO" iconName="unesco">
                {site.unesco_status && site.unesco_status !== "None" ? (
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">🏛️</div>
                    <div>
                      <div className="font-medium text-[13px] text-slate-900">
                        {site.unesco_status}
                      </div>
                      {site.unesco_line && (
                        <div
                          className="mt-1 text-[13px]"
                          style={{
                            color: "var(--muted-foreground, #5b6b84)",
                          }}
                        >
                          {site.unesco_line}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No UNESCO designation listed.
                  </div>
                )}
              </Section>

              <Section title="Protected under" iconName="protected-under">
                {site.protected_under ? (
                  <div
                    className="whitespace-pre-wrap text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    {site.protected_under}
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    Not specified.
                  </div>
                )}
              </Section>

              <Section
                title="Climate & Topography"
                iconName="climate-topography"
              >
                <KeyVal k="Landform" v={site.landform} />
                <KeyVal k="Altitude" v={site.altitude} />
                <KeyVal k="Mountain Range" v={site.mountain_range} />
                <KeyVal k="Weather Type" v={site.weather_type} />
                <KeyVal k="Avg Temp (Summers)" v={site.avg_temp_summers} />
                <KeyVal k="Avg Temp (Winters)" v={site.avg_temp_winters} />
              </Section>

              <Section title="Did you Know" iconName="did-you-know">
                {site.did_you_know ? (
                  <div
                    className="whitespace-pre-wrap text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    {site.did_you_know}
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    —
                  </div>
                )}
              </Section>

              {/* Travel Guide */}
              <Section id="travel" title="Travel Guide" iconName="travel-guide">
                <KeyVal k="Heritage Site" v={site.title} />
                <KeyVal k="Location" v={site.travel_location} />
                <KeyVal k="How to Reach" v={site.travel_how_to_reach} />
                <KeyVal
                  k="Nearest Major City"
                  v={site.travel_nearest_major_city}
                />
                <KeyVal k="Airport Access" v={site.travel_airport_access} />
                <KeyVal
                  k="International Flight"
                  v={site.travel_international_flight}
                />
                <KeyVal k="Access Options" v={site.travel_access_options} />
                <KeyVal
                  k="Road Type & Condition"
                  v={site.travel_road_type_condition}
                />
                <KeyVal k="Best Time to Visit" v={site.travel_best_time_free} />
                {site.travel_full_guide_url && (
                  <a
                    href={site.travel_full_guide_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    Open Full Travel Guide
                  </a>
                )}
              </Section>

              <Section title="Best Time to Visit" iconName="best-time-to-visit">
                {site.best_time_option_key ? (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    {site.best_time_option_key}
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    —
                  </div>
                )}
              </Section>

              <Section title="Places to Stay" iconName="places-to-stay">
                <KeyVal k="Hotels Available" v={site.stay_hotels_available} />
                <KeyVal
                  k="Spending Night Recommended"
                  v={site.stay_spending_night_recommended}
                />
                <KeyVal k="Camping Possible" v={site.stay_camping_possible} />
                <KeyVal
                  k="Places to Eat Available"
                  v={site.stay_places_to_eat_available}
                />
              </Section>
            </>
          )}
        </aside>

        {/* RIGHT MAIN */}
        <main ref={contentRef} className="space-y-5 w-full lg:flex-1">
          {loading || !site ? (
            <>
              <SidebarCardSkeleton lines={6} />
              <SidebarCardSkeleton lines={6} />
              <SidebarCardSkeleton lines={6} />
              {GallerySkeleton({ count: 6 })}
              <SidebarCardSkeleton lines={3} />
              {BibliographySkeleton({ rows: 4 })}
              {ReviewsSkeleton()}
            </>
          ) : (
            <>
              <Section id="photostory" title="Photo Story" iconName="camera">
                {hasPhotoStory ? (
                  <a
                    href={`/heritage/${site.slug}/story`}
                    className="inline-block px-4 py-2 rounded-lg bg-black text-white text-sm"
                  >
                    Open Photo Story
                  </a>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No photo story yet.
                  </div>
                )}
              </Section>

              <Section
                id="categories"
                title="Heritage Categories"
                iconName="heritage-categories"
              >
                {categories.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.map((c) => (
                      <IconChip
                        key={c.id}
                        id={c.id}
                        type="category"
                        iconName={c.icon_key}
                        label={c.name}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No categories assigned.
                  </div>
                )}
              </Section>

              {site.history_layout_html ? (
                <Section
                  id="history"
                  title="History and Background"
                  iconName="history-background"
                >
                  <Article
                    html={site.history_layout_html}
                    siteId={site.id}
                    siteSlug={site.slug}
                    siteTitle={site.title}
                    sectionId="history"
                    sectionTitle="History and Background"
                    researchEnabled={false}
                    highlightQuote={
                      highlight.section_id === "history"
                        ? highlight.quote
                        : null
                    }
                  />
                </Section>
              ) : null}

              {site.architecture_layout_html ? (
                <Section
                  id="architecture"
                  title="Architecture and Design"
                  iconName="architecture-design"
                >
                  <Article
                    html={site.architecture_layout_html}
                    siteId={site.id}
                    siteSlug={site.slug}
                    siteTitle={site.title}
                    sectionId="architecture"
                    sectionTitle="Architecture and Design"
                    researchEnabled={false}
                    highlightQuote={
                      highlight.section_id === "architecture"
                        ? highlight.quote
                        : null
                    }
                  />
                </Section>
              ) : null}

              {site.climate_layout_html ? (
                <Section
                  id="climate"
                  title="Climate & Environment"
                  iconName="climate-topography"
                >
                  <Article
                    html={site.climate_layout_html}
                    siteId={site.id}
                    siteSlug={site.slug}
                    siteTitle={site.title}
                    sectionId="climate"
                    sectionTitle="Climate & Environment"
                    researchEnabled={false}
                    highlightQuote={
                      highlight.section_id === "climate"
                        ? highlight.quote
                        : null
                    }
                  />
                </Section>
              ) : null}

              {Array.isArray(site.custom_sections_json) &&
                site.custom_sections_json
                  .filter(
                    (cs) => !!cs.layout_html && cs.layout_html.trim() !== ""
                  )
                  .map((cs) => (
                    <Section
                      key={cs.id}
                      id={cs.id}
                      title={cs.title}
                      iconName="history-background"
                    >
                      <Article
                        html={cs.layout_html!}
                        siteId={site.id}
                        siteSlug={site.slug}
                        siteTitle={site.title}
                        sectionId={cs.id}
                        sectionTitle={cs.title}
                        researchEnabled={false}
                        highlightQuote={
                          highlight.section_id === cs.id
                            ? highlight.quote
                            : null
                        }
                      />
                    </Section>
                  ))}

              <Section id="gallery" title="Photo Gallery" iconName="gallery">
                {gallery.length ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {gallery.map((img) => (
                        <figure
                          key={img.id}
                          className="bg-gray-100 rounded-lg overflow-hidden"
                        >
                          {img.publicUrl ? (
                            <img
                              src={img.publicUrl}
                              alt={img.alt_text || ""}
                              className="w-full h-40 object-cover"
                            />
                          ) : (
                            <div className="w-full h-40" />
                          )}
                          {(img.caption || img.credit) && (
                            <figcaption className="px-2 py-1 font-caption">
                              {img.caption}
                              {img.credit && (
                                <span className="ml-1">({img.credit})</span>
                              )}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                    <a
                      href={`/heritage/${site.slug}/gallery`}
                      className="mt-3 inline-block px-4 py-2 rounded-lg bg-black text-white text-sm"
                    >
                      Open Photo Gallery
                    </a>
                  </>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No photos uploaded yet.
                  </div>
                )}
              </Section>

              <Section
                id="photography"
                title="Photography & Content"
                iconName="photography-content"
              >
                <div
                  className="text-[13px]"
                  style={{ color: "var(--muted-foreground, #5b6b84)" }}
                >
                  Unless noted otherwise, photographs and written content are ©
                  Heritage of Pakistan. Please contact us for permissions and
                  usage rights.
                </div>
              </Section>

              <Section
                id="bibliography"
                title="Bibliography & Sources"
                iconName="bibliography-sources"
              >
                {biblio.length ? (
                  <ol className="list-decimal list-inside space-y-2 text-[13px] text-slate-900">
                    {biblio.map((row, i) => {
                      const entryHtml = cslRenderedEntries[i] || "";
                      return (
                        <li key={row.id}>
                          <span
                            className="csl-entry"
                            dangerouslySetInnerHTML={{ __html: entryHtml }}
                          />
                          {row.note ? (
                            <>
                              {" "}
                              <span className="text-slate-600">
                                — {row.note}
                              </span>
                            </>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <div
                    className="text-[13px]"
                    style={{ color: "var(--muted-foreground, #5b6b84)" }}
                  >
                    No sources listed.
                  </div>
                )}
              </Section>

              <Section id="reviews" title="Traveler Reviews" iconName="star">
                <ReviewsTab siteId={site.id} />
              </Section>

              <Section id="nearby" title="Places Nearby" iconName="map-pin">
                <div
                  className="text-[13px]"
                  style={{ color: "var(--muted-foreground, #5b6b84)" }}
                >
                  Coming soon.
                </div>
              </Section>
            </>
          )}
        </main>
      </div>

      {/* Global selection bubble & persistent overlay */}
      {site && (
        <GlobalResearchDebug
          enabled={researchEnabled}
          siteId={site.id}
          siteSlug={site.slug}
          siteTitle={site.title}
        />
      )}

      {/* Review Modal */}
      {showReviewModal && site && (
        <ReviewModal
          open={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          siteId={site.id}
        />
      )}

      {/* Wishlist modal mount */}
      {showWishlistModal && site && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
        />
      )}

      <style jsx global>{`
        :root {
          --sticky-offset: 72px;

          /* Soft, mature amber set */
          --amber-50: #fffaf2;
          --amber-100: #fff4e3;
          --amber-150: #ffe9c7;
          --amber-200: #ffdca6;
          --amber-300: #f9c979;
          --amber-400: #f3b75a;
          --amber-500: var(--brand-orange, #f78300);
          --amber-border: #e2b56c;
          --amber-ink: #4a3a20;
        }

        h2[id],
        h3[id],
        h4[id] {
          scroll-margin-top: var(--sticky-offset);
        }

        /* PARALLAX: transform via CSS var to avoid React overrides */
        .parallax-img {
          transform: translate3d(0, var(--y, 0px), 0) scale(1.15);
          transform-origin: center;
          will-change: transform;
        }

        /* Selection callout container (no background = no white box) */
        .research-bubble {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          box-shadow: none !important;
          animation: none !important;
        }

        .note-callout {
          position: relative;
          padding: 8px 10px;
          background: var(--amber-100);
          border: 1px solid var(--amber-border);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(90, 62, 27, 0.12),
            0 2px 6px rgba(0, 0, 0, 0.06);
          animation: note-fade 140ms ease-out;
        }
        .note-callout::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -6px;
          width: 12px;
          height: 12px;
          transform: translateX(-50%) rotate(45deg);
          background: var(--amber-100);
          border-right: 1px solid var(--amber-border);
          border-bottom: 1px solid var(--amber-border);
        }

        .note-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 2px 4px;
          border: 0;
          background: transparent;
          color: var(--amber-ink);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
          border-radius: 8px;
          transition: transform 140ms ease, opacity 140ms ease;
        }
        .note-btn:hover {
          transform: translateY(-0.5px);
          opacity: 0.92;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .note-btn:active {
          transform: translateY(0);
          opacity: 0.88;
        }
        .note-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(226, 181, 108, 0.6);
        }
        .note-btn.saving {
          cursor: default;
          opacity: 0.85;
        }

        .note-highlight {
          --note-highlight-bg: #fff1d6;
          --note-highlight-fg: #7a4b00;
          background: var(--note-highlight-bg);
          color: var(--note-highlight-fg);
          padding: 0 2px;
          border-radius: 2px;
          box-shadow: inset 0 -0.1em 0 rgba(122, 75, 0, 0.15);
        }

        .reading-article {
          user-select: text !important;
          -webkit-user-select: text !important;
          cursor: text;
          min-height: 0;
          background: transparent !important;
        }
        .reading-article p,
        .reading-article li,
        .reading-article blockquote,
        .reading-article span,
        .reading-article td,
        .reading-article figcaption {
          user-select: text !important;
        }
        .reading-article .hop-article,
        .reading-article .hop-section,
        .reading-article .hop-text,
        .reading-article figure,
        .reading-article .flx-img {
          background: transparent !important;
        }
        .reading-article img,
        .hop-article img {
          -webkit-user-drag: none;
          user-select: none;
        }
        .reading-article ::selection,
        .hop-article ::selection {
          background: #f7e0ac;
          color: #5a3e1b;
        }
        .reading-article ::-moz-selection,
        .hop-article ::-moz-selection {
          background: #f7e0ac;
          color: #5a3e1b;
        }
        .tiptap-bubble-menu,
        .tiptap-floating-menu,
        .ProseMirror-menubar,
        .ProseMirror-menu,
        .ProseMirror-tooltip,
        .ProseMirror-prompt,
        [data-bubble-menu],
        [data-floating-menu],
        [role="toolbar"][class*="menu"],
        [class*="editor-toolbar"],
        .tippy-box[data-state],
        .tippy-popper {
          display: none !important;
          pointer-events: none !important;
        }

        .sticky-sel-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1000;
        }
        .sticky-sel-box {
          position: fixed;
          background: rgba(247, 224, 172, 0.35);
          box-shadow: inset 0 0 0 1px rgba(90, 62, 27, 0.32);
          border-radius: 2px;
        }

        @keyframes note-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          [aria-label="Hero"] .parallax-img {
            transform: none !important; /* accessibility */
          }
        }
      `}</style>
    </div>
  );
}

/* ───────────── Article (snapshot reader) ───────────── */

function Article({
  html,
  siteId,
  siteSlug,
  siteTitle,
  sectionId,
  sectionTitle,
  researchEnabled,
  highlightQuote,
}: {
  html: string;
  siteId: string;
  siteSlug: string;
  siteTitle: string;
  sectionId: string;
  sectionTitle: string;
  researchEnabled: boolean;
  highlightQuote: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const clean = useMemo(() => {
    const allowed = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "img",
        "hr",
        "strong",
        "em",
        "u",
        "ul",
        "ol",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "br",
        "span",
        "a",
        "figure",
        "figcaption",
        "div",
        "section",
        "mark",
      ],
      ALLOWED_ATTR: [
        "src",
        "alt",
        "title",
        "style",
        "href",
        "target",
        "rel",
        "class",
        "width",
        "height",
        "loading",
        "id",
        "draggable",
        "data-text-lock",
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    const div = document.createElement("div");
    div.innerHTML = allowed;

    const KILL = [
      ".tiptap-bubble-menu",
      ".tiptap-floating-menu",
      ".ProseMirror-menubar",
      ".ProseMirror-menu",
      ".ProseMirror-tooltip",
      ".ProseMirror-prompt",
      "[data-bubble-menu]",
      "[data-floating-menu]",
      "[role='toolbar']",
    ];
    KILL.forEach((sel) => div.querySelectorAll(sel).forEach((n) => n.remove()));

    div.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const st = (el.getAttribute("style") || "").toLowerCase();
      if (st.includes("position:fixed")) el.remove();
    });

    return div.innerHTML;
  }, [html]);

  /* Image hover "CollectHeart" overlay */
  const [overlay, setOverlay] = useState<{
    img: HTMLImageElement | null;
    rect: DOMRect | null;
    meta: {
      imageUrl: string;
      altText: string | null;
      caption: string | null;
    } | null;
    visible: boolean;
  }>({ img: null, rect: null, meta: null, visible: false });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.setAttribute("draggable", "false");
      (img.style as any).WebkitUserDrag = "none";
    });

    const wired = new Set<HTMLImageElement>();

    const onEnter = (e: Event) => {
      const img = e.currentTarget as HTMLImageElement;
      const rect = img.getBoundingClientRect();

      const container =
        (img.closest("figure") as HTMLElement | null) ||
        (img.parentElement as HTMLElement | null);
      const capNode = container?.querySelector("figcaption");
      const caption = capNode
        ? (capNode.textContent || "").trim() || null
        : null;

      setOverlay({
        img,
        rect,
        meta: {
          imageUrl: img.getAttribute("src") || "",
          altText: img.getAttribute("alt") || null,
          caption,
        },
        visible: true,
      });
    };

    const onLeave = () =>
      setOverlay({ img: null, rect: null, meta: null, visible: false });

    const wire = (img: HTMLImageElement) => {
      if (wired.has(img)) return;
      wired.add(img);
      img.addEventListener("mouseenter", onEnter);
      img.addEventListener("mouseleave", onLeave);
    };

    host.querySelectorAll<HTMLImageElement>("img").forEach(wire);
    const mo = new MutationObserver(() => {
      host.querySelectorAll<HTMLImageElement>("img").forEach(wire);
    });
    mo.observe(host, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      wired.forEach((img) => {
        img.removeEventListener("mouseenter", onEnter);
        img.removeEventListener("mouseleave", onLeave);
      });
    };
  }, [clean]);

  useEffect(() => {
    if (!overlay.visible || !overlay.img) return;

    const update = () => {
      if (!overlay.img) return;
      const rect = overlay.img.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
      if (offscreen) {
        setOverlay({ img: null, rect: null, meta: null, visible: false });
      } else {
        setOverlay((o) => ({ ...o, rect }));
      }
    };

    const onScroll = () => requestAnimationFrame(update);
    const onResize = () => requestAnimationFrame(update);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [overlay.visible, overlay.img]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleMove = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const insideOverlay =
        overlayRef.current && t ? overlayRef.current.contains(t) : false;
      const insideHost = t ? host.contains(t) : false;
      if (!insideOverlay && !insideHost) {
        setOverlay({ img: null, rect: null, meta: null, visible: false });
      }
    };
    document.addEventListener("mousemove", handleMove);
    return () => document.removeEventListener("mousemove", handleMove);
  }, []);

  /* Deep-link highlight */
  useEffect(() => {
    if (!highlightQuote || !hostRef.current) return;

    const root = hostRef.current;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const target = highlightQuote.trim();
    if (!target) return;

    const findInNode = (node: Text, needle: string) => {
      const hay = node.nodeValue || "";
      const idx = hay.indexOf(needle);
      if (idx >= 0) return { idx, node };
      const idx2 = hay.toLowerCase().indexOf(needle.toLowerCase());
      if (idx2 >= 0) return { idx: idx2, node };
      return null;
    };

    let found: { node: Text; idx: number } | null = null;
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      found = findInNode(n, target);
      if (found) break;
    }
    if (!found) return;

    try {
      const range = document.createRange();
      range.setStart(found.node, found.idx);
      range.setEnd(found.node, found.idx + target.length);
      const mark = document.createElement("mark");
      mark.className = "note-highlight";
      range.surroundContents(mark);
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {}
  }, [highlightQuote]);

  return (
    <>
      <div
        ref={hostRef}
        className="prose max-w-none reading-article"
        data-section-id={sectionId}
        data-section-title={sectionTitle}
        data-site-id={siteId}
        data-site-title={siteTitle}
        style={{ background: "transparent" }}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {overlay.visible && overlay.rect && overlay.meta
        ? createPortal(
            <div
              ref={overlayRef}
              style={{
                position: "fixed",
                top: Math.max(8, overlay.rect.top + 8),
                left: overlay.rect.right - 8,
                transform: "translateX(-100%)",
                zIndex: 1000,
                pointerEvents: "auto",
              }}
            >
              <CollectHeart
                variant="icon"
                size={22}
                siteId={siteId}
                imageUrl={overlay.meta.imageUrl}
                altText={overlay.meta.altText}
                caption={overlay.meta.caption}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/* ───────────── Global selection bubble with persisted overlay ───────────── */

function GlobalResearchDebug({
  enabled,
  siteId,
  siteSlug,
  siteTitle,
}: {
  enabled: boolean;
  siteId: string;
  siteSlug: string;
  siteTitle: string;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubble, setBubble] = useState<{
    visible: boolean;
    top: number;
    left: number;
  }>({
    visible: false,
    top: 0,
    left: 0,
  });

  const [rects, setRects] = useState<
    Array<{ top: number; left: number; width: number; height: number }>
  >([]);

  const [saving, setSaving] = useState(false);

  const lastSelectionRef = useRef<string>("");
  const lastSectionIdRef = useRef<string | null>(null);
  const lastSectionTitleRef = useRef<string | null>(null);
  const lastContextTextRef = useRef<string | null>(null);

  const clearAll = () => {
    setBubble((b) => ({ ...b, visible: false }));
    setRects([]);
    lastSelectionRef.current = "";
    lastSectionIdRef.current = null;
    lastSectionTitleRef.current = null;
    lastContextTextRef.current = null;
    setSaving(false);
  };

  const captureSelection = () => {
    if (!enabled) return false;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;

    const quote = sel.toString().trim();
    if (!quote || quote.length < 5) return false;

    const range = sel.getRangeAt(0);
    const r = range.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects()).map((cr) => ({
      top: cr.top,
      left: cr.left,
      width: cr.width,
      height: cr.height,
    }));

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const elAtCenter = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const article = elAtCenter?.closest(
      ".reading-article"
    ) as HTMLElement | null;

    lastSectionIdRef.current = article?.dataset.sectionId ?? null;
    lastSectionTitleRef.current = article?.dataset.sectionTitle ?? null;
    lastContextTextRef.current = (
      article?.innerText ||
      document.body.innerText ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();

    lastSelectionRef.current = quote;
    setRects(clientRects);
    setBubble({
      visible: true,
      top: Math.max(8, r.top - 42),
      left: r.left + r.width / 2,
    });

    sel.removeAllRanges();
    return true;
  };

  useEffect(() => {
    const onMouseUp = () => {
      if (!captureSelection()) clearAll();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearAll();
    };
    const onScrollOrResize = () => clearAll();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (bubbleRef.current && t && bubbleRef.current.contains(t)) return;
      clearAll();
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp as any);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp as any);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [enabled]);

  const handleSaveSelection = async () => {
    try {
      if (saving) return;
      const quote = (lastSelectionRef.current || "").trim();
      if (!quote) return;

      setSaving(true);

      const full = (lastContextTextRef.current || document.body.innerText || "")
        .replace(/\s+/g, " ")
        .trim();

      let idx = full.indexOf(quote);
      if (idx < 0) idx = full.toLowerCase().indexOf(quote.toLowerCase());
      const before = idx >= 0 ? full.slice(Math.max(0, idx - 160), idx) : null;
      const after =
        idx >= 0
          ? full.slice(idx + quote.length, idx + quote.length + 160)
          : null;

      await saveResearchNote({
        site_id: siteId,
        site_slug: siteSlug,
        site_title: siteTitle,
        section_id: lastSectionIdRef.current,
        section_title: lastSectionTitleRef.current,
        quote_text: quote,
        context_before: before,
        context_after: after,
      });

      clearAll();
      alert("Saved to Notebook → Research");
    } catch (e) {
      console.error(e);
      setSaving(false);
      alert("Could not save. Please sign in and try again.");
    }
  };

  if (!enabled) return null;

  return createPortal(
    <>
      {rects.length > 0 && (
        <div className="sticky-sel-layer">
          {rects.map((r, i) => (
            <div
              key={i}
              className="sticky-sel-box"
              style={{
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
              }}
            />
          ))}
        </div>
      )}

      {bubble.visible && (
        <div
          ref={bubbleRef}
          className="research-bubble fixed z-[1001]"
          style={{
            top: bubble.top,
            left: bubble.left,
            transform: "translate(-50%, -100%)",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Allow click without losing selection overlay
          }}
        >
          <div className="note-callout">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSaveSelection();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSaveSelection();
              }}
              disabled={saving}
              className={`note-btn ${saving ? "saving" : ""}`}
              aria-live="polite"
            >
              <Icon
                name={saving ? "info" : "book"}
                size={16}
                className="text-[inherit]"
              />
              {saving ? "Saving…" : "Add to Note"}
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
