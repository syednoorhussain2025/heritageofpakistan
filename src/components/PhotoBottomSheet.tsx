"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAnimate } from "framer-motion";
import { useCollections } from "@/components/CollectionsProvider";
import { computeDedupeKey } from "@/lib/collections";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { useRouter } from "next/navigation";
import type { DiscoverPhoto } from "@/app/api/discover/route";

type Props = {
  photo: DiscoverPhoto | null;
  originRect: DOMRect | null;
  originThumb: string | null;
  onClose: () => void;
};

const ANIM_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const ANIM_DURATION = 0.48;

export default function PhotoBottomSheet({ photo, originRect, originThumb, onClose }: Props) {
  const router = useRouter();
  const { collected, toggleCollect, isLoaded } = useCollections();

  // Overlay: the zoom-clone that animates from tile to card position
  const [overlayScope, animateOverlay] = useAnimate();
  // The real card (hidden behind overlay until animation + image load)
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const expandDoneRef = useRef(!originRect);
  const imageLoadedRef = useRef(false);
  const overlayHiddenRef = useRef(false);

  const isOpen = photo !== null;

  const dedupeKey = photo
    ? (() => {
        try {
          return computeDedupeKey({
            siteImageId: photo.id ?? undefined,
            storagePath: photo.storagePath ?? undefined,
            imageUrl: photo.url ?? undefined,
          });
        } catch {
          return null;
        }
      })()
    : null;

  const isCollected = dedupeKey ? isLoaded && collected.has(dedupeKey) : false;

  const tryHideOverlay = useCallback(() => {
    if (!overlayHiddenRef.current && expandDoneRef.current && imageLoadedRef.current) {
      overlayHiddenRef.current = true;
      if (cardRef.current) cardRef.current.style.visibility = "visible";
      if (overlayScope.current) overlayScope.current.style.display = "none";
    }
  }, [overlayScope]);

  // Run zoom animation whenever a new photo is opened
  useEffect(() => {
    if (!photo || !originRect) {
      // No origin rect — just show card immediately
      expandDoneRef.current = true;
      imageLoadedRef.current = false;
      overlayHiddenRef.current = false;
      if (cardRef.current) cardRef.current.style.visibility = "visible";
      return;
    }

    // Reset flags for new open
    expandDoneRef.current = false;
    imageLoadedRef.current = false;
    overlayHiddenRef.current = false;
    if (cardRef.current) cardRef.current.style.visibility = "hidden";

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMd = vw >= 768;

    // Card target dimensions
    const pad = isMd ? 32 : 16;
    const cardW = Math.min(vw - pad * 2, 480);

    // Photo aspect ratio for the image portion (capped at 60vh)
    const nw = photo.width && photo.width > 0 ? photo.width : 4;
    const nh = photo.height && photo.height > 0 ? photo.height : 3;
    const photoH = Math.min((cardW * nh) / nw, vh * 0.55);

    // Total card height: photo + info area (~140px)
    const cardH = photoH + 148;

    // Center horizontally, position from top ~15% down
    const cardLeft = (vw - cardW) / 2;
    const cardTop = Math.max((vh - cardH) / 2 - 20, vh * 0.1);

    // Animate the overlay clone from tile rect to card rect
    void animateOverlay(
      overlayScope.current,
      {
        left: cardLeft,
        top: cardTop,
        width: cardW,
        height: photoH,
        borderRadius: 16,
      },
      { duration: ANIM_DURATION, ease: ANIM_EASE }
    ).then(() => {
      expandDoneRef.current = true;
      tryHideOverlay();
    });

    // Fade in backdrop
    if (backdropRef.current) {
      backdropRef.current.style.opacity = "0";
      backdropRef.current.style.transition = `opacity ${ANIM_DURATION}s ease`;
      requestAnimationFrame(() => {
        if (backdropRef.current) backdropRef.current.style.opacity = "1";
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  const handleImgLoad = useCallback(() => {
    imageLoadedRef.current = true;
    tryHideOverlay();
  }, [tryHideOverlay]);

  const handleCollect = useCallback(async () => {
    if (!photo) return;
    void hapticSuccess();
    await toggleCollect({
      siteImageId: photo.id ?? undefined,
      storagePath: photo.storagePath ?? undefined,
      imageUrl: photo.url ?? undefined,
      siteId: photo.site.id,
      altText: photo.caption ?? undefined,
    });
  }, [photo, toggleCollect]);

  const handleOpenSite = useCallback(() => {
    if (!photo) return;
    void hapticLight();
    const path = photo.regionSlug
      ? `/heritage/${photo.regionSlug}/${photo.siteSlug}`
      : `/heritage/${photo.siteSlug}`;
    router.push(path);
    onClose();
  }, [photo, router, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  const isMd = vw >= 768;
  const pad = isMd ? 32 : 16;
  const cardW = Math.min(vw - pad * 2, 480);
  const nw = photo.width && photo.width > 0 ? photo.width : 4;
  const nh = photo.height && photo.height > 0 ? photo.height : 3;
  const photoH = Math.min((cardW * nh) / nw, vh * 0.55);
  const cardLeft = (vw - cardW) / 2;
  const cardTop = Math.max((vh - (photoH + 148)) / 2 - 20, vh * 0.1);

  return (
    <div className="fixed inset-0 z-[200] pointer-events-auto">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/60"
        style={{ opacity: originRect ? 0 : 1 }}
        onClick={handleClose}
      />

      {/* Zoom overlay clone (thumbnail animating from tile position) */}
      {originRect && originThumb && (
        <div
          ref={overlayScope}
          className="fixed overflow-hidden pointer-events-none"
          style={{
            zIndex: 10,
            left: originRect.left,
            top: originRect.top,
            width: originRect.width,
            height: originRect.height,
            borderRadius: 16,
          }}
        >
          <img
            src={originThumb}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}

      {/* Real card */}
      <div
        ref={cardRef}
        className="absolute overflow-hidden rounded-2xl shadow-2xl bg-[#1a1714] flex flex-col"
        style={{
          left: cardLeft,
          top: cardTop,
          width: cardW,
          visibility: originRect ? "hidden" : "visible",
          zIndex: 20,
        }}
      >
        {/* Photo */}
        <div className="relative overflow-hidden flex-shrink-0" style={{ height: photoH }}>
          <img
            ref={imgRef}
            src={photo.url}
            alt={photo.caption ?? photo.site.name}
            onLoad={handleImgLoad}
            onError={handleImgLoad}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 bg-black/50 rounded-full p-1.5 text-white/90 active:text-white z-10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info + actions */}
        <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
          <div>
            {photo.caption && (
              <p className="text-white/60 text-[12px] italic leading-snug mb-1 line-clamp-2">
                {photo.caption}
              </p>
            )}
            <p className="text-white text-[15px] font-semibold leading-tight">
              {photo.site.name}
            </p>
            {photo.site.location && (
              <p className="text-white/50 text-[12px] mt-0.5 leading-tight">
                {photo.site.location}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5">
            <button
              onClick={handleCollect}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-white/20 py-2.5 text-[13px] font-semibold text-white active:bg-white/10 transition-colors"
              style={{ background: isCollected ? "rgba(234,88,12,0.18)" : "transparent", borderColor: isCollected ? "rgb(234,88,12)" : undefined }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill={isCollected ? "rgb(234,88,12)" : "none"} stroke={isCollected ? "rgb(234,88,12)" : "currentColor"} strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              {isCollected ? "Collected" : "Add to Collection"}
            </button>

            <button
              onClick={handleOpenSite}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold text-white active:opacity-80 transition-opacity"
              style={{ background: "rgb(234,88,12)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open Site
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
