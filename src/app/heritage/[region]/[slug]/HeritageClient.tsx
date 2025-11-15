"use client";

import React, { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import StickyHeader from "./heritage/StickyHeader";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import { saveResearchNote } from "@/lib/notebook";
import { createPortal } from "react-dom";

// Hearts provider
import { CollectionsProvider } from "@/components/CollectionsProvider";

// Page-local imports
import { useHeritageData } from "./heritage/heritagedata";
import HeritageCover from "./heritage/HeritageCover";
import HeritageSidebar from "./heritage/HeritageSidebar";
import HeritageUpperArticle from "./heritage/HeritageUpperArticle";
import HeritageArticle from "./heritage/HeritageArticle";
import HeritageGalleryLink from "./heritage/HeritageGalleryLink";
import HeritagePhotoRights from "./heritage/HeritagePhotoRights";
import HeritageBibliography from "./heritage/HeritageBibliography";
import HeritageNearby from "./heritage/HeritageNearby";
import {
  HeroSkeleton,
  SidebarCardSkeleton,
  GallerySkeleton,
  BibliographySkeleton,
  ReviewsSkeleton,
} from "./heritage/HeritageSkeletons";
import HeritageSection from "./heritage/HeritageSection";

/* ---------------- Types for site from server ---------------- */

type HeroCover =
  | {
      url: string; // non-null to match Site.cover
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

  /** Unified cover coming from site_covers */
  cover?: HeroCover;

  [key: string]: any;
};

export default function HeritagePage({
  site: initialSite,
}: {
  site: HeritageClientSite;
}) {
  const searchParams = useSearchParams();
  const deepLinkNoteId = searchParams?.get("note") || null;
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();

  const slug = initialSite?.slug ?? "";

  /* ---------------- Fetch hydrated content ---------------- */
  const {
    loading,
    site: fetchedSite,
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
  } = useHeritageData(slug, deepLinkNoteId);

  /* ---------------- Merge SSR + Client site data ---------------- */

  const site: HeritageClientSite | null = (() => {
    if (!initialSite && !fetchedSite) return null;

    const base = (fetchedSite as any) ?? initialSite;

    const serverCover = (initialSite?.cover || null) as any;
    const clientCover = ((fetchedSite as any)?.cover || null) as any;

    let mergedCover: HeroCover = null;

    if (serverCover || clientCover) {
      const url: string | null =
        clientCover?.url ?? serverCover?.url ?? null;

      if (url) {
        mergedCover = {
          url,
          width: clientCover?.width ?? serverCover?.width ?? null,
          height: clientCover?.height ?? serverCover?.height ?? null,
          blurhash:
            clientCover?.blurhash ?? serverCover?.blurhash ?? null,
          blurDataURL:
            serverCover?.blurDataURL ?? clientCover?.blurDataURL ?? null,
          caption:
            clientCover?.caption ?? serverCover?.caption ?? null,
          credit:
            clientCover?.credit ?? serverCover?.credit ?? null,
        };
      } else {
        mergedCover = null;
      }
    }

    return {
      ...base,
      province_slug:
        base.province_slug ?? initialSite?.province_slug ?? "",
      cover: mergedCover,
    };
  })();

  /* ---------------- UI State ---------------- */

  const [wishlisted, setWishlisted] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const [researchEnabled, setResearchEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("researchMode");
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  });

  const isBookmarked = isLoaded && site ? bookmarkedIds.has(site.id) : false;
  const contentRef = useRef<HTMLElement>(null);

  function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if ((navigator as any).share)
      (navigator as any).share({ title: site?.title || "Heritage", url });
    else {
      navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  }

  /* ---------------- Render ---------------- */

  return (
    <CollectionsProvider>
      <div className="min-h-screen bg-[#f8f8f8]">
        {/* HERO (SSR → client-hydrated) */}
        {!site ? (
          <HeroSkeleton />
        ) : (
          <HeritageCover
            site={site}
            hasPhotoStory={hasPhotoStory}
            fadeImage={false}
          />
        )}

        {/* Sticky header */}
        {!loading && site && (
          <StickyHeader
            site={{ id: site.id, slug: site.slug, title: site.title }}
            isBookmarked={isBookmarked}
            wishlisted={wishlisted}
            inTrip={inTrip}
            mapsLink={maps.link}
            isLoaded={isLoaded}
            toggleBookmark={toggleBookmark}
            setShowWishlistModal={setShowWishlistModal}
            setInTrip={setInTrip}
            doShare={doShare}
            setShowReviewModal={setShowReviewModal}
            researchMode={researchEnabled}
            onChangeResearchMode={(v) => {
              setResearchEnabled(v);
              try {
                localStorage.setItem("researchMode", v ? "1" : "0");
              } catch {}
            }}
          />
        )}

        {/* Content layout */}
        <div className="max-w-screen-2xl mx-auto my-6 px-[54px] md:px-[82px] lg:px-[109px] lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-4">
          {/* LEFT SIDEBAR */}
          <aside className="space-y-5 w-full lg:w-auto lg:flex-shrink-0">
            {!site || loading ? (
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
              <HeritageSidebar
                site={site}
                provinceName={provinceName}
                regions={regions}
                maps={maps}
                travelGuideSummary={travelGuideSummary}
              />
            )}
          </aside>

          {/* RIGHT MAIN CONTENT */}
          <main ref={contentRef} className="space-y-5 w-full lg:flex-1">
            {!site || loading ? (
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
                <HeritageUpperArticle
                  site={{ slug: site.slug }}
                  categories={categories}
                  hasPhotoStory={hasPhotoStory}
                />

                {site.history_layout_html && (
                  <HeritageSection
                    id="history"
                    title="History and Background"
                    iconName="history-background"
                  >
                    <HeritageArticle
                      key={`history-${site.history_layout_html.length}`}
                      html={site.history_layout_html}
                      site={{ id: site.id, slug: site.slug, title: site.title }}
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
                  </HeritageSection>
                )}

                {site.architecture_layout_html && (
                  <HeritageSection
                    id="architecture"
                    title="Architecture and Design"
                    iconName="architecture-design"
                  >
                    <HeritageArticle
                      key={`architecture-${site.architecture_layout_html.length}`}
                      html={site.architecture_layout_html}
                      site={{ id: site.id, slug: site.slug, title: site.title }}
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
                  </HeritageSection>
                )}

                {site.climate_layout_html && (
                  <HeritageSection
                    id="climate"
                    title="Climate & Environment"
                    iconName="climate-topography"
                  >
                    <HeritageArticle
                      key={`climate-${site.climate_layout_html.length}`}
                      html={site.climate_layout_html}
                      site={{ id: site.id, slug: site.slug, title: site.title }}
                      section={{ id: "climate", title: "Climate & Environment" }}
                      highlightQuote={
                        highlight.section_id === "climate"
                          ? highlight.quote
                          : null
                      }
                    />
                  </HeritageSection>
                )}

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
                        <HeritageArticle
                          key={`custom-${cs.id}-${(cs.layout_html || "").length}`}
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
                      </HeritageSection>
                    ))}

                <HeritageGalleryLink siteSlug={site.slug} gallery={gallery} />

                <HeritageNearby
                  siteId={site.id}
                  siteTitle={site.title}
                  lat={site.latitude ? Number(site.latitude) : null}
                  lng={site.longitude ? Number(site.longitude) : null}
                />

                <HeritagePhotoRights />

                <HeritageBibliography items={bibliography} styleId={styleId} />

                <HeritageSection
                  id="reviews"
                  title="Traveler Reviews"
                  iconName="star"
                >
                  <ReviewsTab siteId={site.id} />
                </HeritageSection>
              </>
            )}
          </main>
        </div>

        {site && (
          <GlobalResearchDebug
            enabled={researchEnabled}
            siteId={site.id}
            siteSlug={site.slug}
            siteTitle={site.title}
          />
        )}

        {showReviewModal && site && (
          <ReviewModal
            open={showReviewModal}
            onClose={() => setShowReviewModal(false)}
            siteId={site.id}
          />
        )}

        {showWishlistModal && site && (
          <AddToWishlistModal
            siteId={site.id}
            onClose={() => setShowWishlistModal(false)}
          />
        )}

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
    </CollectionsProvider>
  );
}

/* ---------------- Research Bubble ---------------- */

function GlobalResearchDebug({ enabled, siteId, siteSlug, siteTitle }: any) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubble, setBubble] = useState({ visible: false, top: 0, left: 0 });
  const [rects, setRects] = useState<any[]>([]);
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
    const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const article = el?.closest(".reading-article") as HTMLElement | null;

    lastSectionIdRef.current = article?.dataset.sectionId ?? null;
    lastSectionTitleRef.current = article?.dataset.sectionTitle ?? null;
    lastContextTextRef.current =
      article?.innerText?.replace(/\s+/g, " ").trim() ?? "";

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

  React.useEffect(() => {
    const onMouseUp = () => (captureSelection() ? null : clearAll());
    const onKeyUp = (e: any) => e.key === "Escape" && clearAll();
    const onScroll = () => clearAll();

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);

  const handleSaveSelection = async () => {
    const quote = lastSelectionRef.current.trim();
    if (!quote || saving) return;

    setSaving(true);

    const full =
      lastContextTextRef.current ||
      document.body.innerText?.replace(/\s+/g, " ").trim() ||
      "";
    let idx = full.indexOf(quote);
    if (idx < 0) idx = full.toLowerCase().indexOf(quote.toLowerCase());

    const before = idx >= 0 ? full.slice(Math.max(0, idx - 160), idx) : null;
    const after =
      idx >= 0
        ? full.slice(idx + quote.length, idx + quote.length + 160)
        : null;

    try {
      await saveResearchNote({
        site_id: siteId,
        site_slug: siteSlug,
        site_title: siteTitle,
        // Coerce nullable refs to plain strings
        section_id: lastSectionIdRef.current || "",
        section_title: lastSectionTitleRef.current || "",
        quote_text: quote,
        context_before: before,
        context_after: after,
      });
      clearAll();
      alert("Saved to Notebook → Research");
    } catch (e) {
      console.error(e);
      alert("Could not save. Please sign in and try again.");
      setSaving(false);
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
        >
          <div className="note-callout">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleSaveSelection();
              }}
              disabled={saving}
              className={`note-btn ${saving ? "saving" : ""}`}
            >
              <Icon name={saving ? "info" : "book"} size={16} />
              {saving ? "Saving…" : "Add to Note"}
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
