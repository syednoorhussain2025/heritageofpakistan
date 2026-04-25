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
  pageIds: ["explore-mobile-shell"],
  headerIds: [],
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
  // Dot indicators are driven imperatively — no React state, no re-render on swipe
  const dotsRef = useRef<HTMLDivElement>(null);
  const carouselIdxRef = useRef(0);
  const updateDots = useCallback((idx: number) => {
    carouselIdxRef.current = idx;
    const container = dotsRef.current;
    if (!container) return;
    Array.from(container.children).forEach((dot, i) => {
      const el = dot as HTMLElement;
      if (i === idx) {
        el.className = "rounded-full w-2 h-2 bg-[var(--brand-orange)]";
      } else {
        el.className = "rounded-full w-1.5 h-1.5 bg-gray-300 self-center";
      }
    });
  }, []);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Animation state — all imperative, no React state involved
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const isAnimatingClose = useRef(false);
  // Set synchronously when close starts — upgrade async loop checks this
  // so setSlides never fires during a close animation.
  const upgradeBlockedRef = useRef(false);

  // Swipe state — all managed via native listeners (not React synthetic events)
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);
  const dragDirectionLocked = useRef<"vertical" | "horizontal" | null>(null);

  // thumb variant = same URL the preview card uses → already cached by browser
  const getThumbCover = (s: BottomSheetSite | null): string | null => {
    if (!s) return null;
    return s.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(s.cover_photo_url, "thumb") || s.cover_photo_url || null;
  };
  const getMdCover = (s: BottomSheetSite | null): string | null => {
    if (!s) return null;
    return getThumbOrVariantUrlNoTransform(s.cover_photo_url, "md") || s.cover_photo_url || null;
  };

  const [slides, setSlides] = useState<string[]>(() => {
    const c = getThumbCover(site);
    return c ? [c] : [];
  });

  // Ref instead of state — avoids React re-render when toggled during animation.
  // Heavy work (md upgrade, slideshow image fetch + setSlides) is deferred
  // until this is true so React commits never land inside the animation window.
  const openAnimationDoneRef = useRef(false);
  // Tick counter: incremented when openAnimationDone flips true, used as
  // useEffect dep so the upgrade effect re-runs without a state variable.
  const [openAnimationTick, setOpenAnimationTick] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  // When site changes, IMMEDIATELY snap slides to the thumb (cached)
  // — this is synchronous so it lands before the first paint of the sheet.
  // No async work runs here; the upgrade effect below waits for the animation.
  useEffect(() => {
    if (!site) { setSlides([]); return; }
    const thumbUrl = getThumbCover(site);
    setSlides(thumbUrl ? [thumbUrl] : []);
    updateDots(0);
  }, [site?.id]);

  // After the open animation settles: fetch all slide URLs, decode every
  // image off the main thread via img.decode(), then do ONE setSlides call.
  // One React commit, one track-width recalc, zero decoding jank.
  useEffect(() => {
    if (!site || !openAnimationDoneRef.current) return;

    const thumbUrl = getThumbCover(site);
    const mdUrl = getMdCover(site);
    let cancelled = false;

    const upgrade = async () => {
      // Fetch slideshow image URLs (network, off animation window).
      const ids = site.cover_slideshow_image_ids;
      let rest: string[] = [];
      if (ids?.length) {
        const { data } = await getPublicClient()
          .from("site_images")
          .select("id, storage_path")
          .in("id", ids);
        if (cancelled) return;
        const byId = new Map<string, string>(
          ((data ?? []) as { id: string; storage_path: string }[]).map((r) => [r.id, r.storage_path])
        );
        rest = ids
          .map((id) => { const p = byId.get(id); if (!p) return null; try { return getVariantPublicUrl(p, "md"); } catch { return null; } })
          .filter((u): u is string => !!u);
      }
      if (cancelled) return;

      // Cap at 5 slides — off-screen decoded images occupy GPU texture memory
      // and make the carousel track wider, increasing compositing cost on close.
      const allUrls = [mdUrl || thumbUrl, ...rest].filter((u): u is string => !!u).slice(0, 5);

      // Decode all images off the main thread before touching React state.
      // img.decode() resolves when the image is fully decoded and GPU-ready,
      // meaning the browser won't need to decode on the main thread when
      // the img element is painted — no jank when slides appear.
      await Promise.allSettled(
        allUrls.map((url) => { const img = new window.Image(); img.src = url; return img.decode().catch(() => {}); })
      );
      if (cancelled || upgradeBlockedRef.current) return;

      // Single setSlides — one React commit, one layout pass.
      setSlides(allUrls);
    };

    void upgrade();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, openAnimationTick]);

  const openDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Imperative open — both sheet and parallax start in the SAME paint frame.
  // No render-cycle latency, no double-RAF, GPU layer pre-promoted.
  const animateOpen = useCallback(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;

    // Cancel any in-flight close
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    if (openDoneTimerRef.current) { clearTimeout(openDoneTimerRef.current); openDoneTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    isAnimatingClose.current = false;
    upgradeBlockedRef.current = false;

    // Reset only animation properties (not layout styles set by JSX).
    sheet.style.willChange = "transform";
    sheet.style.backfaceVisibility = "hidden";
    sheet.style.transition = "none";
    sheet.style.transform = "translate3d(0, 100%, 0)";
    backdrop.style.willChange = "opacity";
    backdrop.style.transition = "none";
    backdrop.style.opacity = "0";

    // Force reflow — commits the start state so the transition has a known from-value
    // and parallax + sheet both start in the same paint cycle.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    sheet.offsetHeight;

    // Fire parallax + sheet in the SAME tick. Both transitions are now registered
    // by the browser in a single style recomputation = perfectly synchronised start.
    applyOpen(PARALLAX_TARGETS);
    sheet.style.transition = SHEET_TRANSITION;
    sheet.style.transform = "translate3d(0, 0, 0)";
    backdrop.style.transition = BACKDROP_TRANSITION;
    backdrop.style.opacity = "1";

    // Defer all heavy work (slide upgrade, image fetch, React commits)
    // until after the animation has fully settled.
    openDoneTimerRef.current = setTimeout(() => {
      openDoneTimerRef.current = null;
      // Release GPU layers — animation is done, no longer needed until next animation.
      if (sheetRef.current) { sheetRef.current.style.willChange = ""; sheetRef.current.style.backfaceVisibility = ""; }
      if (backdropRef.current) backdropRef.current.style.willChange = "";
      openAnimationDoneRef.current = true;
      // Increment tick to trigger the upgrade effect — one tiny state update,
      // well after the animation window, not during it.
      setOpenAnimationTick((n) => n + 1);
    }, SHEET_DURATION + 50);
  }, []);

  // Imperative close
  const animateClose = useCallback((then: () => void) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) { then(); return; }

    // If already closing, don't restart — just wait for existing timer
    if (isAnimatingClose.current) return;
    isAnimatingClose.current = true;
    // Block upgrade synchronously — setSlides must not fire during close animation
    upgradeBlockedRef.current = true;

    // Cancel pending open RAF / open-done timer
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (openDoneTimerRef.current) { clearTimeout(openDoneTimerRef.current); openDoneTimerRef.current = null; }
    // Clear ref synchronously — no React re-render triggered here.
    openAnimationDoneRef.current = false;

    // Make sure GPU layer is still promoted during close
    sheet.style.willChange = "transform";
    backdrop.style.willChange = "opacity";

    // The sheet is already at its current visual position (drag or open).
    // Setting transition + transform in the same tick is reliable as long
    // as the browser sees them in separate "style change" events — we
    // ensure that with a single forced reflow before writing the target.
    sheet.style.transition = SHEET_TRANSITION;
    backdrop.style.transition = BACKDROP_TRANSITION;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    sheet.offsetHeight; // commit the new transition value before changing transform

    // Fire parallax + sheet in the same tick
    applyClose(PARALLAX_TARGETS);
    sheet.style.transform = "translate3d(0, 100%, 0)";
    backdrop.style.opacity = "0";

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      isAnimatingClose.current = false;
      // Release animation properties only — leave JSX layout styles intact.
      if (sheet) { sheet.style.willChange = ""; sheet.style.backfaceVisibility = ""; sheet.style.transition = ""; }
      if (backdrop) { backdrop.style.willChange = ""; backdrop.style.transition = ""; }
      then();
    }, SHEET_DURATION);
  }, []);

  // React to isOpen changes
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
    }
  }, [isOpen]);

  // Once rendered, kick off open animation.
  // We use TWO RAFs: first to let React's commit + portal paint settle
  // (carousel image, layout), second to actually start the animation. This
  // guarantees the heavy first paint never lands inside the animation window.
  useEffect(() => {
    if (!isRendered || !isOpen) return;
    let raf2: number | null = null;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => animateOpen());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 != null) cancelAnimationFrame(raf2);
    };
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

  // Native swipe-to-dismiss — attached directly to the sheet DOM node so we
  // can call preventDefault on touchmove without passive-listener restrictions.
  const closeWithAnimationRef = useRef(closeWithAnimation);
  closeWithAnimationRef.current = closeWithAnimation;

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    // RAF-throttle drag transform writes — at most one write per paint frame.
    // Without this, 120Hz touch events on a 60Hz display produce 2× the
    // necessary transform writes, backing up the compositor.
    let pendingDy: number | null = null;
    let dragRaf: number | null = null;
    const flushDrag = () => {
      dragRaf = null;
      if (pendingDy === null) return;
      const v = pendingDy;
      pendingDy = null;
      el.style.transform = `translate3d(0, ${v}px, 0)`;
    };

    const onStart = (e: TouchEvent) => {
      if (isAnimatingClose.current) return;
      const t = e.touches[0];
      dragStartY.current = t.clientY;
      dragStartX.current = t.clientX;
      dragStartTime.current = Date.now();
      dragCurrentY.current = 0;
      isDragging.current = true;
      dragDirectionLocked.current = null;
      el.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      if (!isDragging.current || dragStartY.current === null) return;
      const dy = e.touches[0].clientY - dragStartY.current;
      const dx = e.touches[0].clientX - dragStartX.current;

      if (!dragDirectionLocked.current) {
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          dragDirectionLocked.current = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
        }
      }

      if (dragDirectionLocked.current === "horizontal") {
        isDragging.current = false;
        el.style.transition = SHEET_TRANSITION;
        el.style.transform = "translate3d(0, 0, 0)";
        return;
      }

      if (dragDirectionLocked.current !== "vertical") return;

      e.preventDefault();

      const clamped = Math.max(0, dy);
      dragCurrentY.current = clamped;
      pendingDy = clamped;
      if (dragRaf == null) dragRaf = requestAnimationFrame(flushDrag);
    };

    const onEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      // Flush any pending drag write so the close transition starts from
      // the exact final visual position the user saw.
      if (dragRaf != null) {
        cancelAnimationFrame(dragRaf);
        dragRaf = null;
        if (pendingDy !== null) {
          el.style.transform = `translate3d(0, ${pendingDy}px, 0)`;
          pendingDy = null;
        }
      }

      const dy = dragCurrentY.current;
      const elapsed = Math.max(1, Date.now() - dragStartTime.current);
      const velocity = dy / elapsed; // px/ms

      dragStartY.current = null;
      dragCurrentY.current = 0;

      if (dy >= 80 || velocity >= 0.3) {
        // Hand off to the same close path used everywhere else.
        // animateClose will set the transition + transform itself, in the
        // SAME tick as the parallax — no fighting transitions, no late
        // parallax. The sheet animates from its current drag position to
        // translateY(100%) using SHEET_TRANSITION.
        closeWithAnimationRef.current();
      } else {
        el.style.transition = SHEET_TRANSITION;
        el.style.transform = "translate3d(0, 0, 0)";
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      if (dragRaf != null) cancelAnimationFrame(dragRaf);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  // Re-attach when the sheet mounts (isRendered) — sheetRef.current changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRendered]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openDoneTimerRef.current) clearTimeout(openDoneTimerRef.current);
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
        style={{ top: "12dvh", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)", transform: "translate3d(0, 100%, 0)" }}
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
              onIndexChange={updateDots}
            />
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col px-4 pt-3 pb-2 gap-2 flex-1 min-h-0 overflow-hidden">
          {/* Dot indicators — driven imperatively, no React state on swipe */}
          <div ref={dotsRef} className="flex justify-center gap-1.5 shrink-0 -mt-1 h-2">
            {slides.length > 1 && slides.map((_, i) => (
              <div
                key={i}
                className={`rounded-full ${i === 0 ? "w-2 h-2 bg-[var(--brand-orange)]" : "w-1.5 h-1.5 bg-gray-300 self-center"}`}
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
