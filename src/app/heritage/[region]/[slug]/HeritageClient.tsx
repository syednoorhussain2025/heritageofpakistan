// src/app/heritage/[region]/[slug]/HeritageClient.tsx
"use client";

import React from "react";

import StickyHeader from "./heritage/StickyHeader";
import HeritageCover from "./heritage/HeritageCover";
import HeritageUpperArticle from "./heritage/HeritageUpperArticle";
import HeritageGalleryLink from "./heritage/HeritageGalleryLink";
import HeritagePhotoRights from "./heritage/HeritagePhotoRights";
import HeritageSection from "./heritage/HeritageSection";
import HeritageNeighborNav from "./heritage/HeritageNeighborNav";
import HeritageBibliography from "./heritage/HeritageBibliography";
import {
  HeroSkeleton,
  SidebarCardSkeleton,
  GallerySkeleton,
  BibliographySkeleton,
  ReviewsSkeleton,
} from "./heritage/HeritageSkeletons";

import HeritageSidebar from "./heritage/HeritageSidebar";
import LazySection from "./heritage/LazySection";
import HeritageInteractions from "./heritage/HeritageInteractions";

// client islands
import HeritageArticle from "./heritage/HeritageArticle";
import HeritageNearby from "./heritage/HeritageNearby";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import { CollectionsProvider } from "@/components/CollectionsProvider";

/* ---------------- Types for site + props from server ---------------- */

type HeroCover =
  | {
      // hero variant URL from server (sites.cover_photo_url passed through imagevariants)
      url: string;
      width?: number | null;
      height?: number | null;
      blurhash?: string | null;
      blurDataURL?: string | null;
      caption?: string | null;
      credit?: string | null;
    }
  | null;

type HeritageClientSite = {
  id: string;
  slug: string;
  province_slug: string;
  title: string;
  tagline?: string | null;
  heritage_type?: string | null;
  location_free?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  cover?: HeroCover;
  [key: string]: any;
};

type NeighborLinkForClient = {
  slug: string;
  province_slug: string | null;
  title: string;
  tagline: string | null;
  cover: HeroCover;
};

type NeighborProps = {
  prev: NeighborLinkForClient | null;
  next: NeighborLinkForClient | null;
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

type Highlight = { quote: string | null; section_id: string | null };

type HeritagePageProps = {
  site: HeritageClientSite;
  neighbors?: NeighborProps;
  provinceName: string | null;
  categories: Taxonomy[];
  regions: Taxonomy[];
  gallery: ImageRow[];
  bibliography: BiblioItem[];
  bibliographyEntries: string[];
  styleId: string;
  hasPhotoStory: boolean;
  highlight: Highlight;
  travelGuideSummary: TravelGuideSummary | null;
};

export default function HeritageClient({
  site: initialSite,
  neighbors,
  provinceName,
  categories,
  regions,
  gallery,
  bibliography,
  bibliographyEntries,
  styleId,
  hasPhotoStory,
  highlight,
  travelGuideSummary,
}: HeritagePageProps) {
  const site: HeritageClientSite | null = initialSite ?? null;

  /* ---------------- Derived links and neighbors ---------------- */

  const maps = (() => {
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
  })();

  const prevHref =
    neighbors?.prev && neighbors.prev.province_slug
      ? `/heritage/${neighbors.prev.province_slug}/${neighbors.prev.slug}`
      : null;

  const nextHref =
    neighbors?.next && neighbors.next.province_slug
      ? `/heritage/${neighbors.next.province_slug}/${neighbors.next.slug}`
      : null;

  /* ---------------- Render ---------------- */

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      {/* HERO */}
      {!site ? (
        <HeroSkeleton />
      ) : (
        <HeritageCover site={site} hasPhotoStory={hasPhotoStory} />
      )}

      {/* Sticky header, bookmarks, modals, research bubble (client island) */}
      {site && (
        <HeritageInteractions
          site={{ id: site.id, slug: site.slug, title: site.title }}
          hasPhotoStory={hasPhotoStory}
          mapsLink={maps.link}
        />
      )}

      {/* Neighbor navigation bar */}
      <HeritageNeighborNav
        prevHref={prevHref}
        nextHref={nextHref}
        prevTitle={neighbors?.prev?.title ?? null}
        nextTitle={neighbors?.next?.title ?? null}
      />

      {/* Content layout */}
      <div className="max-w-screen-2xl mx-auto my-6 px-0 lg:px-[109px] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-4">
        {/* LEFT SIDEBAR */}
        <aside className="space-y-5 w-full lg:w-auto lg:flex-shrink-0">
          {!site ? (
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
            <LazySection
              skeleton={
                <>
                  <SidebarCardSkeleton lines={7} />
                  <SidebarCardSkeleton lines={5} />
                  <SidebarCardSkeleton lines={6} />
                </>
              }
            >
              <HeritageSidebar
                site={site as any}
                provinceName={provinceName}
                regions={regions}
                maps={maps}
                travelGuideSummary={travelGuideSummary}
              />
            </LazySection>
          )}
        </aside>

        {/* RIGHT MAIN CONTENT */}
        <main className="space-y-5 w-full lg:flex-1">
          {!site ? (
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
              {/* Top categories / overview stays eager */}
              <HeritageUpperArticle
                site={{ slug: site.slug }}
                categories={categories}
                hasPhotoStory={hasPhotoStory}
              />

              {/* History */}
              {site.history_layout_html && (
                <HeritageSection
                  id="history"
                  title="History and Background"
                  iconName="history-background"
                >
                  <LazySection skeleton={<SidebarCardSkeleton lines={7} />}>
                    <CollectionsProvider>
                      <HeritageArticle
                        key={`history-${site.history_layout_html.length}`}
                        html={site.history_layout_html}
                        site={{
                          id: site.id,
                          slug: site.slug,
                          title: site.title,
                        }}
                        section={{
                          id: "history",
                          title: "History and Background",
                        }}
                        highlightQuote={
                          highlight.section_id === "history"
                            ? highlight.quote
                            : null
                        }
                      />
                    </CollectionsProvider>
                  </LazySection>
                </HeritageSection>
              )}

              {/* Architecture */}
              {site.architecture_layout_html && (
                <HeritageSection
                  id="architecture"
                  title="Architecture and Design"
                  iconName="architecture-design"
                >
                  <LazySection skeleton={<SidebarCardSkeleton lines={7} />}>
                    <CollectionsProvider>
                      <HeritageArticle
                        key={`architecture-${site.architecture_layout_html.length}`}
                        html={site.architecture_layout_html}
                        site={{
                          id: site.id,
                          slug: site.slug,
                          title: site.title,
                        }}
                        section={{
                          id: "architecture",
                          title: "Architecture and Design",
                        }}
                        highlightQuote={
                          highlight.section_id === "architecture"
                            ? highlight.quote
                            : null
                        }
                      />
                    </CollectionsProvider>
                  </LazySection>
                </HeritageSection>
              )}

              {/* Climate */}
              {site.climate_layout_html && (
                <HeritageSection
                  id="climate"
                  title="Climate & Environment"
                  iconName="climate-topography"
                >
                  <LazySection skeleton={<SidebarCardSkeleton lines={7} />}>
                    <CollectionsProvider>
                      <HeritageArticle
                        key={`climate-${site.climate_layout_html.length}`}
                        html={site.climate_layout_html}
                        site={{
                          id: site.id,
                          slug: site.slug,
                          title: site.title,
                        }}
                        section={{
                          id: "climate",
                          title: "Climate & Environment",
                        }}
                        highlightQuote={
                          highlight.section_id === "climate"
                            ? highlight.quote
                            : null
                        }
                      />
                    </CollectionsProvider>
                  </LazySection>
                </HeritageSection>
              )}

              {/* Custom sections */}
              {Array.isArray(site.custom_sections_json) &&
                site.custom_sections_json
                  .filter((cs: any) => !!cs.layout_html?.trim())
                  .map((cs: any) => (
                    <HeritageSection
                      key={cs.id}
                      id={cs.id}
                      title={cs.title}
                      iconName="history-background"
                    >
                      <LazySection skeleton={<SidebarCardSkeleton lines={7} />}>
                        <CollectionsProvider>
                          <HeritageArticle
                            key={`custom-${cs.id}-${
                              (cs.layout_html || "").length
                            }`}
                            html={cs.layout_html}
                            site={{
                              id: site.id,
                              slug: site.slug,
                              title: site.title,
                            }}
                            section={{ id: cs.id, title: cs.title }}
                            highlightQuote={
                              highlight.section_id === cs.id
                                ? highlight.quote
                                : null
                            }
                          />
                        </CollectionsProvider>
                      </LazySection>
                    </HeritageSection>
                  ))}

              {/* Gallery */}
              <LazySection skeleton={<GallerySkeleton count={6} />}>
                <HeritageGalleryLink siteSlug={site.slug} gallery={gallery} />
              </LazySection>

              {/* Nearby */}
              <LazySection
                skeleton={
                  <HeritageSection
                    id="nearby"
                    title="Places Nearby"
                    iconName="regiontax"
                  >
                    <div className="space-y-2">
                      <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-5/6 rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
                    </div>
                  </HeritageSection>
                }
              >
                <HeritageNearby
                  siteId={site.id}
                  siteTitle={site.title}
                  lat={site.latitude ? Number(site.latitude) : null}
                  lng={site.longitude ? Number(site.longitude) : null}
                />
              </LazySection>

              {/* Photo rights */}
              <HeritagePhotoRights />

              {/* Bibliography */}
              <LazySection skeleton={<BibliographySkeleton rows={4} />}>
                <HeritageBibliography
                  items={bibliography}
                  styleId={styleId}
                  entries={bibliographyEntries}
                />
              </LazySection>

              {/* Reviews */}
              <HeritageSection
                id="reviews"
                title="Traveler Reviews"
                iconName="star"
              >
                <LazySection
                  skeleton={
                    <div className="space-y-4">
                      <div className="border rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
                        </div>
                        <div className="h-4 w-full rounded bg-gray-200 animate-pulse mb-2" />
                        <div className="h-4 w-5/6 rounded bg-gray-200 animate-pulse mb-2" />
                        <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                      </div>
                    </div>
                  }
                >
                  <ReviewsTab siteId={site.id} />
                </LazySection>
              </HeritageSection>
            </>
          )}
        </main>
      </div>

      <style jsx global>{`
        :root {
          --sticky-offset: 72px;
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
      `}</style>
    </div>
  );
}
