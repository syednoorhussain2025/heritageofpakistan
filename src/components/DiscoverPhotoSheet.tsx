"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DiscoverPhoto } from "@/app/api/discover/route";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { useCollections } from "@/components/CollectionsProvider";
import { computeDedupeKey } from "@/lib/collections";
import { motion } from "framer-motion";
import { hapticSuccess } from "@/lib/haptics";

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
  onCloseStart?: () => void;
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

const DiscoverPhotoSheet = memo(function DiscoverPhotoSheet({
  photo,
  originRect,
  thumbUrl,
  onCloseStart,
  onClose,
}: DiscoverPhotoSheetProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhotoRef = useRef<typeof photo>(null);

  // Keep last known photo alive during close animation
  if (photo) lastPhotoRef.current = photo;
  const activePhoto = photo ?? lastPhotoRef.current;

  const lgUrl = (() => {
    if (!activePhoto) return "";
    if (activePhoto.storagePath) {
      try { return getVariantPublicUrl(activePhoto.storagePath, "lg"); } catch {}
    }
    return activePhoto.url;
  })();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Compute transformOrigin relative to the card's final centered position.
  // The card is centered in the viewport, so card center = viewport center.
  // We express the tile's center as an offset from the card's center.
  const transformOrigin = (() => {
    if (!originRect) return "center center";
    const vpCx = window.innerWidth / 2;
    const vpCy = window.innerHeight / 2;
    const tileCx = originRect.left + originRect.width / 2;
    const tileCy = originRect.top + originRect.height / 2;
    // offset from card center, expressed as px relative to card top-left
    // card is ~384px wide, ~auto height — use 50%+offset form
    const dx = tileCx - vpCx;
    const dy = tileCy - vpCy;
    return `calc(50% + ${dx}px) calc(50% + ${dy}px)`;
  })();

  // Drive visibility from photo prop
  useEffect(() => {
    if (photo) setIsVisible(true);
  }, [photo]);

  const closeWithAnimation = useCallback(() => {
    if (closeTimerRef.current) return;
    setIsVisible(false);
    onCloseStart?.();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      lastPhotoRef.current = null;
      onClose();
    }, 400);
  }, [onClose, onCloseStart]);

  const handleClosePress = useCallback(() => {
    closeWithAnimation();
  }, [closeWithAnimation]);

  async function handleOpenSite() {
    if (!activePhoto) return;
    void hapticMedium();
    const href = activePhoto.regionSlug
      ? `/heritage/${activePhoto.regionSlug}/${activePhoto.siteSlug}`
      : `/heritage/${activePhoto.siteSlug}`;
    closeWithAnimation();
    router.push(href);
  }

  async function handleDownload() {
    if (!activePhoto || downloading) return;
    void hapticLight();
    setDownloading(true);
    const downloadUrl = activePhoto.storagePath
      ? getVariantPublicUrl(activePhoto.storagePath, "hero")
      : lgUrl;
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const fileName = `${activePhoto.site.name.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
      const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
      if (isNative) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
        await Share.share({ title: activePhoto.site.name, files: [written.uri] });
        showToast("Saved to Photos");
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch {}
    setDownloading(false);
  }

  async function handleShare() {
    if (!activePhoto) return;
    void hapticLight();
    const siteUrl = `${window.location.origin}/heritage/${activePhoto.regionSlug ? `${activePhoto.regionSlug}/` : ""}${activePhoto.siteSlug}`;
    const shareData = {
      title: activePhoto.site.name,
      text: activePhoto.caption ? `${activePhoto.caption} — ${activePhoto.site.name}` : activePhoto.site.name,
      url: siteUrl,
    };
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share(shareData);
    } catch {
      if (navigator.share) {
        try { await navigator.share(shareData); } catch {}
      } else {
        try { await navigator.clipboard.writeText(siteUrl); } catch {}
      }
    }
  }

  if (!mounted || !activePhoto) return null;

  const site = activePhoto.site;
  const isPortrait = !!(activePhoto.width && activePhoto.height && activePhoto.height > activePhoto.width);
  const imgAspectPb = isPortrait ? "125%" : undefined;
  const imgHeight = isPortrait ? undefined : "280px";

  const displayThumb = thumbUrl ?? lgUrl;

  const OPEN_TRANSITION  = { type: "tween", duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;
  const CLOSE_TRANSITION = { type: "tween", duration: 0.38, ease: [0.64, 0, 0.78, 0] } as const;

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
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={isVisible ? { duration: 0.42, ease: [0.22, 1, 0.36, 1] } : { duration: 0.38, ease: [0.64, 0, 0.78, 0] }}
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
            transformOrigin,
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: isVisible ? 1 : 0.5, opacity: isVisible ? 1 : 0 }}
          transition={isVisible ? OPEN_TRANSITION : CLOSE_TRANSITION}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0}
          dragMomentum={false}
          onDrag={(_, info) => {
            if (Math.abs(info.offset.y) > 40 || Math.abs(info.velocity.y) > 300) {
              handleClosePress();
            }
          }}
        >
          {/* Image */}
          <div className="relative w-full shrink-0 overflow-hidden" style={{ height: imgHeight, paddingBottom: imgAspectPb }}>
            <div className="absolute inset-0" style={{ bottom: "-8%" }}>
              {/* Thumb shown instantly (already in browser cache from tile) */}
              <img
                src={displayThumb}
                alt={activePhoto.caption ?? site.name}
                className="absolute inset-0 w-full h-full object-cover object-top"
                loading="eager"
              />
              {/* lg variant fades in on top once loaded */}
              {lgUrl !== displayThumb && (
                <img
                  src={lgUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover object-top"
                  style={{ opacity: 0, transition: "opacity 0.35s ease" }}
                  loading="eager"
                  onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                />
              )}
            </div>
          </div>

          {/* Info */}
          <div className="px-4 pt-3 pb-1.5 shrink-0">
            {activePhoto.caption && (
              <p className="text-stone-600 text-[13.5px] leading-snug mb-2 line-clamp-2">
                {activePhoto.caption}
              </p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-[16px] font-bold text-[var(--brand-blue)] leading-tight truncate">
                {site.name}
              </h2>
              {site.heritageType && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-medium text-[10.5px]">
                  {site.heritageType}
                </span>
              )}
            </div>
            {site.location && (
              <span className="flex items-center gap-0.5 text-gray-400 text-[10.5px] mt-0.5">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 shrink-0">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                {site.location}
              </span>
            )}
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
              siteImageId={activePhoto.id}
              storagePath={activePhoto.storagePath}
              imageUrl={activePhoto.url}
              siteId={site.id}
              altText={activePhoto.caption}
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

      {/* Toast */}
      <motion.div
        className="fixed bottom-8 inset-x-0 z-[3600] flex justify-center pointer-events-none"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: toast ? 1 : 0, y: toast ? 0 : 24 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-stone-900/90 text-white text-[13px] font-semibold shadow-xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-green-400 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      </motion.div>
    </>,
    document.body
  );

  return modal;
});

export default DiscoverPhotoSheet;
