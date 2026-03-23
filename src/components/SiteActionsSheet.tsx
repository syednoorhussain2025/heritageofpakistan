"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import { supabase } from "@/lib/supabase/browser";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { nativeShare } from "@/lib/nativeShare";

export type SiteActionsSheetSite = {
  id: string;
  slug: string;
  province_slug?: string | null;
  title: string;
  cover_photo_url?: string | null;
  cover_photo_thumb_url?: string | null;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

interface Props {
  site: SiteActionsSheetSite;
  isOpen: boolean;
  onClose: () => void;
  /** When provided, "Places Nearby" calls this instead of navigating to /explore */
  onPlacesNearby?: (site: { id: string; title: string; latitude: number; longitude: number }) => void;
}

export default function SiteActionsSheet({ site, isOpen, onClose, onPlacesNearby }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // Swipe-to-close state
  const sheetElRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) {
      setSheetVisible(false);
      setClosing(false);
      return;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    raf1Ref.current = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = null;
        setSheetVisible(true);
      });
    });
    return () => {
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [isOpen]);

  useEffect(() => () => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const closeSheet = useCallback(() => {
    if (closeTimerRef.current != null) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 500);
  }, [onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (closeTimerRef.current) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    dragCurrentY.current = 0;
    isDragging.current = true;
    const el = sheetElRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < 0) {
      dragCurrentY.current = 0;
      const el = sheetElRef.current;
      if (el) el.style.transform = "translateY(0)";
      return;
    }
    dragCurrentY.current = dy;
    const el = sheetElRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const dy = dragCurrentY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dy / elapsed;

    const el = sheetElRef.current;
    if (el) el.style.transition = "";

    if (dy >= 80 || velocity >= 0.4) {
      void hapticLight();
      setClosing(true);
      if (el) el.style.transform = "translateY(100%)";
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        onClose();
        if (el) el.style.transform = "";
      }, 500);
    } else {
      if (el) el.style.transform = "translateY(0)";
    }

    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [onClose]);

  const handlePlacesNearby = useCallback(async () => {
    let lat = site.latitude;
    let lng = site.longitude;

    if ((lat == null || lng == null) && site.id) {
      try {
        const { data, error } = await supabase
          .from("sites")
          .select("latitude, longitude")
          .eq("id", site.id)
          .maybeSingle();
        if (!error && data) {
          lat = data.latitude ?? null;
          lng = data.longitude ?? null;
        }
      } catch { /* ignore */ }
    }

    if (lat == null || lng == null) return;

    closeSheet();

    if (onPlacesNearby) {
      onPlacesNearby({ id: site.id, title: site.title, latitude: Number(lat), longitude: Number(lng) });
      return;
    }

    const href = buildPlacesNearbyURL({ siteId: site.id, lat, lng, radiusKm: 5, basePath: "/explore" });
    try {
      router.push(href);
    } catch {
      if (typeof window !== "undefined") window.location.assign(href);
    }
  }, [site, closeSheet, onPlacesNearby, router]);

  async function handleShare() {
    void hapticMedium();
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}${detailHref}`;
    const result = await nativeShare(site.title, url);
    if (result === "copied") {
      setShareToast("Link copied");
      setTimeout(() => setShareToast(null), 2200);
    }
    closeSheet();
  }

  const provinceSlug = site.province_slug;
  const detailHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const galleryHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}/gallery`
    : `/heritage/${site.slug}/gallery`;
  const photoStoryHref = provinceSlug
    ? `/heritage/${provinceSlug}/${site.slug}/photo-story`
    : `/heritage/${site.slug}/photo-story`;
  const googleMapsHref =
    site.latitude != null && site.longitude != null &&
    !Number.isNaN(site.latitude) && !Number.isNaN(site.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`
      : null;

  const visible = sheetVisible && !closing;

  const sheet = (!mounted || (!isOpen && !closing)) ? null : createPortal(
    <>
      {shareToast && (
        <div className="pointer-events-none fixed left-1/2 top-5 -translate-x-1/2 z-[9999] rounded-lg bg-gray-900/90 text-white text-sm px-4 py-2.5 shadow-lg">
          {shareToast}
        </div>
      )}
      <div className="fixed inset-0 z-[4000] touch-none">
        {/* Backdrop — blur + dark fade */}
        <div
          className={`absolute inset-0 transition-all duration-500 ease-in-out touch-none ${visible ? "opacity-100 backdrop-blur-sm bg-black/40" : "opacity-0 backdrop-blur-none bg-black/0"}`}
          onClick={closeSheet}
          aria-hidden="true"
        />

        {/* Sheet — slide up + fade in */}
        <div
          ref={sheetElRef}
          className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[82vh] flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}
        >
          {/* Drag handle — only this area triggers swipe-to-close */}
          <div
            className="w-full flex justify-center pt-3 pb-2 shrink-0 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            aria-hidden="true"
          >
            <div className="w-10 h-1 bg-gray-400/40 rounded-full" />
          </div>

          {/* Site preview header — fixed, does not scroll */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-3 mx-0 border-b border-gray-200/60 shrink-0">
            {(site.cover_photo_thumb_url || site.cover_photo_url) && (
              <img
                src={getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") || site.cover_photo_thumb_url || ""}
                alt={site.title}
                className="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-200"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">
                {site.title}
              </p>
              {site.location_free && (
                <p className="text-[12px] text-gray-500 truncate mt-0.5">{site.location_free}</p>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto">

          {/* Primary actions group */}
          <div className="mx-4 mt-3 mb-3 bg-white rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => setShowWishlistModal(true), 520); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon name="layout-list" size={22} className="text-gray-700" />
              </div>
              <span className="text-[15px] font-medium text-gray-900">Save to List</span>
            </button>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <button
              type="button"
              onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => setShowTripModal(true), 520); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon name="line-segments-light" size={22} className="text-gray-700" />
              </div>
              <span className="text-[15px] font-medium text-gray-900">Add to Trip</span>
            </button>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <button
              type="button"
              onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => setShowReviewModal(true), 520); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon name="star-light" size={22} className="text-gray-700" />
              </div>
              <span className="text-[15px] font-medium text-gray-900">Add Review</span>
            </button>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <button
              type="button"
              onClick={() => { void hapticMedium(); void handlePlacesNearby(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <Icon name="map-pin-area-light" size={22} className="text-gray-700" />
              </div>
              <span className="text-[15px] font-medium text-gray-900">Places Nearby</span>
            </button>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <button
              type="button"
              onClick={() => { void handleShare(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                  <path d="M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4" />
                  <path d="M14 3h7v7" />
                  <path d="M21 3L11 13" />
                </svg>
              </div>
              <span className="text-[15px] font-medium text-gray-900">Share</span>
            </button>
          </div>

          {/* Secondary actions group */}
          <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden">
            <a
              href={galleryHref}
              onClick={() => { void hapticLight(); closeSheet(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                  <rect x="2" y="6" width="16" height="13" rx="2" />
                  <path d="M6 6V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-2" />
                  <circle cx="8.5" cy="11.5" r="1.5" />
                  <polyline points="5 19 9 14 11.5 16.5 14 14 18 19" />
                </svg>
              </div>
              <span className="text-[15px] font-medium text-gray-900">Gallery</span>
            </a>
            <div className="mx-4 h-[0.5px] bg-gray-100" />
            <a
              href={photoStoryHref}
              onClick={() => { void hapticLight(); closeSheet(); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" />
                </svg>
              </div>
              <span className="text-[15px] font-medium text-gray-900">Photo Story</span>
            </a>
            {googleMapsHref && (
              <>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <a
                  href={googleMapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { void hapticLight(); closeSheet(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                      <circle cx="12" cy="9" r="2.5" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Open in Google Maps</span>
                </a>
              </>
            )}
          </div>

          {/* Cancel */}
          <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => { void hapticLight(); closeSheet(); }}
              className="w-full px-4 py-4 text-[15px] font-semibold text-[var(--brand-blue)] active:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          <div className="pb-[env(safe-area-inset-bottom,0.5rem)]" />
          </div>{/* end scrollable content */}
        </div>
      </div>

    </>,
    document.body
  );

  return (
    <>
      {sheet}
      {mounted && showWishlistModal && createPortal(
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => setShowWishlistModal(false)}
          site={{
            name: site.title,
            imageUrl: site.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") ?? undefined,
            location: site.location_free ?? undefined,
          }}
        />,
        document.body
      )}
      {mounted && showTripModal && createPortal(
        <AddToTripModal
          siteId={site.id}
          onClose={() => setShowTripModal(false)}
        />,
        document.body
      )}
      {mounted && showReviewModal && (
        <ReviewModal
          open={showReviewModal}
          siteId={site.id}
          onClose={() => setShowReviewModal(false)}
        />
      )}
    </>
  );
}
