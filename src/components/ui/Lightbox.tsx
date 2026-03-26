"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import NextImage from "next/image";
import { motion, AnimatePresence, PanInfo, useAnimate } from "framer-motion";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { LightboxPhoto } from "../../types/lightbox";
import Icon from "../Icon";
import { decode } from "blurhash";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import CollectHeart from "@/components/CollectHeart";
import { useSignedInActions } from "@/hooks/useSignedInActions";

/* ---------- Mobile carousel helpers ---------- */
const CAROUSEL_EASE = "cubic-bezier(0.25,0.46,0.45,0.94)";
const CAROUSEL_DURATION = "0.4s";

function applyTrackTransform(
  el: HTMLDivElement,
  dx: number,
  atIdx: number,
  animated: boolean
) {
  const vw = window.innerWidth;
  const offset = -atIdx * vw + dx;
  el.style.transition = animated
    ? `transform ${CAROUSEL_DURATION} ${CAROUSEL_EASE}`
    : "none";
  el.style.transform = `translateX(${offset}px)`;
}

/* ---------- CONFIG ---------- */
const PANEL_W = 264;
const GAP = 20;
const PADDING = 24;
const MAX_VH = { base: 76, md: 84, lg: 88 };
const PROGRAMMATIC_ZOOM_MAX_RETRIES = 6;
const PROGRAMMATIC_ZOOM_RETRY_MS = 80;
const PROGRAMMATIC_ZOOM_VERIFY_MS = 260;

// --- CUSTOM TEXT CONFIG ---
const PHOTO_CREDIT = "Photo by Heritage of Pakistan ©";

/* ---------- SWIPE LOGIC ---------- */
const SWIPE_THRESHOLD = 600;

const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

/* ---------- BlurHash Component ---------- */
type BlurhashPlaceholderProps = {
  hash: string;
  aspectRatio: number;
};

function BlurhashPlaceholder({ hash, aspectRatio }: BlurhashPlaceholderProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) return;
    const BASE = 32;
    let width = BASE;
    let height = BASE;

    if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
      if (aspectRatio >= 1) {
        width = BASE;
        height = Math.max(1, Math.round(BASE / aspectRatio));
      } else {
        height = BASE;
        width = Math.max(1, Math.round(BASE * aspectRatio));
      }
    }

    const pixels = decode(hash, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    setUrl(canvas.toDataURL());
  }, [hash, aspectRatio]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt="blurhash preview"
      className="w-full h-full object-contain"
    />
  );
}

/* ---------- Types ---------- */
type SiteTaxonomy = {
  heritageTypes?: string[] | null;
  architecturalStyles?: string[] | null;
  architecturalFeatures?: string[] | null;
  historicalPeriods?: string[] | null;
};

type LightboxPhotoWithExtras = LightboxPhoto & {
  siteImageId?: string | null;
  width?: number | null;
  height?: number | null;
  blurHash?: string | null;
  site?: LightboxPhoto["site"] & { taxonomy?: SiteTaxonomy };
};

type LightboxProps = {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
  onBookmarkToggle?: (photo: LightboxPhoto) => void;
  onAddToCollection?: (photo: LightboxPhoto) => void;
  originRect?: DOMRect | null;
  originThumb?: string | null;
};

/* =======================================================
   LIGHTBOX COMPONENT
======================================================= */

export function Lightbox({
  photos,
  startIndex,
  onClose,
  onAddToCollection,
  originRect,
  originThumb,
}: LightboxProps) {
  const { ensureSignedIn } = useSignedInActions();
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  // Mobile swipe carousel
  const mobileTrackRef = useRef<HTMLDivElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const touchDxRef = useRef(0);
  const gestureLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const currentIndexRef = useRef(startIndex);

  const safeCurrentIndex =
    photos.length > 0
      ? ((currentIndex % photos.length) + photos.length) % photos.length
      : 0;
  const photo = useMemo<LightboxPhotoWithExtras>(
    () =>
      (photos[safeCurrentIndex] as LightboxPhotoWithExtras | undefined) ??
      ({} as LightboxPhotoWithExtras),
    [photos, safeCurrentIndex]
  );

  // Zoom Refs and State
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const zoomTimerRef = useRef<number | null>(null);
  const zoomVerifyTimerRef = useRef<number | null>(null);

  // Tracks the timestamp of the last *ZOOM* interaction
  const lastZoomAction = useRef<number>(0);

  const [isZoomed, setIsZoomed] = useState(false);
  const [showHighRes, setShowHighRes] = useState(false);
  const [isHighResLoading, setIsHighResLoading] = useState(false);

  // Shared-element expand: imperatively animated overlay
  const [overlayScope, animateOverlay] = useAnimate();
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const expandDoneRef = useRef(!originRect);
  const imageLoadedRef = useRef(false);
  const overlayHiddenRef = useRef(false);

  const tryHideOverlay = useCallback(() => {
    if (!overlayHiddenRef.current && expandDoneRef.current && imageLoadedRef.current) {
      overlayHiddenRef.current = true;
      // Reveal image container and hide overlay in the same frame — no gap
      if (imgContainerRef.current) imgContainerRef.current.style.visibility = "visible";
      if (overlayScope.current) overlayScope.current.style.display = "none";
    }
  }, [overlayScope]);

  useEffect(() => {
    if (!originRect || !originThumb) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMd = vw >= 768;
    const isLg = vw >= 1024;
    const nw = (photo?.width && photo.width > 0) ? photo.width : 4;
    const nh = (photo?.height && photo.height > 0) ? photo.height : 3;
    const pad = isMd ? PADDING : 16;
    const maxH = vh * ((isLg ? MAX_VH.lg : isMd ? MAX_VH.md : MAX_VH.base) / 100);
    const usableW = isMd ? vw - pad * 2 - (PANEL_W + GAP) : vw - pad * 2;
    const scale = Math.min(usableW / nw, maxH / nh);
    const imgW = nw * scale;
    const imgH = nh * scale;
    const totalW = isMd ? imgW + GAP + PANEL_W : imgW;
    const imgLeft = Math.round((vw - totalW) / 2);
    const imgTop = Math.round((vh - imgH) / 2);

    void animateOverlay(overlayScope.current, {
      left: imgLeft,
      top: imgTop,
      width: imgW,
      height: imgH,
      borderRadius: 0,
    }, { duration: 0.52, ease: [0.32, 0.72, 0, 1] }).then(() => {
      expandDoneRef.current = true;
      tryHideOverlay();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tracks if the hi-res image has finished decoding to fade it in
  const [isHighResReady, setIsHighResReady] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    return () => {
      if (zoomTimerRef.current !== null) {
        window.clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = null;
      }
      if (zoomVerifyTimerRef.current !== null) {
        window.clearTimeout(zoomVerifyTimerRef.current);
        zoomVerifyTimerRef.current = null;
      }
    };
  }, []);

  // Keep ref in sync and snap track position on index change
  const prevIndexRef = useRef<number | null>(null);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    if (mobileTrackRef.current) {
      const animated = prevIndexRef.current !== null;
      applyTrackTransform(mobileTrackRef.current, 0, currentIndex, animated);
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!photos.length) {
      setCurrentIndex(0);
      return;
    }
    const clamped = Math.min(Math.max(startIndex, 0), photos.length - 1);
    setCurrentIndex(clamped);
  }, [startIndex, photos.length]);

  /* ---------- Navigation Handlers ---------- */
  const resetZoom = useCallback(() => {
    if (zoomTimerRef.current !== null) {
      window.clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
    if (zoomVerifyTimerRef.current !== null) {
      window.clearTimeout(zoomVerifyTimerRef.current);
      zoomVerifyTimerRef.current = null;
    }
    if (transformRef.current) {
      transformRef.current.resetTransform();
    }
    setIsZoomed(false);
    setShowHighRes(false);
    setIsHighResLoading(false);
    setIsHighResReady(false); // Reset hi-res ready state
  }, []);

  const handleNext = useCallback(() => {
    if (isZoomed) return;
    if (!photos.length) return;
    resetZoom();
    setCurrentIndex((p) => (p + 1) % photos.length);
  }, [photos.length, resetZoom, isZoomed]);

  const handlePrev = useCallback(() => {
    if (isZoomed) return;
    if (!photos.length) return;
    resetZoom();
    setCurrentIndex((p) => (p - 1 + photos.length) % photos.length);
  }, [photos.length, resetZoom, isZoomed]);

  /* ---------- Window size ---------- */
  const [win, setWin] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const setSize = () =>
      setWin({ w: window.innerWidth, h: window.innerHeight });
    setSize();
    window.addEventListener("resize", setSize);
    return () => window.removeEventListener("resize", setSize);
  }, []);

  const isMdUp = win.w >= 768;
  const isLgUp = win.w >= 1024;

  /* ---------- Reset Loaded State on Navigation ---------- */
  useEffect(() => {
    setIsImageLoaded(false);
    setIsHighResReady(false); // Reset on nav
  }, [currentIndex]);

  /* ---------- Keyboard nav ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!photos.length) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length, handleNext, handlePrev]);

  /* ---------- Use server dimensions if present ---------- */
  const nat = useMemo(
    () => ({
      w: photo?.width && photo.width > 0 ? photo.width : 4,
      h: photo?.height && photo.height > 0 ? photo.height : 3,
    }),
    [photo?.width, photo?.height]
  );

  const aspectRatio = nat.w / nat.h;

  /* ---------- Geometry ---------- */
  const geom = useMemo(() => {
    const nw = nat.w;
    const nh = nat.h;

    const pad = isMdUp ? PADDING : 16;
    const vw = Math.max(320, win.w);
    const vh = Math.max(320, win.h);

    const maxH =
      vh * ((isLgUp ? MAX_VH.lg : isMdUp ? MAX_VH.md : MAX_VH.base) / 100);

    const usableW = isMdUp ? vw - pad * 2 - (PANEL_W + GAP) : vw - pad * 2;

    const scale = Math.min(usableW / nw, maxH / nh);
    const imgW = nw * scale;
    const imgH = nh * scale;

    const totalW = isMdUp ? imgW + GAP + PANEL_W : imgW;

    const contentLeft = Math.round((vw - totalW) / 2);
    const imgLeft = contentLeft;
    const imgTop = Math.round((vh - imgH) / 2);

    const panelLeft = isMdUp ? imgLeft + imgW + GAP : pad;
    const panelTop = isMdUp ? imgTop + imgH / 2 : imgTop + imgH + 16;

    return { imgW, imgH, imgLeft, imgTop, panelLeft, panelTop, isMdUp };
  }, [isMdUp, isLgUp, nat, win]);

  /* ---------- IMAGE URLs ---------- */

  const mediumPhotoUrl = useMemo(() => {
    if (photo?.storagePath) {
      try {
        return getVariantPublicUrl(photo.storagePath, "md");
      } catch {
        return photo.url;
      }
    }
    return photo?.url;
  }, [photo?.storagePath, photo?.url]);

  const highResPhotoUrl = useMemo(() => {
    if (photo?.storagePath) {
      try {
        return getVariantPublicUrl(photo.storagePath); // Base file (original)
      } catch {
        return photo.url;
      }
    }
    return photo?.url;
  }, [photo?.storagePath, photo?.url]);

  /* ---------- Prefetch neighbours ---------- */
  useEffect(() => {
    if (!photos.length) return;
    const preload = (p?: LightboxPhoto) => {
      if (!p) return;
      try {
        const src =
          (p as any).storagePath != null
            ? getVariantPublicUrl((p as any).storagePath, "md")
            : (p as any).url;
        const img = new window.Image();
        img.src = src;
      } catch {
        const img = new window.Image();
        img.src = (p as any).url;
      }
    };
    preload(photos[(currentIndex + 1) % photos.length]);
    preload(photos[(currentIndex - 1 + photos.length) % photos.length]);
  }, [currentIndex, photos]);

  /* ---------- Actions ---------- */
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = highResPhotoUrl || (photo as any).url;
    link.download = `heritage-site-${(photo as any).id}.jpg`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ---------- Swipe Handler ---------- */
  const onSwipe = (
    e: MouseEvent | TouchEvent | PointerEvent,
    { offset, velocity }: PanInfo
  ) => {
    const timeSinceZoom = Date.now() - lastZoomAction.current;
    if (timeSinceZoom < 500) return;

    if (transformRef.current) {
      const { scale } = transformRef.current.instance.transformState;
      if (scale > 1.01) return;
    }

    if (isZoomed) return;

    const swipeX = swipePower(offset.x, velocity.x);
    const swipeY = swipePower(offset.y, velocity.y);

    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      if (swipeX < -SWIPE_THRESHOLD || offset.x < -100) {
        handleNext();
      } else if (swipeX > SWIPE_THRESHOLD || offset.x > 100) {
        handlePrev();
      }
    } else {
      if (swipeY < -SWIPE_THRESHOLD || offset.y < -100) {
        onClose();
      }
    }
  };

  /* ---------- Zoom Events ---------- */
  const triggerHighResLoad = useCallback(() => {
    if (!showHighRes) {
      setShowHighRes(true);
      setIsHighResLoading(true);
    }
  }, [showHighRes]);

  const onZoomStart = () => {
    lastZoomAction.current = Date.now();
    triggerHighResLoad();
  };

  const onTransformed = (ref: ReactZoomPanPinchRef) => {
    if (ref.state.scale > 1.01) {
      lastZoomAction.current = Date.now();
    }

    const isNowZoomed = ref.state.scale > 1.01;
    if (isNowZoomed !== isZoomed) {
      setIsZoomed(isNowZoomed);
    }
  };

  const onInteractionStop = (ref: ReactZoomPanPinchRef) => {
    if (ref.state.scale > 1.01) {
      lastZoomAction.current = Date.now();
    }

    if (ref.state.scale <= 1.01) {
      ref.resetTransform(200);
      setIsZoomed(false);
    }
  };

  const triggerZoomIn = () => {
    lastZoomAction.current = Date.now();
    triggerHighResLoad();

    if (zoomTimerRef.current !== null) {
      window.clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
    if (zoomVerifyTimerRef.current !== null) {
      window.clearTimeout(zoomVerifyTimerRef.current);
      zoomVerifyTimerRef.current = null;
    }

    const runZoomAttempt = (attempt: number) => {
      const ref = transformRef.current;
      if (!ref?.instance) {
        if (attempt < PROGRAMMATIC_ZOOM_MAX_RETRIES) {
          zoomTimerRef.current = window.setTimeout(
            () => runZoomAttempt(attempt + 1),
            PROGRAMMATIC_ZOOM_RETRY_MS
          );
        }
        return;
      }

      zoomTimerRef.current = null;
      const prevScale = ref.instance.transformState.scale;
      ref.zoomIn(1, 500);

      zoomVerifyTimerRef.current = window.setTimeout(() => {
        const nextScale = transformRef.current?.instance?.transformState.scale;
        if (
          (nextScale ?? prevScale) <= prevScale + 0.01 &&
          attempt < PROGRAMMATIC_ZOOM_MAX_RETRIES
        ) {
          runZoomAttempt(attempt + 1);
        }
      }, PROGRAMMATIC_ZOOM_VERIFY_MS);
    };

    runZoomAttempt(0);
  };

  const handleDoubleTap = useCallback(
    () => {
      if (transformRef.current) {
        const { scale } = transformRef.current.instance.transformState;
        lastZoomAction.current = Date.now();

        if (scale > 1.05) {
          transformRef.current.resetTransform(300);
        } else {
          triggerHighResLoad();
          transformRef.current.zoomIn(1.5, 300);
        }
      }
    },
    [triggerHighResLoad]
  );

  /* ---------- Mobile carousel touch handlers (native, non-passive) ---------- */
  const isZoomedRef = useRef(isZoomed);
  useEffect(() => { isZoomedRef.current = isZoomed; }, [isZoomed]);
  const photosLengthRef = useRef(photos.length);
  useEffect(() => { photosLengthRef.current = photos.length; }, [photos.length]);

  const attachTouchListeners = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;

    const onStart = (e: TouchEvent) => {
      if (isZoomedRef.current) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      touchDxRef.current = 0;
      gestureLockedRef.current = null;
      if (mobileTrackRef.current) {
        applyTrackTransform(mobileTrackRef.current, 0, currentIndexRef.current, false);
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isZoomedRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;

      if (!gestureLockedRef.current) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          gestureLockedRef.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
        }
      }

      if (gestureLockedRef.current !== "horizontal") return;
      e.preventDefault();

      const idx = currentIndexRef.current;
      const n = photosLengthRef.current;
      let resistedDx = dx;
      if ((idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)) {
        resistedDx = dx * 0.25;
      }
      touchDxRef.current = resistedDx;
      if (mobileTrackRef.current) {
        applyTrackTransform(mobileTrackRef.current, resistedDx, idx, false);
      }
    };

    const onEnd = () => {
      if (!touchStartRef.current) return;
      const dx = touchDxRef.current;
      const elapsed = Date.now() - touchStartRef.current.t;
      const velocity = Math.abs(dx) / Math.max(elapsed, 1);
      touchStartRef.current = null;
      touchDxRef.current = 0;

      if (gestureLockedRef.current !== "horizontal") return;

      const idx = currentIndexRef.current;
      const n = photosLengthRef.current;
      const shouldNav = Math.abs(dx) > 50 || velocity > 0.4;

      if (shouldNav && dx < 0 && idx < n - 1) {
        setCurrentIndex(idx + 1);
      } else if (shouldNav && dx > 0 && idx > 0) {
        setCurrentIndex(idx - 1);
      } else {
        if (mobileTrackRef.current) {
          applyTrackTransform(mobileTrackRef.current, 0, idx, true);
        }
      }
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carouselContainerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    (mobileContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    attachTouchListeners(el);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Helpers ---------- */
  const googleMapsUrl =
    photo?.site?.latitude != null && photo?.site?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${photo.site.latitude},${photo.site.longitude}`
      : null;

  const pill = (text: string) => (
    <span
      key={text}
      className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80"
    >
      {text}
    </span>
  );

  const taxonomy = photo?.site?.taxonomy;
  const fallbackPills: string[] = useMemo(() => {
    const region = photo?.site?.region ? [photo.site.region] : [];
    const cats = Array.isArray((photo as any)?.site?.categories)
      ? (photo as any)!.site!.categories
      : [];
    return [...region, ...cats].filter(Boolean) as string[];
  }, [photo]);

  const heritageTypes = taxonomy?.heritageTypes ?? null;
  const architecturalStyles = taxonomy?.architecturalStyles ?? null;
  const architecturalFeatures = taxonomy?.architecturalFeatures ?? null;
  const historicalPeriods = taxonomy?.historicalPeriods ?? null;

  const hasStructuredTaxonomy =
    (heritageTypes?.length ?? 0) > 0 ||
    (architecturalStyles?.length ?? 0) > 0 ||
    (architecturalFeatures?.length ?? 0) > 0 ||
    (historicalPeriods?.length ?? 0) > 0;

  /* =======================================================
       RENDER
  ======================================================= */
  if (!photos.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[2147483647] ${isMdUp ? "touch-none" : ""}`}
        initial={{ opacity: originRect ? 1 : 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ backgroundColor: "rgb(5,5,5)" }}
        onClick={onClose}
        onPanEnd={isMdUp ? onSwipe : undefined}
      >
        {/* ── Shared-element thumbnail overlay — imperatively animated ── */}
        {originRect && originThumb && (
          <div
            ref={overlayScope}
            className="fixed overflow-hidden pointer-events-none"
            style={{
              zIndex: 50,
              left: originRect.left,
              top: originRect.top,
              width: originRect.width,
              height: originRect.height,
              borderRadius: 0,
              opacity: 1,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originThumb}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {/* ── Real lightbox content ── */}

        {/* ────────────── MOBILE CAROUSEL ────────────── */}
        {!isMdUp && (
          <div
            ref={carouselContainerCallbackRef}
            className="absolute inset-0 overflow-hidden"
          >
            {/* Sliding track */}
            <div
              ref={mobileTrackRef}
              className="absolute top-0 left-0 h-full flex"
              style={{
                width: `${photos.length * 100}%`,
                willChange: "transform",
              }}
            >
              {photos.map((p, idx) => {
                const pw = (p as any).width && (p as any).width > 0 ? (p as any).width : 4;
                const ph = (p as any).height && (p as any).height > 0 ? (p as any).height : 3;
                const slideVw = win.w || window.innerWidth;
                const slideVh = win.h || window.innerHeight;
                const slidePad = 16;
                const slideMaxH = slideVh * (MAX_VH.base / 100);
                const slideScale = Math.min((slideVw - slidePad * 2) / pw, slideMaxH / ph);
                const slideW = pw * slideScale;
                const slideH = ph * slideScale;
                const slideLeft = Math.round((slideVw - slideW) / 2);
                const slideTop = Math.round((slideVh - slideH) / 2);
                const isActive = idx === safeCurrentIndex;
                const pMedUrl = (p as any).storagePath
                  ? (() => { try { return getVariantPublicUrl((p as any).storagePath, "md"); } catch { return (p as any).url; } })()
                  : (p as any).url;

                return (
                  <div
                    key={(p as any).id ?? idx}
                    className="relative flex-shrink-0"
                    style={{ width: `${100 / photos.length}%`, height: "100%" }}
                  >
                    {/* Image container */}
                    <div
                      ref={isActive ? imgContainerRef : undefined}
                      className={`absolute overflow-hidden shadow-2xl pointer-events-auto ${isZoomed ? "z-50" : "z-10"}`}
                      style={{
                        visibility: isActive && originRect ? "hidden" : "visible",
                        left: isZoomed && isActive ? 0 : slideLeft,
                        top: isZoomed && isActive ? 0 : slideTop,
                        width: isZoomed && isActive ? "100%" : slideW,
                        height: isZoomed && isActive ? "100%" : slideH,
                        transition: "left 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Heart */}
                      {isActive && (
                        <div
                          className={`absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center text-white drop-shadow-md [&_svg]:w-8 [&_svg]:h-8 transition-opacity duration-300 ${isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"}`}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                        >
                          <CollectHeart
                            variant="overlay"
                            siteImageId={(photo as any).siteImageId ?? (photo as any).id}
                            storagePath={(photo as any).storagePath}
                            imageUrl={(photo as any).url}
                            siteId={photo.site?.id ?? ""}
                            caption={(photo as any).caption}
                            credit={(photo as any)?.author?.name}
                            requireSignedIn={ensureSignedIn}
                          />
                        </div>
                      )}

                      {/* BlurHash + spinner — only for active slide without shared-element */}
                      {isActive && !originRect && (p as any)?.blurHash && (
                        <div className={`absolute inset-0 bg-black/20 pointer-events-none transition-opacity duration-500 ${isImageLoaded ? "opacity-0" : "opacity-100"}`}>
                          <BlurhashPlaceholder hash={(p as any).blurHash} aspectRatio={pw / ph} />
                        </div>
                      )}
                      {isActive && !originRect && !isImageLoaded && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                          <span className="h-5 w-5 rounded-full border-2 border-white/70 border-t-transparent animate-spin" aria-hidden="true" />
                        </div>
                      )}

                      {/* Zoom wrapper (active slide only) */}
                      {isActive ? (
                        <TransformWrapper
                          ref={transformRef}
                          wheel={{ step: 0.2 }}
                          doubleClick={{ disabled: true }}
                          onZoomStart={onZoomStart}
                          onTransformed={onTransformed}
                          onZoomStop={onInteractionStop}
                          onPanningStop={onInteractionStop}
                          alignmentAnimation={{ sizeX: 0, sizeY: 0 }}
                          centerZoomedOut={true}
                          centerOnInit={true}
                          minScale={1}
                          limitToBounds={true}
                        >
                          <TransformComponent
                            wrapperStyle={{ width: "100%", height: "100%" }}
                            contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <div
                              className={`relative w-full h-full flex items-center justify-center`}
                              onDoubleClick={handleDoubleTap}
                            >
                              <NextImage
                                src={pMedUrl || ""}
                                alt={(p as any)?.caption ?? ""}
                                fill unoptimized sizes="100vw"
                                className="object-contain select-none"
                                draggable={false}
                                priority
                                onLoadingComplete={() => {
                                  setIsImageLoaded(true);
                                  imageLoadedRef.current = true;
                                  tryHideOverlay();
                                }}
                                onError={() => {
                                  setIsImageLoaded(true);
                                  imageLoadedRef.current = true;
                                  tryHideOverlay();
                                }}
                              />
                              {showHighRes && (
                                <NextImage
                                  src={highResPhotoUrl || ""}
                                  alt={(p as any)?.caption ?? ""}
                                  fill unoptimized sizes="100vw"
                                  className={`object-contain select-none absolute inset-0 transition-opacity duration-500 ease-in-out ${isHighResReady ? "opacity-100" : "opacity-0"}`}
                                  draggable={false}
                                  priority
                                  onLoadingComplete={() => { setIsHighResReady(true); setIsHighResLoading(false); }}
                                  onError={() => { setIsHighResLoading(false); }}
                                />
                              )}
                            </div>
                          </TransformComponent>
                        </TransformWrapper>
                      ) : (
                        /* Lazy non-active slides: plain image, no zoom */
                        <div className="relative w-full h-full">
                          <NextImage
                            src={pMedUrl || ""}
                            alt={(p as any)?.caption ?? ""}
                            fill unoptimized sizes="100vw"
                            className="object-contain select-none"
                            draggable={false}
                          />
                        </div>
                      )}

                      {isActive && isHighResLoading && (
                        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                          <div className="bg-black/60 backdrop-blur-sm text-white px-4 py-3 rounded-lg flex flex-col items-center gap-2">
                            <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="text-xs font-medium">Loading High Res</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ────────────── DESKTOP CONTENT (AnimatePresence fade) ────────────── */}
        {isMdUp && (
        <AnimatePresence mode="wait">
          <motion.div
            key={(photo as any)?.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {/* 1. HEADER (desktop: above image) */}
            <div
              className={`absolute z-20 pointer-events-auto transition-opacity duration-300 ${
                isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
              style={{
                left: geom.imgLeft,
                width: geom.imgW,
                top: geom.imgTop - 12,
                transform: "translateY(-100%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex text-white justify-between items-end gap-4">
                <div>
                  <h3 className="font-bold text-xl leading-tight">{photo?.site?.name}</h3>
                  {(photo as any)?.site?.location && (
                    <p className="text-sm text-gray-300 mt-1 flex items-center">
                      {(photo as any).site.location}
                      {googleMapsUrl && (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 p-1 rounded-full bg-white/10 hover:bg-white/20 hover:text-white transition-colors flex items-center justify-center"
                          title="View on Google Maps"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="map-marker-alt" className="w-3 h-3" />
                        </a>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center justify-end">
                  <p className="text-xs text-gray-400">{PHOTO_CREDIT}</p>
                </div>
              </div>
            </div>

            {/* 2. IMAGE CONTAINER */}
            <div
              ref={imgContainerRef}
              className={`absolute overflow-hidden shadow-2xl pointer-events-auto ${
                isZoomed ? "z-50" : "z-10"
              } ${originRect ? "" : "bg-black/20 rounded-2xl"}`}
              style={{
                visibility: originRect ? "hidden" : "visible",
                left: isZoomed ? 0 : geom.imgLeft,
                top: isZoomed ? 0 : geom.imgTop,
                width: isZoomed ? "100%" : geom.imgW,
                height: isZoomed ? "100%" : geom.imgH,
                transition: "left 0.4s cubic-bezier(0.22,1,0.36,1), top 0.4s cubic-bezier(0.22,1,0.36,1), width 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1), border-radius 0.4s cubic-bezier(0.22,1,0.36,1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Heart Button */}
              <div
                className={`absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center text-white drop-shadow-md [&_svg]:w-8 [&_svg]:h-8 transition-opacity duration-300 ${
                  isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
                onClick={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                <CollectHeart
                  variant="overlay"
                  siteImageId={(photo as any).siteImageId ?? (photo as any).id}
                  storagePath={(photo as any).storagePath}
                  imageUrl={(photo as any).url}
                  siteId={photo.site?.id ?? ""}
                  caption={(photo as any).caption}
                  credit={(photo as any)?.author?.name}
                  requireSignedIn={ensureSignedIn}
                />
              </div>

              {/* BlurHash + spinner — only when no thumbnail overlay (no shared element open) */}
              {!originRect && (photo as any)?.blurHash && (
                <div
                  className={`absolute inset-0 bg-black/20 pointer-events-none transition-opacity duration-500 ${
                    isImageLoaded ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <BlurhashPlaceholder
                    hash={(photo as any).blurHash}
                    aspectRatio={aspectRatio}
                  />
                </div>
              )}

              {!originRect && !isImageLoaded && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <span
                    className="h-5 w-5 rounded-full border-2 border-white/70 border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                </div>
              )}

              {/* ZOOM COMPONENT */}
              <TransformWrapper
                ref={transformRef}
                wheel={{ step: 0.2 }}
                doubleClick={{ disabled: true }}
                onZoomStart={onZoomStart}
                onTransformed={onTransformed}
                onZoomStop={onInteractionStop}
                onPanningStop={onInteractionStop}
                alignmentAnimation={{ sizeX: 0, sizeY: 0 }}
                centerZoomedOut={true}
                centerOnInit={true}
                minScale={1}
                limitToBounds={true}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    className={`relative w-full h-full flex items-center justify-center ${
                      isZoomed ? "cursor-grab" : isMdUp ? "cursor-zoom-in" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isMdUp || isZoomed || isHighResLoading) return;
                      triggerZoomIn();
                    }}
                    onDoubleClick={handleDoubleTap}
                  >
                    <NextImage
                      src={mediumPhotoUrl || ""}
                      alt={(photo as any)?.caption ?? ""}
                      fill
                      unoptimized
                      sizes="100vw"
                      className="object-contain select-none"
                      draggable={false}
                      priority
                      onLoadingComplete={() => {
                        setIsImageLoaded(true);
                        imageLoadedRef.current = true;
                        tryHideOverlay();
                      }}
                      onError={() => {
                        setIsImageLoaded(true);
                        imageLoadedRef.current = true;
                        tryHideOverlay();
                      }}
                    />

                    {showHighRes && (
                      <NextImage
                        src={highResPhotoUrl || ""}
                        alt={(photo as any)?.caption ?? ""}
                        fill
                        unoptimized
                        sizes="100vw"
                        className={`object-contain select-none absolute inset-0 transition-opacity duration-500 ease-in-out ${
                          isHighResReady ? "opacity-100" : "opacity-0"
                        }`}
                        draggable={false}
                        priority
                        onLoadingComplete={() => {
                          setIsHighResReady(true);
                          setIsHighResLoading(false);
                        }}
                        onError={() => {
                          setIsHighResLoading(false);
                        }}
                      />
                    )}
                  </div>
                </TransformComponent>
              </TransformWrapper>

              {isHighResLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-sm text-white px-4 py-3 rounded-lg flex flex-col items-center gap-2">
                    <svg
                      className="animate-spin h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span className="text-xs font-medium">Loading High Res</span>
                  </div>
                </div>
              )}

            </div>

            {/* 4. DESKTOP INFO PANEL */}
            <div
              className={`hidden md:block pointer-events-auto absolute z-20 transition-opacity duration-300 ${
                isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
              style={{
                left: geom.panelLeft,
                top: geom.panelTop,
                transform: geom.isMdUp ? "translateY(-50%)" : "none",
                width: PANEL_W,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-white space-y-4">
                <div>
                  <h3 className="font-bold text-xl">{photo?.site?.name}</h3>
                  {(photo as any)?.site?.location && (
                    <p className="text-sm text-gray-300 flex items-center">
                      {(photo as any).site.location}
                      {googleMapsUrl && (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 hover:text-white transition-colors flex items-center justify-center"
                          title="View on Google Maps"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="map-marker-alt" className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </p>
                  )}
                  <p className="text-sm text-gray-400 mt-1">{PHOTO_CREDIT}</p>
                  {(photo as any)?.caption && (
                    <p className="text-sm text-gray-200 mt-2 italic">
                      {(photo as any).caption}
                    </p>
                  )}
                </div>

                <div>
                  {hasStructuredTaxonomy ? (
                    <div className="space-y-3">
                      {(heritageTypes?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">
                            Heritage Type
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {heritageTypes!.map(pill)}
                          </div>
                        </div>
                      )}
                      {(architecturalStyles?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">
                            Architectural Style
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {architecturalStyles!.map(pill)}
                          </div>
                        </div>
                      )}
                      {(architecturalFeatures?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">
                            Architectural Features
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {architecturalFeatures!.map(pill)}
                          </div>
                        </div>
                      )}
                      {(historicalPeriods?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-1">
                            Historical Period
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {historicalPeriods!.map(pill)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {fallbackPills.map(pill)}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                  {onAddToCollection && (
                    <button
                      className="flex-grow text-center px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/20 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToCollection(photo);
                      }}
                    >
                      Add to Collection
                    </button>
                  )}
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
                    onClick={handleDownload}
                    title="Download Image"
                  >
                    <Icon name="download" className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        )}

        {/* ---------- CONTROLS */}
        {/* Mobile: back arrow (hidden — gallery header handles it) */}
        <button
          className={`md:hidden absolute left-3 p-1.5 rounded-full active:bg-white/20 text-white z-30 cursor-pointer transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          style={{ top: "calc(var(--sat, 44px) + 6px)" }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Back"
        >
          <Icon name="circle-arrow-left" size={30} className="text-white" />
        </button>
        {/* Desktop: X close button (top-right) */}
        <button
          className={`hidden md:flex absolute right-3 p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white z-30 cursor-pointer transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          style={{ top: "max(env(safe-area-inset-top, 0px), 12px)" }}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <Icon name="xmark" size={20} />
        </button>
        {/* Desktop-only prev/next arrows (mobile uses swipe carousel) */}
        <button
          className={`hidden md:flex absolute md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white z-30 cursor-pointer transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
        >
          <Icon name="chevron-left" />
        </button>
        <button
          className={`hidden md:flex absolute md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white z-30 cursor-pointer transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
        >
          <Icon name="chevron-right" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
