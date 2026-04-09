// src/app/heritage/[region]/[slug]/heritage/HeritageInteractions.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import StickyHeader from "./StickyHeader";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { saveResearchNote } from "@/lib/notebook";
import { nativeShare } from "@/lib/nativeShare";
import { createPortal } from "react-dom";
import MobilePageHeader from "@/components/MobilePageHeader";
import QuickSearchOverlay from "@/components/QuickSearchOverlay";

const SiteActionsSheet = dynamic(
  () => import("@/components/SiteActionsSheet"),
  { ssr: false }
);

const ReviewModal = dynamic(
  () => import("@/components/reviews/ReviewModal"),
  { ssr: false }
);

const ReviewSuccessPopup = dynamic(
  () => import("@/components/reviews/ReviewSuccessPopup"),
  { ssr: false }
);

const AddToWishlistModal = dynamic(
  () => import("@/components/AddToWishlistModal"),
  { ssr: false }
);

const BadgeEarnedPopup = dynamic(
  () => import("@/components/reviews/BadgeEarnedPopup"),
  { ssr: false }
);

type HeritageInteractionsProps = {
  site: {
    id: string;
    slug: string;
    title: string;
    province_slug?: string | null;
    cover_photo_url?: string | null;
    location_free?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  hasPhotoStory: boolean;
  mapsLink: string | null;
  onReviewSuccess?: (userId: string) => void;
};

export default function HeritageInteractions({
  site,
  hasPhotoStory,
  mapsLink,
  onReviewSuccess,
}: HeritageInteractionsProps) {
  const pathname = usePathname();
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();
  const { userId } = useAuthUserId();
  const [mounted, setMounted] = useState(false);
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTop = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  useEffect(() => { setMounted(true); }, []);

  /* Track scroll direction — hide on down, show on up */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = document.getElementById("heritage-page-root");
    const onScroll = () => {
      const scrollTop = container ? container.scrollTop : window.scrollY;
      setScrolled(scrollTop > 80);
      if (scrollTop <= 40) {
        setHeaderVisible(true);
      } else if (scrollTop > lastScrollTop.current + 6) {
        setHeaderVisible(false);
      } else if (scrollTop < lastScrollTop.current - 4) {
        setHeaderVisible(true);
      }
      lastScrollTop.current = scrollTop;
    };
    onScroll();
    const target = container ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  /* Remember last opened heritage page for mobile Heritage tab */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const heritageDetailRe = /^\/heritage\/[^/]+\/[^/]+\/?$/;
    if (heritageDetailRe.test(pathname || "")) {
      window.localStorage.setItem("lastHeritagePath", pathname || "");
    }
  }, [pathname]);

  /* Bookmark, wishlist, trip, reviews, research mode */

  const [wishlisted, setWishlisted] = useState(false);
  const [inTrip, setInTrip] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [showReviewSuccess, setShowReviewSuccess] = useState(false);
  const [badgeEarned, setBadgeEarned] = useState<{ badge: string; count: number } | null>(null);

  const [researchEnabled, setResearchEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("researchMode");
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  });

  const isBookmarked =
    isLoaded && site ? bookmarkedIds.has(site.id) : false;

  async function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const result = await nativeShare(site?.title || "Heritage", url);
    if (result === "copied") showToast("Link copied");
  }

  const iconColor = scrolled ? "#555555" : "#ffffff";
  const btnClass = scrolled
    ? "w-11 h-11 flex items-center justify-center rounded-full bg-white/50 shadow-sm active:bg-white/70 transition-all"
    : "w-11 h-11 flex items-center justify-center rounded-full active:bg-white/20 transition-all";

  return (
    <>
      {/* Global toast */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-5 -translate-x-1/2 z-[9999] rounded-lg bg-gray-900/90 text-white text-sm px-4 py-2.5 shadow-lg">
          {toast}
        </div>
      )}

      {/* Mobile header — portalled to body so it stays fixed to viewport even when parent is transformed */}
      {mounted && createPortal(
        <MobilePageHeader
          backgroundColor="transparent"
          minHeight="64px"
          className={`transition-all duration-[460ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${headerVisible ? "translate-y-0" : "-translate-y-full"} ${actionsSheetOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <div className="flex items-center justify-between w-full px-3 h-full">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.location.href = "/explore";
                  }
                }}
                className={`w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-all active:scale-95 ${scrolled ? "bg-slate-100 text-slate-600 shadow-md" : "bg-black/30 text-white"}`}
                aria-label="Go back"
              >
                <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
                  <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className={`w-10 h-10 flex items-center justify-center rounded-full shrink-0 transition-all active:scale-95 ${scrolled ? "bg-slate-100 text-slate-600 shadow-md" : "bg-black/30 text-white"}`}
                aria-label="Search"
              >
                <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <line x1="13" y1="13" x2="17" y2="17" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActionsSheetOpen(true)}
                className="w-11 h-11 flex items-center justify-center rounded-full active:scale-95 transition-all"
                style={{ background: "var(--brand-green, #16a34a)" }}
                aria-label="More actions"
              >
                <Icon name="plus" size={22} style={{ color: "#ffffff", width: 22, height: 22, minWidth: 22, minHeight: 22 }} />
              </button>
            </div>
          </div>
        </MobilePageHeader>,
        document.body
      )}
      <div className="hidden md:block">
        <StickyHeader
          site={{ id: site.id, slug: site.slug, title: site.title }}
          isBookmarked={isBookmarked}
          wishlisted={wishlisted}
          inTrip={inTrip}
          mapsLink={mapsLink}
          isLoaded={isLoaded}
          toggleBookmark={toggleBookmark}
          setShowWishlistModal={setShowWishlistModal}
          setInTrip={setInTrip}
          doShare={doShare}
          setShowReviewModal={(v) => { if (v) setReviewRating(0); setShowReviewModal(v); }}
          researchMode={researchEnabled}
          onChangeResearchMode={v => {
            setResearchEnabled(v);
            try {
              localStorage.setItem("researchMode", v ? "1" : "0");
            } catch {}
          }}
        />
      </div>

      {site && (
        <GlobalResearchDebug
          enabled={researchEnabled}
          siteId={site.id}
          siteSlug={site.slug}
          siteTitle={site.title}
          onToast={showToast}
        />
      )}

      {/* Mobile actions sheet (ellipsis button) */}
      <SiteActionsSheet
        site={{
          id: site.id,
          slug: site.slug,
          title: site.title,
          province_slug: site.province_slug,
          cover_photo_url: site.cover_photo_url,
          location_free: site.location_free,
          latitude: site.latitude,
          longitude: site.longitude,
        }}
        isOpen={actionsSheetOpen}
        onClose={() => setActionsSheetOpen(false)}
        onReviewSuccess={(uid) => onReviewSuccess?.(uid)}
      />

      {site && (
        <ReviewModal
          open={showReviewModal}
          siteId={site.id}
          rating={reviewRating}
          onRatingChange={setReviewRating}
          onClose={() => { setShowReviewModal(false); }}
          onSuccess={() => { setShowReviewSuccess(true); }}
          onBadgeEarned={(badge, count) => setBadgeEarned({ badge, count })}
        />
      )}
      {showReviewSuccess && (
        <ReviewSuccessPopup
          onDone={() => {
            setShowReviewSuccess(false);
            if (!badgeEarned) {
              onReviewSuccess?.(userId ?? "");
            }
          }}
        />
      )}
      {badgeEarned && !showReviewSuccess && (
        <BadgeEarnedPopup
          badge={badgeEarned.badge}
          reviewCount={badgeEarned.count}
          onDone={() => {
            setBadgeEarned(null);
            onReviewSuccess?.(userId ?? "");
          }}
        />
      )}

      {showWishlistModal && site && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
          site={{ name: site.title }}
        />
      )}

      <QuickSearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
}

/* ---------------- Research Bubble ---------------- */

function GlobalResearchDebug({
  enabled,
  siteId,
  siteSlug,
  siteTitle,
  onToast,
}: {
  enabled: boolean;
  siteId: string;
  siteSlug: string;
  siteTitle: string;
  onToast: (msg: string) => void;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubble, setBubble] = useState({ visible: false, top: 0, left: 0 });
  const [rects, setRects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const lastSelectionRef = useRef<string>("");
  const lastSectionIdRef = useRef<string | null>(null);
  const lastSectionTitleRef = useRef<string | null>(null);
  const lastContextTextRef = useRef<string | null>(null);

  const clearAll = () => {
    setBubble(b => ({ ...b, visible: false }));
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

    const clientRects = Array.from(range.getClientRects()).map(cr => ({
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

  useEffect(() => {
    if (!enabled) return;

    const onMouseUp = () => (captureSelection() ? null : clearAll());
    const onKeyUp = (e: KeyboardEvent) =>
      e.key === "Escape" && clearAll();
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
        section_id: lastSectionIdRef.current || "",
        section_title: lastSectionTitleRef.current || "",
        quote_text: quote,
        context_before: before,
        context_after: after,
      });
      clearAll();
      onToast("Saved to Notebook → Research");
    } catch (e) {
      console.error(e);
      onToast("Could not save. Please sign in and try again.");
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
              onMouseDown={e => {
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
