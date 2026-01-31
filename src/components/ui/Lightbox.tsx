"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { LightboxPhoto } from "../../types/lightbox";
import Icon from "../Icon";
import { decode } from "blurhash";
import { getVariantPublicUrl } from "@/lib/imagevariants";

/* ---------- CONFIG ---------- */
const PANEL_W = 264;
const GAP = 20;
const PADDING = 24;
const MAX_VH = { base: 76, md: 84, lg: 88 };

/* ---------- BlurHash Component (matches aspect ratio) ---------- */

type BlurhashPlaceholderProps = {
  hash: string;
  aspectRatio: number; // width / height
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

  /* ---------- Keyboard nav ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        setCurrentIndex((p) => (p + 1) % photos.length);
      if (e.key === "ArrowLeft")
        setCurrentIndex((p) => (p - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  /* ---------- Use server dimensions if present ---------- */
  const nat = useMemo(
    () => ({
      w: photo.width && photo.width > 0 ? photo.width : 4,
      h: photo.height && photo.height > 0 ? photo.height : 3,
    }),
    [photo.width, photo.height]
  );

  const aspectRatio = nat.w / nat.h;

  /* ---------- Geometry (stable, no shift) ---------- */
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

  /* ---------- Medium variant URL for current photo ---------- */
  const mediumPhotoUrl = useMemo(() => {
    if (photo.storagePath) {
      try {
        return getVariantPublicUrl(photo.storagePath, "md");
      } catch {
        return photo.url;
      }
    }
    return photo.url;
  }, [photo.storagePath, photo.url]);

  /* ---------- Prefetch neighbours using medium variant ---------- */
  useEffect(() => {
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

  /* ---------- Google Maps link ---------- */
  const googleMapsUrl =
    photo.site?.latitude != null && photo.site?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${photo.site.latitude},${photo.site.longitude}`
      : null;

  /* ---------- Pills helpers ---------- */
  const pill = (text: string) => (
    <span
      key={text}
      className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80"
    >
      {text}
    </span>
  );

  const taxonomy = photo.site?.taxonomy;

  const fallbackPills: string[] = useMemo(() => {
    const region = photo.site?.region ? [photo.site.region] : [];
    const cats = Array.isArray(photo.site?.categories) ? photo.site!.categories : [];
    return [...region, ...cats].filter(Boolean) as string[];
  }, [photo.site]);

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
        className="fixed inset-0 z-[2147483647] bg-black/90"
        style={{ zIndex: 2147483647 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Controls */}
        <button
          className="absolute top-2 right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-[2147483647]"
          style={{ zIndex: 2147483647 }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <Icon name="xmark" />
        </button>

        <button
          className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-[2147483647]"
          style={{ zIndex: 2147483647 }}
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((p) => (p - 1 + photos.length) % photos.length);
          }}
        >
          <Icon name="chevron-left" />
        </button>

        <button
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-[2147483647]"
          style={{ zIndex: 2147483647 }}
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((p) => (p + 1) % photos.length);
          }}
        >
          <Icon name="chevron-right" />
        </button>

        {/* ---------- IMAGE CONTAINER WITH CROSSFADE ---------- */}
        <div
          className="absolute rounded-2xl overflow-hidden shadow-2xl bg-black/20"
          style={{
            left: geom.imgLeft,
            top: geom.imgTop,
            width: geom.imgW,
            height: geom.imgH,
            zIndex: 2147483647,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={photo.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-0"
            >
              {/* BlurHash background */}
              {photo.blurHash && (
                <div className="absolute inset-0 bg-black/20">
                  <BlurhashPlaceholder
                    hash={photo.blurHash}
                    aspectRatio={aspectRatio}
                  />
                </div>
              )}

              {/* Full image on top using medium variant */}
              <NextImage
                src={mediumPhotoUrl}
                alt={photo.caption ?? ""}
                fill
                unoptimized
                sizes="100vw"
                className="w-full h-full object-contain"
                priority
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---------- INFO PANEL ---------- */}
        <div
          className={
            geom.isMdUp
              ? "absolute z-[2147483647]"
              : "absolute z-[2147483647] w-[min(92vw,620px)]"
          }
          style={{
            left: geom.panelLeft,
            top: geom.panelTop,
            transform: geom.isMdUp ? "translateY(-50%)" : "none",
            width: geom.isMdUp ? PANEL_W : undefined,
            zIndex: 2147483647,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-white space-y-4">
            <div>
              <h3 className="font-bold text-xl">{photo.site?.name}</h3>

              {photo.site?.location && (
                <p className="text-sm text-gray-300">{photo.site.location}</p>
              )}

              <p className="text-sm text-gray-400 mt-1">
                Photo by{" "}
                {photo.author?.profileUrl ? (
                  <Link
                    href={photo.author.profileUrl}
                    className="hover:underline"
                  >
                    {photo.author.name}
                  </Link>
                ) : (
                  <span>{photo.author?.name}</span>
                )}
              </p>

              {photo.caption && (
                <p className="text-sm text-gray-200 mt-2 italic">
                  {photo.caption}
                </p>
              )}
            </div>

            {/* Pills: structured taxonomy if available, otherwise fallback */}
            {hasStructuredTaxonomy ? (
              <div className="space-y-3">
                {(heritageTypes?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Heritage Type</p>
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

                {/* Requirement 1: hide architectural features on mobile */}
                {(architecturalFeatures?.length ?? 0) > 0 && (
                  <div className="hidden md:block">
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

            <div className="pt-2 border-t border-white/10 flex items-center gap-2">
              {onBookmarkToggle && (
                <button
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                  onClick={() => onBookmarkToggle(photo)}
                >
                  <Icon
                    name={photo.isBookmarked ? "bookmark-solid" : "bookmark"}
                  />
                </button>
              )}

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
  );
}
