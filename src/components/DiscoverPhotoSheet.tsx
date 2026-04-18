"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DiscoverPhoto } from "@/app/api/discover/route";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import CollectHeart from "@/components/CollectHeart";
import { useCollections } from "@/components/CollectionsProvider";
import { computeDedupeKey } from "@/lib/collections";
import { motion } from "framer-motion";
import { hapticSuccess } from "@/lib/haptics";
import Icon from "@/components/Icon";

// ─── Save button ──────────────────────────────────────────────────────────────

function SavePhotoButton({
  siteImageId, storagePath, imageUrl, siteId, altText,
}: {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | null;
  altText?: string | null;
}) {
  const { collected, toggleCollect, isLoaded } = useCollections();
  const [popping, setPopping] = useState(false);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = (() => {
    try { return computeDedupeKey({ siteImageId: siteImageId ?? undefined, storagePath: storagePath ?? undefined, imageUrl: imageUrl ?? undefined }); }
    catch { return null; }
  })();
  const saved = key ? isLoaded && collected.has(key) : false;

  useEffect(() => () => { if (popTimerRef.current) clearTimeout(popTimerRef.current); }, []);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!key) return;
    void hapticSuccess();
    setPopping(true);
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    popTimerRef.current = setTimeout(() => setPopping(false), 150);
    await toggleCollect({ siteImageId: siteImageId ?? undefined, storagePath: storagePath ?? undefined, imageUrl: imageUrl ?? undefined, siteId: siteId ?? undefined, altText: altText ?? null, caption: null, credit: null });
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      animate={popping ? { scale: 1.08 } : { scale: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors ${
        saved ? "text-white active:opacity-80" : "bg-stone-100 text-stone-600 active:bg-stone-200"
      }`}
      style={saved ? { backgroundColor: "var(--brand-orange)" } : undefined}
    >
      <svg viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
      <span className="text-[11px] font-semibold">{saved ? "Saved" : "Save"}</span>
    </motion.button>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoverPhotoSheetProps {
  photo: DiscoverPhoto | null;
  originRect: DOMRect | null;
  thumbUrl?: string | null;
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

const DiscoverPhotoSheet = memo(function DiscoverPhotoSheet({
  photo,
  originRect,
  thumbUrl,
  onClose,
}: DiscoverPhotoSheetProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = photo !== null;

  const lgUrl = (() => {
    if (!photo) return "";
    if (photo.storagePath) {
      try { return getVariantPublicUrl(photo.storagePath, "lg"); } catch {}
    }
    return photo.url;
  })();

  useEffect(() => { setMounted(true); }, []);


  const closeWithAnimation = useCallback(() => {
    if (closeTimerRef.current) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 320);
  }, [onClose]);

  const handleClosePress = useCallback(() => {
    closeWithAnimation();
  }, [closeWithAnimation]);

  async function handleOpenSite() {
    if (!photo) return;
    void hapticMedium();
    const href = photo.regionSlug
      ? `/heritage/${photo.regionSlug}/${photo.siteSlug}`
      : `/heritage/${photo.siteSlug}`;
    closeWithAnimation();
    router.push(href);
  }

  async function handleDownload() {
    if (!photo || downloading) return;
    void hapticLight();
    setDownloading(true);
    try {
      const url = lgUrl;
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${photo.site.name.replace(/\s+/g, "-").toLowerCase()}.${blob.type.includes("png") ? "png" : "jpg"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {}
    setDownloading(false);
  }

  async function handleShare() {
    if (!photo) return;
    void hapticLight();
    const url = `${window.location.origin}/heritage/${photo.regionSlug}/${photo.siteSlug}`;
    if (navigator.share) {
      try { await navigator.share({ title: photo.site.name, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); } catch {}
    }
  }

  if (!mounted || !photo) return null;

  const site = photo.site;
  const isPortrait = !!(photo.width && photo.height && photo.height > photo.width);
  const imgAspectPb = isPortrait ? "125%" : "80%";

  const displayThumb = thumbUrl ?? lgUrl;

  const OPEN_TRANSITION  = { type: "tween", duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;
  const CLOSE_TRANSITION = { type: "tween", duration: 0.30, ease: [0.4, 0, 0.6, 1] } as const;

  const modal = createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[3500]"
        style={{
          backgroundColor: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={isOpen ? { duration: 0.42, ease: [0.22, 1, 0.36, 1] } : { duration: 0.28, ease: [0.4, 0, 1, 1] }}
        onPointerDown={handleClosePress}
        aria-hidden="true"
      />

      {/* Card — scales from tap origin */}
      <div
        className="fixed inset-0 z-[3510] flex items-center justify-center px-5 pointer-events-none"
        aria-modal="true"
        role="dialog"
        aria-label="Photo details"
      >
        <motion.div
          className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl pointer-events-auto overflow-hidden"
          style={{
            maxHeight: "90dvh",
            display: "flex",
            flexDirection: "column",
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: isOpen ? 1 : 0.95, opacity: isOpen ? 1 : 0 }}
          transition={isOpen ? OPEN_TRANSITION : CLOSE_TRANSITION}
        >
          {/* Image */}
          <div className="relative w-full shrink-0" style={{ paddingBottom: imgAspectPb }}>
            <div className="absolute inset-0">
              {/* Thumb shown instantly (already in browser cache from tile) */}
              <img
                src={displayThumb}
                alt={photo.caption ?? site.name}
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
              />
              {/* lg variant fades in on top once loaded */}
              {lgUrl !== displayThumb && (
                <img
                  src={lgUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ opacity: 0, transition: "opacity 0.35s ease" }}
                  loading="eager"
                  onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                />
              )}
              <button
                onClick={handleClosePress}
                className="absolute top-2.5 left-2.5 z-40 w-8 h-8 flex items-center justify-center bg-black/45 text-white rounded-full active:bg-black/70 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
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

          {/* Info */}
          <div className="px-4 pt-3 pb-1.5 shrink-0">
            {photo.caption && (
              <p className="text-stone-500 text-[12px] leading-snug mb-2 line-clamp-2">
                {photo.caption}
              </p>
            )}
            <h2 className="text-[17px] font-bold text-[var(--brand-blue)] leading-tight truncate">
              {site.name}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {site.avgRating != null && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--brand-green)] text-white text-[10.5px] font-semibold inline-flex items-center gap-1">
                  <Icon name="star" size={9} />
                  {site.avgRating.toFixed(1)}
                  {(site.reviewCount ?? 0) > 0 && <span className="opacity-80">· {site.reviewCount}</span>}
                </span>
              )}
              {site.heritageType && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-medium text-[10.5px]">
                  {site.heritageType}
                </span>
              )}
              {site.location && (
                <span className="flex items-center gap-0.5 text-gray-400 text-[10.5px]">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 shrink-0">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  {site.location}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 pt-2 pb-4 flex gap-2 shrink-0">
            {/* Open Site */}
            <button
              type="button"
              onClick={() => { void handleOpenSite(); }}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M13 6l6 6-6 6" />
              </svg>
              <span className="text-[11px] font-semibold">Open</span>
            </button>

            {/* Save */}
            <SavePhotoButton
              siteImageId={photo.id}
              storagePath={photo.storagePath}
              imageUrl={photo.url}
              siteId={site.id}
              altText={photo.caption}
            />

            {/* Download */}
            <button
              type="button"
              onClick={() => { void handleDownload(); }}
              disabled={downloading}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 3v12" />
                </svg>
              )}
              <span className="text-[11px] font-semibold">Download</span>
            </button>

            {/* Share */}
            <button
              type="button"
              onClick={() => { void handleShare(); }}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl bg-stone-100 text-stone-600 active:bg-stone-200 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span className="text-[11px] font-semibold">Share</span>
            </button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body
  );

  return modal;
});

export default DiscoverPhotoSheet;
