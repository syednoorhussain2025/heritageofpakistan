"use client";

import React, { useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import StickyHeader from "@/components/StickyHeader";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import ReviewsTab from "@/components/reviews/ReviewsTab";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import { saveResearchNote } from "@/lib/notebook";
import { createPortal } from "react-dom";

// page-local imports from our new folder
import { useHeritageData, Site } from "./heritage/heritagedata";
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

export default function HeritagePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = (params.slug as string) ?? "";
  const deepLinkNoteId = searchParams?.get("note") || null;

  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();

  const {
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
  } = useHeritageData(slug, deepLinkNoteId);

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

  // Precompute rendered CSL entries once bibliography/style are ready (Bibliography also does its own formatting for independence; this is just a minor optimization)
  const renderedCSL = useMemo(() => {
    // leave to HeritageBibliography for independence
    return null;
  }, [bibliography, styleId]);

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* HERO */}
      {loading || !site ? (
        <HeroSkeleton />
      ) : (
        <HeritageCover site={site} hasPhotoStory={hasPhotoStory} />
      )}

      {/* Sticky action bar */}
      {!loading && site && (
        <StickyHeader
          site={{ id: site.id, slug: site.slug, title: site.title }}
          isBookmarked={isBookmarked}
          wishlisted={wishlisted}
          inTrip={inTrip}
          mapsLink={maps.link}
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
            <HeritageSidebar
              site={site}
              provinceName={provinceName}
              regions={regions}
              maps={maps}
            />
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
                    html={site.history_layout_html}
                    site={{ id: site.id, slug: site.slug, title: site.title }}
                    section={{ id: "history", title: "History and Background" }}
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
                  .filter(
                    (cs) => !!cs.layout_html && cs.layout_html.trim() !== ""
                  )
                  .map((cs) => (
                    <HeritageSection
                      key={cs.id}
                      id={cs.id}
                      title={cs.title}
                      iconName="history-background"
                    >
                      <HeritageArticle
                        html={cs.layout_html!}
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

              <HeritagePhotoRights />

              <HeritageBibliography items={bibliography} styleId={styleId} />

              <HeritageSection
                id="reviews"
                title="Traveler Reviews"
                iconName="star"
              >
                <ReviewsTab siteId={site.id} />
              </HeritageSection>

              <HeritageNearby
                siteId={site.id}
                lat={site.latitude ? Number(site.latitude) : null}
                lng={site.longitude ? Number(site.longitude) : null}
              />
            </>
          )}
        </main>
      </div>

      {/* Global selection bubble & persisted overlay */}
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

      {/* Wishlist modal */}
      {showWishlistModal && site && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
        />
      )}

      {/* Global style bits moved with hero/article for independence; keep only shared vars here */}
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

/* ───────────── GlobalResearchDebug kept here to minimize file count ───────────── */

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

  React.useEffect(() => {
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
