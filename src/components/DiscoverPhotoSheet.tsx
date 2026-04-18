"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DiscoverPhoto } from "@/app/api/discover/route";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import CollectHeart from "@/components/CollectHeart";
import Icon from "@/components/Icon";

interface Props {
  photo: DiscoverPhoto | null;
  onClose: () => void;
}

const DiscoverPhotoSheet = memo(function DiscoverPhotoSheet({ photo, onClose }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const isOpen = photo !== null;

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // Swipe-to-close
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      setClosing(false);
      return;
    }
    void hapticMedium();
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
    void hapticLight();
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

    if (dy >= 80 || velocity >= 0.4) {
      void hapticLight();
      setClosing(true);
      if (el) el.style.transform = "translateY(100%)";
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setClosing(false);
        onClose();
        if (el) el.style.transform = "";
      }, 300);
    } else {
      if (el) el.style.transform = "translateY(0)";
    }

    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [onClose]);

  async function handleViewSite() {
    if (!photo) return;
    void hapticMedium();
    const regionSlug = photo.regionSlug;
    const siteSlug = photo.siteSlug;
    const href = regionSlug
      ? `/heritage/${regionSlug}/${siteSlug}`
      : `/heritage/${siteSlug}`;
    closeWithAnimation();
    router.push(href);
  }

  if (!mounted || (!isOpen && !closing) || !photo) return null;

  const sheetVisible = visible && !closing;
  const site = photo.site;

  // Best quality URL for the tapped photo
  const photoUrl = (() => {
    if (photo.storagePath) {
      try { return getVariantPublicUrl(photo.storagePath, "lg"); } catch {}
    }
    return photo.url;
  })();

  const sheet = createPortal(
    <div
      className="lg:hidden fixed inset-x-0 bottom-0 z-[3500] touch-none"
      style={{ top: 0, height: "100dvh" }}
      aria-modal="true"
      role="dialog"
      aria-label="Photo details"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out ${sheetVisible ? "opacity-100" : "opacity-0"}`}
        onClick={closeWithAnimation}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${sheetVisible ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="w-full flex justify-center pt-3 pb-0 shrink-0" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-gray-300/80" />
        </div>

        {/* Photo — 4:3 aspect, rounded, with close button */}
        <div className="relative mx-3 mt-3 rounded-2xl overflow-hidden shrink-0" style={{ paddingBottom: "75%" }}>
          <div className="absolute inset-0">
            {/* Blur placeholder */}
            {photo.blurDataURL && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${photo.blurDataURL})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(12px)",
                  transform: "scale(1.08)",
                }}
              />
            )}
            <img
              src={photoUrl}
              alt={photo.caption ?? site.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
            />
            {/* Bottom gradient for caption legibility */}
            {photo.caption && (
              <div
                className="absolute inset-x-0 bottom-0 px-3 pt-10 pb-3"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)" }}
              >
                <p className="text-white text-[12px] font-medium leading-snug line-clamp-2"
                  style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
                  {photo.caption}
                </p>
              </div>
            )}
            {/* Close button */}
            <button
              onClick={closeWithAnimation}
              className="absolute top-2.5 right-2.5 z-40 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full"
              title="Close"
            >
              <Icon name="times" size={15} />
            </button>
            {/* Collect heart */}
            <CollectHeart
              siteImageId={photo.id}
              storagePath={photo.storagePath}
              imageUrl={photo.url}
              siteId={site.id}
              altText={photo.caption}
              variant="overlay"
              size={20}
            />
          </div>
        </div>

        {/* Site info */}
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2">
          {/* Site name */}
          <h2 className="text-[18px] font-bold text-[var(--brand-blue)] leading-tight">
            {site.name}
          </h2>

          {/* Badges: rating + heritage type + location */}
          <div className="flex flex-wrap items-center gap-1.5">
            {site.avgRating != null && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--brand-green)] text-white text-[11px] font-semibold inline-flex items-center gap-1">
                <Icon name="star" size={10} />
                {site.avgRating.toFixed(1)}
                {site.reviewCount != null && site.reviewCount > 0 && (
                  <span className="opacity-80">· {site.reviewCount}</span>
                )}
              </span>
            )}
            {site.heritageType && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-medium text-[11px]">
                {site.heritageType}
              </span>
            )}
            {site.location && (
              <span className="flex items-center gap-1 text-gray-500 text-[11px]">
                <Icon name="map-marker-alt" size={10} />
                {site.location}
              </span>
            )}
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={() => { void handleViewSite(); }}
            className="mt-1 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-semibold text-[14px] active:scale-95 transition-transform"
          >
            View Full Site
            <Icon name="arrow-right" size={13} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return sheet;
});

export default DiscoverPhotoSheet;
