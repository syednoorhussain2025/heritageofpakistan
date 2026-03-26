"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import ReviewModal from "@/components/reviews/ReviewModal";
import ReviewSuccessPopup from "@/components/reviews/ReviewSuccessPopup";
import BadgeEarnedPopup from "@/components/reviews/BadgeEarnedPopup";
import { supabase } from "@/lib/supabase/browser";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { nativeShare } from "@/lib/nativeShare";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useBottomSheetParallax } from "@/hooks/useBottomSheetParallax";

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
  onPlacesNearby?: (site: { id: string; title: string; latitude: number; longitude: number }) => void;
  onReviewSuccess?: (userId: string) => void;
  hideReview?: boolean;
}

export default function SiteActionsSheet({ site, isOpen, onClose, onPlacesNearby, onReviewSuccess, hideReview }: Props) {
  const router = useRouter();
  const { userId } = useAuthUserId();
  const [mounted, setMounted] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  const sheetElRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [showReviewSuccess, setShowReviewSuccess] = useState(false);
  const [badgeEarned, setBadgeEarned] = useState<{ badge: string; count: number } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useBodyScrollLock(isOpen || showWishlistModal || showTripModal || showReviewModal);
  useBottomSheetParallax(sheetVisible && !closing);

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
  const detailHref = provinceSlug ? `/heritage/${provinceSlug}/${site.slug}` : `/heritage/${site.slug}`;
  const galleryHref = provinceSlug ? `/heritage/${provinceSlug}/${site.slug}/gallery` : `/heritage/${site.slug}/gallery`;
  const photoStoryHref = provinceSlug ? `/heritage/${provinceSlug}/${site.slug}/photo-story` : `/heritage/${site.slug}/photo-story`;
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
      <div className="fixed inset-0 z-[4000] touch-none pointer-events-none">
        {/* Tap-to-close backdrop — only covers gap above sheet */}
        <div
          className="absolute inset-0 bottom-[82vh] touch-none pointer-events-auto"
          onClick={closeSheet}
          aria-hidden="true"
        />
        {/* Sheet */}
        <div
          ref={sheetElRef}
          className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[82vh] flex flex-col pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}
        >
          <div
            className="w-full flex justify-center pt-3 pb-2 shrink-0 touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            aria-hidden="true"
          >
            <div className="w-10 h-1 bg-gray-400/40 rounded-full" />
          </div>

          <div className="px-4 pt-3 pb-3 border-b border-gray-200/60 shrink-0">
            <div className="flex items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center">
                <Icon name="plus" size={15} className="text-[var(--brand-orange)]" />
              </div>
              <span className="text-[17px] font-bold text-gray-900">Actions</span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              {(site.cover_photo_thumb_url || site.cover_photo_url) && (
                <img
                  src={getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") || site.cover_photo_thumb_url || ""}
                  alt={site.title}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 bg-gray-200"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-gray-900 leading-snug truncate">{site.title}</p>
                {site.location_free && (
                  <p className="text-[12px] text-gray-500 truncate mt-0.5">{site.location_free}</p>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-y-auto">
            <div className="mx-4 mt-3 mb-3 bg-white rounded-2xl overflow-hidden">
              <button type="button" onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => setShowWishlistModal(true), 520); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="layout-list" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Save to List</span>
              </button>
              <div className="mx-4 h-[0.5px] bg-gray-100" />
              <button type="button" onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => setShowTripModal(true), 520); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="line-segments-light" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Add to Trip</span>
              </button>
              {!hideReview && (<>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <button type="button" onClick={() => { void hapticMedium(); closeSheet(); setTimeout(() => { setReviewRating(0); setShowReviewModal(true); }, 520); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="star-light" size={22} className="text-gray-700" /></div>
                  <span className="text-[15px] font-medium text-gray-900">Add Review</span>
                </button>
              </>)}
              <div className="mx-4 h-[0.5px] bg-gray-100" />
              <button type="button" onClick={() => { void hapticMedium(); void handlePlacesNearby(); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="map-pin-area-light" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Places Nearby</span>
              </button>
              <div className="mx-4 h-[0.5px] bg-gray-100" />
              <button type="button" onClick={() => { void handleShare(); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="share-arrow" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Share</span>
              </button>
            </div>

            <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden">
              <a href={galleryHref} onClick={() => { void hapticLight(); closeSheet(); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="images" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Gallery</span>
              </a>
              <div className="mx-4 h-[0.5px] bg-gray-100" />
              <a href={photoStoryHref} onClick={() => { void hapticLight(); closeSheet(); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="play-circle-light" size={22} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Photo Story</span>
              </a>
              {googleMapsHref && (<>
                <div className="mx-4 h-[0.5px] bg-gray-100" />
                <a href={googleMapsHref} target="_blank" rel="noopener noreferrer" onClick={() => { void hapticLight(); closeSheet(); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0"><Icon name="map-pin-light" size={22} className="text-gray-700" /></div>
                  <span className="text-[15px] font-medium text-gray-900">Open in Google Maps</span>
                </a>
              </>)}
            </div>

            <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
              <button type="button" onClick={() => { void hapticLight(); closeSheet(); }} className="w-full px-4 py-4 text-[15px] font-semibold text-[var(--brand-blue)] active:bg-gray-50">
                Cancel
              </button>
            </div>
            <div className="pb-[env(safe-area-inset-bottom,0.5rem)]" />
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      {sheet}
      {mounted && showWishlistModal && createPortal(
        <AddToWishlistModal siteId={site.id} onClose={() => setShowWishlistModal(false)} site={{ name: site.title, imageUrl: site.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") ?? undefined, location: site.location_free ?? undefined }} />,
        document.body
      )}
      {mounted && showTripModal && createPortal(
        <AddToTripModal siteId={site.id} onClose={() => setShowTripModal(false)} site={{ name: site.title, imageUrl: site.cover_photo_url, location: site.location_free }} />,
        document.body
      )}
      {mounted && showReviewModal && (
        <ReviewModal open={showReviewModal} siteId={site.id} rating={reviewRating} onRatingChange={setReviewRating} onClose={() => { setShowReviewModal(false); }}
          onSuccess={() => { setShowReviewModal(false); closeSheet(); setShowReviewSuccess(true); }}
          onBadgeEarned={(badge, count) => setBadgeEarned({ badge, count })}
        />
      )}
      {showReviewSuccess && (
        <ReviewSuccessPopup onDone={() => { setShowReviewSuccess(false); if (!badgeEarned) onReviewSuccess?.(userId ?? ""); }} />
      )}
      {badgeEarned && !showReviewSuccess && (
        <BadgeEarnedPopup badge={badgeEarned.badge} reviewCount={badgeEarned.count} onDone={() => { setBadgeEarned(null); onReviewSuccess?.(userId ?? ""); }} />
      )}
    </>
  );
}
