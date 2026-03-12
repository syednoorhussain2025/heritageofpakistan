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

  // slides[0] = thumb (shown immediately); rest loaded progressively after open
  const [slides, setSlides] = useState<string[]>([]);

  useEffect(() => { setMounted(true); }, []);

  // Build slide list when site changes:
  // 1. Immediately put the thumb as slide[0] — no waiting
  // 2. After sheet opens, fetch the remaining slideshow images in the background
  useEffect(() => {
    if (!site) { setSlides([]); return; }

    const thumbUrl =
      site.cover_photo_thumb_url ||
      getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") ||
      site.cover_photo_url ||
      null;

    // Show thumb immediately — carousel renders right away
    setSlides(thumbUrl ? [thumbUrl] : []);

    const ids = site.cover_slideshow_image_ids;
    if (!ids?.length) return; // no slideshow — thumb is enough

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

        // Replace thumb with full-res first image, append the rest
        // If the thumb URL happens to be one of them already, de-dupe
        setSlides((prev) => {
          const thumb = prev[0] ?? null;
          // Use full-res for slide 0 too — browser will use cached decode
          const all = rest;
          // If thumb is different from rest[0], keep thumb as first until rest[0] loads
          // by prepending it only if it's not already there
          if (thumb && thumb !== all[0]) {
            return [thumb, ...all];
          }
          return all;
        });
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
        className={`absolute left-0 right-0 bottom-0 top-[20%] bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${sheetVisible ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-gray-300/80 mx-auto mt-3 mb-6 shrink-0" aria-hidden="true" />

        {/* Carousel — padding-bottom trick locks 4:3 regardless of flex context */}
        <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ paddingBottom: "75%" }}>
          <div className="absolute inset-0">
            <SiteCarousel
              slides={slides}
              blurDataUrl={site.cover_blur_data_url}
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
