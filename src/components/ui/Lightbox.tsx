"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
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

/* ---------- CONFIG ---------- */
const PANEL_W = 264;
const GAP = 20;
const PADDING = 24;
const MAX_VH = { base: 76, md: 84, lg: 88 };

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
};

/* =======================================================
   LIGHTBOX COMPONENT
======================================================= */

export function Lightbox({
  photos,
  startIndex,
  onClose,
  onBookmarkToggle,
  onAddToCollection,
}: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const photo = photos[currentIndex] as LightboxPhotoWithExtras;

  // Zoom Refs and State
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  
  // Tracks the timestamp of the last *ZOOM* interaction
  const lastZoomAction = useRef<number>(0);
  
  const [isZoomed, setIsZoomed] = useState(false);
  const [showHighRes, setShowHighRes] = useState(false);
  const [isHighResLoading, setIsHighResLoading] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  /* ---------- Navigation Handlers ---------- */
  const resetZoom = useCallback(() => {
    if (transformRef.current) {
      transformRef.current.resetTransform();
    }
    setIsZoomed(false);
    setShowHighRes(false);
    setIsHighResLoading(false);
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

  const activeUrl = showHighRes ? highResPhotoUrl : mediumPhotoUrl;

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

  /* ---------- Swipe Handler ---------- */
  const onSwipe = (
    e: MouseEvent | TouchEvent | PointerEvent,
    { offset, velocity }: PanInfo
  ) => {
    // 1. COOL-DOWN CHECK:
    // Only block if a pinch/zoom happened recently (< 500ms)
    const timeSinceZoom = Date.now() - lastZoomAction.current;
    if (timeSinceZoom < 500) return;

    // 2. SCALE CHECK
    // Double check we are truly at scale 1 before allowing swipe
    if (transformRef.current) {
      const { scale } = transformRef.current.instance.transformState;
      if (scale > 1.01) return;
    }
    
    if (isZoomed) return;

    const swipe = swipePower(offset.x, velocity.x);

    if (swipe < -SWIPE_THRESHOLD || offset.x < -100) {
      handleNext();
    } else if (swipe > SWIPE_THRESHOLD || offset.x > 100) {
      handlePrev();
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
    // We update the timer here because starting a zoom is an action we want to block swipes for
    lastZoomAction.current = Date.now();
    triggerHighResLoad();
  };

  const onTransformed = (ref: ReactZoomPanPinchRef) => {
    // CRITICAL FIX: Only update the "block swipe" timer if we are actually zoomed in.
    // If scale is 1, this is just a normal drag/swipe, so we SHOULD NOT update the timer.
    if (ref.state.scale > 1.01) {
      lastZoomAction.current = Date.now();
    }
    
    const isNowZoomed = ref.state.scale > 1.01;
    if (isNowZoomed !== isZoomed) {
      setIsZoomed(isNowZoomed);
    }
  };

  const onInteractionStop = (ref: ReactZoomPanPinchRef) => {
    // CRITICAL FIX: Same here. Only block swipes if we just finished a Zoom interaction.
    // If we just finished a normal swipe at scale 1, do not update the timer.
    if (ref.state.scale > 1.01) {
      lastZoomAction.current = Date.now();
    }
    
    if (ref.state.scale <= 1.01) {
      ref.resetTransform(200); 
      setIsZoomed(false);
    }
  };

  const handleZoomIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    lastZoomAction.current = Date.now(); // Explicit zoom action blocks swipes
    triggerHighResLoad();
    
    setIsZoomed(true);

    // Wait slightly longer than the CSS transition (300ms) to ensure layout is stable
    setTimeout(() => {
      if (transformRef.current) {
        // CORRECTION: 'zoomTo' does not exist. We use 'zoomIn'.
        // zoomIn adds the step to the current scale.
        // Current scale is 1. We want 2.5. So step is 1.5.
        transformRef.current.zoomIn(1.5, 500); 
      }
    }, 350); 
  };

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
    const cats = Array.isArray(photo?.site?.categories)
      ? photo!.site!.categories
      : [];
    return [...region, ...cats].filter(Boolean) as string[];
  }, [photo?.site]);

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

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[2147483647] bg-black/98 touch-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        onPanEnd={onSwipe}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={photo?.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {/* 1. MOBILE HEADER */}
            <div
              className={`md:hidden absolute z-20 pointer-events-auto transition-opacity duration-300 ${
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
              <div className="text-white flex justify-between items-end gap-4">
                <div>
                  <h3 className="font-bold text-xl leading-tight">
                    {photo?.site?.name}
                  </h3>
                  {photo?.site?.location && (
                    <p className="text-sm text-gray-300 mt-1">
                      {photo.site.location}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center justify-end">
                  <p className="text-xs text-gray-400">
                    Photo by{" "}
                    {photo?.author?.profileUrl ? (
                      <Link
                        href={photo.author.profileUrl}
                        className="hover:underline ml-1"
                      >
                        {photo.author.name}
                      </Link>
                    ) : (
                      <span className="ml-1">{photo?.author?.name}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* ============================================
              2. IMAGE CONTAINER
              ============================================
            */}
            <div
              className={`absolute rounded-2xl overflow-hidden shadow-2xl bg-black/20 pointer-events-auto transition-all duration-300 ${
                isZoomed ? "z-50 rounded-none" : "z-10"
              }`}
              style={{
                left: isZoomed ? 0 : geom.imgLeft,
                top: isZoomed ? 0 : geom.imgTop,
                width: isZoomed ? "100%" : geom.imgW,
                height: isZoomed ? "100%" : geom.imgH,
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
                  siteImageId={photo.id}
                  storagePath={photo.storagePath}
                  siteId={photo.site?.id ?? ""}
                  caption={photo.caption}
                  credit={photo.author?.name}
                />
              </div>

              {/* BlurHash Background */}
              {photo?.blurHash && (
                <div
                  className={`absolute inset-0 bg-black/20 pointer-events-none transition-opacity duration-500 ${
                    isImageLoaded ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <BlurhashPlaceholder
                    hash={photo.blurHash}
                    aspectRatio={aspectRatio}
                  />
                </div>
              )}

              {/* ZOOM COMPONENT */}
              {activeUrl && (
                <TransformWrapper
                  ref={transformRef}
                  wheel={{ step: 0.2 }}
                  doubleClick={{ disabled: false }}
                  onZoomStart={onZoomStart}
                  
                  // Update state during gesture
                  onTransformed={onTransformed}
                  // Force snap-back when gesture ends
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
                    <div className="relative w-full h-full flex items-center justify-center">
                      <NextImage
                        src={activeUrl}
                        alt={photo?.caption ?? ""}
                        fill
                        unoptimized
                        sizes="100vw"
                        className="object-contain select-none"
                        draggable={false}
                        priority
                        onLoadingComplete={() => {
                          setIsImageLoaded(true);
                          if (showHighRes) setIsHighResLoading(false);
                        }}
                      />
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              )}

              {/* LOADING INDICATOR */}
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
                    <span className="text-xs font-medium">
                      Loading High Res
                    </span>
                  </div>
                </div>
              )}

              {/* ZOOM ICON */}
              <button
                className={`absolute bottom-3 left-3 z-30 w-9 h-9 flex items-center justify-center text-white bg-black/40 hover:bg-black/60 rounded-full transition-all duration-300 backdrop-blur-md ${
                  isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
                onClick={handleZoomIconClick}
                onPointerDownCapture={(e) => e.stopPropagation()}
                title="Zoom to high resolution"
              >
                <Icon name="zoom" className="w-5 h-5" />
              </button>
            </div>

            {/* 3. MOBILE FOOTER */}
            <div
              className={`md:hidden absolute z-20 pointer-events-auto flex justify-between items-start gap-4 transition-opacity duration-300 ${
                isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
              style={{
                left: geom.imgLeft,
                width: geom.imgW,
                top: geom.imgTop + geom.imgH + 12,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1">
                {photo?.caption && (
                  <p className="text-sm text-gray-200 italic leading-snug">
                    {photo.caption}
                  </p>
                )}
              </div>
              {onAddToCollection && (
                <button
                  className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCollection(photo);
                  }}
                >
                  Add to Collection
                </button>
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
                  {photo?.site?.location && (
                    <p className="text-sm text-gray-300">
                      {photo.site.location}
                    </p>
                  )}
                  <p className="text-sm text-gray-400 mt-1">
                    Photo by{" "}
                    {photo?.author?.profileUrl ? (
                      <Link
                        href={photo.author.profileUrl}
                        className="hover:underline"
                      >
                        {photo.author.name}
                      </Link>
                    ) : (
                      <span>{photo?.author?.name}</span>
                    )}
                  </p>
                  {photo?.caption && (
                    <p className="text-sm text-gray-200 mt-2 italic">
                      {photo.caption}
                    </p>
                  )}
                </div>
                {/* Taxonomy Pills */}
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
                {/* Bottom Actions Bar */}
                <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                  {onAddToCollection && (
                    <button
                      className="flex-grow text-center px-3 py-1.5 rounded-full text-sm font-semibold bg-white/10 hover:bg-white/20"
                      onClick={() => onAddToCollection(photo)}
                    >
                      Add to Collection
                    </button>
                  )}
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                      title="View on Google Maps"
                    >
                      <Icon name="map-marker-alt" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ---------- CONTROLS */}
        <button
          className="absolute top-2 right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-30"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <Icon name="xmark" />
        </button>
        <button
          className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-30 transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
        >
          <Icon name="chevron-left" />
        </button>
        <button
          className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-30 transition-opacity duration-300 ${
            isZoomed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
        >
          <Icon name="chevron-right" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}