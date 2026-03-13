"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import SiteCarousel from "@/components/SiteCarousel";
import { getPublicClient } from "@/lib/supabase/browser";
import { getVariantPublicUrl, getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";

export type BottomSheetSite = {
  id: string;
  slug: string;
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
};

interface Props {
  site: BottomSheetSite | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function SiteBottomSheet({ site, isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // Swipe-to-close state
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  // Use the md-variant cover URL as slide 0 — good quality, available immediately.
  const getCover = (s: BottomSheetSite | null): string | null => {
    if (!s) return null;
    return getThumbOrVariantUrlNoTransform(s.cover_photo_url, "md") || s.cover_photo_url || null;
  };

  const [slides, setSlides] = useState<string[]>(() => {
    const c = getCover(site);
    return c ? [c] : [];
  });

  useEffect(() => { setMounted(true); }, []);

  // Sync slides when site changes, then fetch remaining slideshow images in background
  useEffect(() => {
    if (!site) { setSlides([]); return; }

    const coverUrl = getCover(site);

    // Seed with full-res cover immediately — no low-quality thumb, no later swap
    setSlides(coverUrl ? [coverUrl] : []);

    const ids = site.cover_slideshow_image_ids;
    if (!ids?.length) return;

    let cancelled = false;
    getPublicClient()
      .from("site_images")
      .select("id, storage_path")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        if (!data?.length) return;
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

        if (!rest.length) return;

        // Append additional slides — cover stays as slide 0, no geometry snap
        if (!cancelled) setSlides(coverUrl ? [coverUrl, ...rest] : rest);
      });

    return () => { cancelled = true; };
  }, [site?.id]);

  // Open/close animation
  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      setClosing(false);
      return;
    }
    raf1Ref.current = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = null;
        setVisible(true);
      });
    });
    return () => {
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [isOpen]);

  const closeWithAnimation = useCallback(() => {
    if (closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (closeTimerRef.current) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    dragCurrentY.current = 0;
    isDragging.current = true;
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < 0) {
      // Dragging up — don't follow
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
    const velocity = dy / elapsed; // px/ms

    const el = sheetRef.current;
    // Re-enable transition
    if (el) el.style.transition = "";

    const DISMISS_DISTANCE = 80;
    const DISMISS_VELOCITY = 0.4; // px/ms

    if (dy >= DISMISS_DISTANCE || velocity >= DISMISS_VELOCITY) {
      // Animate out then close
      if (el) el.style.transform = "translateY(100%)";
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        onClose();
        if (el) el.style.transform = "";
      }, 300);
    } else {
      // Spring back
      if (el) el.style.transform = "translateY(0)";
    }

    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [onClose]);

  if (!mounted || (!isOpen && !closing) || !site) return null;

  const detailHref = site.province_slug
    ? `/heritage/${site.province_slug}/${site.slug}`
    : `/heritage/${site.slug}`;

  const sheetVisible = visible && !closing;

  return createPortal(
    <div
      className="lg:hidden fixed inset-0 z-[3500] touch-none"
      aria-modal="true"
      role="dialog"
      aria-label="Site details"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${sheetVisible ? "opacity-100" : "opacity-0"}`}
        onClick={closeWithAnimation}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute left-0 right-0 bottom-0 top-[20%] bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${sheetVisible ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
      >
        {/* Drag handle — touch target for swipe-to-close */}
        <div
          className="w-full flex justify-center pt-3 pb-4 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-hidden="true"
        >
          <div className="w-10 h-1 rounded-full bg-gray-300/80" />
        </div>

        {/* Carousel — padding-bottom trick locks 4:3 regardless of flex context */}
        <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ paddingBottom: "75%" }}>
          <div className="absolute inset-0">
            <SiteCarousel
              slides={slides}
              siteId={site.id}
              alt={site.title}
            />
            {/* Close button — above carousel z layers */}
            <button
              onClick={closeWithAnimation}
              className="absolute top-2 right-2 z-40 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              title="Close"
            >
              <Icon name="times" size={16} />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-col px-4 pt-3 pb-2 gap-2 flex-1 min-h-0 overflow-hidden">
          {/* Title */}
          <div className="flex items-start gap-2 shrink-0">
            <h2 className="flex-1 min-w-0 text-lg font-bold text-[var(--brand-blue)] leading-tight truncate">
              {site.title}
            </h2>
          </div>

          {/* Rating + type + location */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {site.avg_rating != null && (
              <span className="px-2 py-0.5 rounded-full bg-[#00b78b] text-white text-xs font-semibold inline-flex items-center gap-1">
                <Icon name="star" size={11} />
                {site.avg_rating.toFixed(1)}
              </span>
            )}
            {site.heritage_type && (
              <span className="px-2 py-0.5 rounded-full bg-[#F78300]/10 text-[#F78300] font-medium text-xs">
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
            <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 shrink-0">
              {site.tagline}
            </p>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Open Site */}
          <Link
            href={detailHref}
            className="shrink-0 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Open Site
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
