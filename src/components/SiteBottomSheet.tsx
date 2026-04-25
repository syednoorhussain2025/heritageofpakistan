"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import SiteCarousel from "@/components/SiteCarousel";
import SiteActionsSheet from "@/components/SiteActionsSheet";
import { getPublicClient } from "@/lib/supabase/browser";
import { getVariantPublicUrl, getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import { hapticMedium } from "@/lib/haptics";
import { applyOpen, applyClose } from "@/hooks/useBottomSheetParallax";

export type BottomSheetSite = {
  id: string;
  slug: string;
  province_id?: string | number | null;
  province_slug?: string | null;
  title: string;
  cover_photo_url?: string | null;
  cover_photo_thumb_url?: string | null;
  cover_blur_data_url?: string | null;
  cover_slideshow_image_ids?: string[] | null;
  avg_rating?: number | null;
  review_count?: number | null;
  heritage_type?: string | null;
  location_free?: string | null;
  tagline?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

interface Props {
  site: BottomSheetSite | null;
  isOpen: boolean;
  onClose: () => void;
  onPlacesNearby?: (site: { id: string; title: string; latitude: number; longitude: number }) => void;
  userLat?: number | null;
  userLng?: number | null;
  fromLat?: number | null;
  fromLng?: number | null;
  fromTitle?: string | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveProvinceSlug(provinceId: string | number): Promise<string | null> {
  const { data } = await getPublicClient()
    .from("provinces")
    .select("slug")
    .eq("id", provinceId)
    .single();
  return (data as { slug: string | null } | null)?.slug ?? null;
}

const PARALLAX_TARGETS = {
  pageIds: ["explore-mobile-shell", "map-mobile-shell"],
  headerIds: ["map-mobile-header"],
};

const SHEET_DURATION = 680;
const SHEET_EASE = "cubic-bezier(0.32,0.72,0,1)";
const SHEET_TRANSITION = `transform ${SHEET_DURATION}ms ${SHEET_EASE}`;
const BACKDROP_TRANSITION = `opacity 300ms ease-out`;

export default function SiteBottomSheet({ site, isOpen, onClose, onPlacesNearby, userLat, userLng, fromLat, fromLng, fromTitle }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  // mounted controls portal existence; isRendered keeps it in DOM during close animation
  const [isRendered, setIsRendered] = useState(false);

  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Animation state — all imperative, no React state involved
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const isAnimatingClose = useRef(false);

  // Swipe state
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);
  const dragDirectionLocked = useRef<"vertical" | "horizontal" | null>(null);

  const getCover = (s: BottomSheetSite | null): string | null => {
    if (!s) return null;
    return getThumbOrVariantUrlNoTransform(s.cover_photo_url, "md") || s.cover_photo_url || null;
  };

  const [slides, setSlides] = useState<string[]>(() => {
    const c = getCover(site);
    return c ? [c] : [];
  });

  useEffect(() => { setMounted(true); }, []);

  // Sync slides when site changes
  useEffect(() => {
    if (!site) { setSlides([]); return; }
    const coverUrl = getCover(site);
    setSlides(coverUrl ? [coverUrl] : []);
    setCarouselIdx(0);
    const ids = site.cover_slideshow_image_ids;
    if (!ids?.length) return;
    let cancelled = false;
    getPublicClient()
      .from("site_images")
      .select("id, storage_path")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        const byId = new Map<string, string>(
          data.map((r: { id: string; storage_path: string }) => [r.id, r.storage_path])
        );
        const rest = ids
          .map((id) => {
            const path = byId.get(id);
            if (!path) return null;
            try { return getVariantPublicUrl(path, "md"); } catch { return null; }
          })
          .filter((u): u is string => !!u);
        if (!cancelled && rest.length) setSlides(coverUrl ? [coverUrl, ...rest] : rest);
      });
    return () => { cancelled = true; };
  }, [site?.id]);

  // Imperative open — no React state for animation, no render-cycle latency
  const animateOpen = useCallback(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    // Cancel any in-flight close
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    isAnimatingClose.current = false;

    // Fire parallax immediately
    applyOpen(PARALLAX_TARGETS);

    // Pin sheet to off-screen start with no transition
    sheet.style.transition = "none";
    sheet.style.transform = "translateY(100%)";
    backdrop.style.transition = "none";
    backdrop.style.opacity = "0";

    // Force reflow so browser registers the start state
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    sheet.offsetHeight;

    // Animate to visible in next frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      sheet.style.transition = SHEET_TRANSITION;
      sheet.style.transform = "translateY(0)";
      backdrop.style.transition = BACKDROP_TRANSITION;
      backdrop.style.opacity = "1";
    });
  }, []);

  // Imperative close
  const animateClose = useCallback((then: () => void) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) { then(); return; }

    // If already closing, don't restart — just wait for existing timer
    if (isAnimatingClose.current) return;
    isAnimatingClose.current = true;

    // Cancel any pending open RAF
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    // Fire parallax immediately
    applyClose(PARALLAX_TARGETS);

    sheet.style.transition = SHEET_TRANSITION;
    sheet.style.transform = "translateY(100%)";
    backdrop.style.transition = BACKDROP_TRANSITION;
    backdrop.style.opacity = "0";

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      isAnimatingClose.current = false;
      then();
    }, SHEET_DURATION);
  }, []);

  // React to isOpen changes
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
    }
  }, [isOpen]);

  // Once rendered, kick off open animation
  useEffect(() => {
    if (!isRendered || !isOpen) return;
    // Wait one tick for the portal to be in the DOM
    const raf = requestAnimationFrame(() => animateOpen());
    return () => cancelAnimationFrame(raf);
  }, [isRendered, isOpen, animateOpen]);

  // When isOpen goes false externally (e.g. navigating away), animate close
  useEffect(() => {
    if (!isOpen && isRendered) {
      animateClose(() => setIsRendered(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const closeWithAnimation = useCallback(() => {
    animateClose(() => {
      setIsRendered(false);
      onClose();
    });
  }, [animateClose, onClose]);

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingClose.current) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
    dragStartTime.current = Date.now();
    dragCurrentY.current = 0;
    isDragging.current = true;
    dragDirectionLocked.current = null;
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const dx = e.touches[0].clientX - dragStartX.current;

    if (!dragDirectionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) {
        dragDirectionLocked.current = "horizontal";
      } else if (Math.abs(dy) > 4) {
        dragDirectionLocked.current = "vertical";
      }
    }

    if (dragDirectionLocked.current === "horizontal") {
      isDragging.current = false;
      const el = sheetRef.current;
      if (el) { el.style.transition = ""; el.style.transform = ""; }
      return;
    }

    if (dragDirectionLocked.current !== "vertical") return;

    if (dy < 0) {
      dragCurrentY.current = 0;
      const el = sheetRef.current;
      if (el) el.style.transform = "translateY(0)";
      return;
    }
    dragCurrentY.current = dy;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const dy = dragCurrentY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dy / elapsed;
    const el = sheetRef.current;
    if (el) el.style.transition = "";

    dragStartY.current = null;
    dragCurrentY.current = 0;

    if (dy >= 80 || velocity >= 0.4) {
      closeWithAnimation();
    } else {
      if (el) el.style.transform = "translateY(0)";
    }
  }, [closeWithAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!mounted || !isRendered || !site) return null;

  async function handleOpenSite() {
    if (!site) return;
    void hapticMedium();
    let provinceSlug = site.province_slug;
    if (!provinceSlug && site.province_id) {
      provinceSlug = await resolveProvinceSlug(site.province_id);
    }
    const href = provinceSlug
      ? `/heritage/${provinceSlug}/${site.slug}`
      : `/heritage/${site.slug}`;
    closeWithAnimation();
    router.push(href);
  }

  const sheet = createPortal(
    <div
      className="lg:hidden fixed inset-x-0 bottom-0 z-[3500] touch-none"
      style={{ top: 0, height: "100dvh" }}
      aria-modal="true"
      role="dialog"
      aria-label="Site details"
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/40"
        style={{ opacity: 0 }}
        onClick={closeWithAnimation}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
        style={{ top: "12dvh", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)", transform: "translateY(100%)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="w-full flex justify-center pt-3 pb-4 shrink-0" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-gray-300/80" />
        </div>

        {/* Carousel */}
        <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ paddingBottom: "75%" }}>
          <div className="absolute inset-0">
            <SiteCarousel
              slides={slides}
              siteId={site.id}
              alt={site.title}
              hideDots
              onIndexChange={setCarouselIdx}
            />
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col px-4 pt-3 pb-2 gap-2 flex-1 min-h-0 overflow-hidden">
          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 shrink-0 -mt-1 h-2">
            {slides.length > 1 && slides.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  i === carouselIdx
                    ? "w-2 h-2 bg-[var(--brand-orange)]"
                    : "w-1.5 h-1.5 bg-gray-300 self-center"
                }`}
              />
            ))}
          </div>

          {/* Title + ellipsis */}
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="flex-1 min-w-0 text-xl font-bold text-[var(--brand-blue)] leading-tight truncate">
              {site.title}
            </h2>
            <button
              type="button"
              onClick={() => { void hapticMedium(); setActionsSheetOpen(true); }}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors"
              title="More actions"
              aria-label="More actions"
            >
              <Icon name="ellipsis" size={22} />
            </button>
          </div>

          {/* Rating + type + location */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {site.avg_rating != null && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--brand-green)] text-white text-xs font-semibold inline-flex items-center gap-1">
                <Icon name="star" size={11} />
                {site.avg_rating.toFixed(1)}
              </span>
            )}
            {site.heritage_type && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-medium text-xs">
                {site.heritage_type}
              </span>
            )}
            {site.location_free && (
              <span className="flex items-center gap-1 text-gray-500 text-xs">
                <Icon name="map-marker-alt" size={11} />
                {site.location_free}
              </span>
            )}
          </div>

          {/* Description */}
          {site.tagline && (
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-5 shrink-0">
              {site.tagline}
            </p>
          )}

          {/* Distance from origin site */}
          {fromLat != null && fromLng != null && site.latitude != null && site.longitude != null && fromTitle && (() => {
            const km = haversineKm(fromLat, fromLng, site.latitude, site.longitude);
            const display = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
            return (
              <div className="border-l-2 border-[var(--brand-orange)] pl-3 shrink-0 flex flex-col gap-0.5 mt-1">
                <span className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-[var(--brand-orange)] text-white text-xs font-bold">{display}</span>
                  away from {fromTitle}
                </span>
              </div>
            );
          })()}

          {/* Distance from user */}
          {userLat != null && userLng != null && site.latitude != null && site.longitude != null && (() => {
            const km = haversineKm(userLat, userLng, site.latitude, site.longitude);
            const display = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
            const canWalk = km <= 0.5;
            return (
              <div className={`border-l-2 pl-3 shrink-0 flex flex-col gap-0.5 mt-1 ${canWalk ? "border-[var(--brand-green)]" : "border-[var(--brand-orange)]"}`}>
                <span className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-white text-xs font-bold ${canWalk ? "bg-[var(--brand-green)]" : "bg-[var(--brand-orange)]"}`}>{display}</span>
                  away from your location
                </span>
                {canWalk && (
                  <span className="text-xs text-[var(--brand-green)] font-medium">🚶 You can easily walk</span>
                )}
              </div>
            );
          })()}

          <div className="flex-1" />

          {/* Open Site */}
          <button
            type="button"
            onClick={() => { void handleOpenSite(); }}
            className="shrink-0 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            Open Site
            <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {sheet}
      {site && (
        <SiteActionsSheet
          site={site}
          isOpen={actionsSheetOpen}
          onClose={() => setActionsSheetOpen(false)}
          onPlacesNearby={onPlacesNearby}
          hideReview
        />
      )}
    </>
  );
}
