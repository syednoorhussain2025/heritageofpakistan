// src/app/heritage/[region]/[slug]/heritage/HeritageInteractions.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

import StickyHeader from "./StickyHeader";
import Icon from "@/components/Icon";
import { useBookmarks } from "@/components/BookmarkProvider";
import { saveResearchNote } from "@/lib/notebook";
import { createPortal } from "react-dom";

const ReviewModal = dynamic(
  () => import("@/components/reviews/ReviewModal"),
  { ssr: false }
);

const AddToWishlistModal = dynamic(
  () => import("@/components/AddToWishlistModal"),
  { ssr: false }
);

type HeritageInteractionsProps = {
  site: { id: string; slug: string; title: string };
  hasPhotoStory: boolean;
  mapsLink: string | null;
};

export default function HeritageInteractions({
  site,
  hasPhotoStory,
  mapsLink,
}: HeritageInteractionsProps) {
  const pathname = usePathname();
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();

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

  function doShare() {
    const url =
      typeof window !== "undefined" ? window.location.href : "";
    if ((navigator as any).share) {
      (navigator as any).share({
        title: site?.title || "Heritage",
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
      alert("Link copied");
    }
  }

  return (
    <>
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
        setShowReviewModal={setShowReviewModal}
        researchMode={researchEnabled}
        onChangeResearchMode={v => {
          setResearchEnabled(v);
          try {
            localStorage.setItem("researchMode", v ? "1" : "0");
          } catch {}
        }}
      />

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
    </>
  );
}

/* ---------------- Research Bubble ---------------- */

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
