"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { LightboxPhoto } from "../../types/lightbox";
import Icon from "../Icon";

/** ---------- CONFIG ---------- */
const PANEL_W = 264; // px — desktop/tablet panel width
const GAP = 20; // px — gap between image and panel
const PADDING = 24; // px — overlay padding per side at md+ (p-6)
const MAX_VH = { base: 76, md: 84, lg: 88 }; // image max-height in viewport %

type LightboxProps = {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
  onBookmarkToggle?: (photo: LightboxPhoto) => void;
  onAddToCollection?: (photo: LightboxPhoto) => void;
};

export function Lightbox({
  photos,
  startIndex,
  onClose,
  onBookmarkToggle,
  onAddToCollection,
}: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);

  /** window size + responsive flags */
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

  /** keyboard nav */
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

  /** current photo */
  const photo = photos[currentIndex];
  if (!photo) return null;

  /** preload & keep geometry stable between images */
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const preload = (src: string) =>
    new Promise<{ w: number; h: number }>((resolve, reject) => {
      const i = new (window as any).Image();
      i.onload = () =>
        resolve({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 });
      i.onerror = reject;
      i.src = src;
    });

  useEffect(() => {
    let cancelled = false;
    if (!imgSrc && photo?.url) {
      preload(photo.url).then(({ w, h }) => {
        if (!cancelled) {
          setNat({ w, h });
          setImgSrc(photo.url);
        }
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!photo?.url) return;
    if (imgSrc === photo.url) return;

    let cancelled = false;
    preload(photo.url).then(({ w, h }) => {
      if (!cancelled) {
        setNat({ w, h });
        setImgSrc(photo.url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photo?.url, imgSrc]);

  const geom = useMemo(() => {
    const nw = nat?.w ?? 3;
    const nh = nat?.h ?? 2;

    const pad = isMdUp ? PADDING : 16;
    const vw = Math.max(320, win.w);
    const vh = Math.max(320, win.h);

    const maxH =
      vh * ((isLgUp ? MAX_VH.lg : isMdUp ? MAX_VH.md : MAX_VH.base) / 100);

    const usableW = isMdUp ? vw - pad * 2 - (PANEL_W + GAP) : vw - pad * 2;

    const scale = Math.min(usableW / nw, maxH / nh);
    const imgW = Math.floor(nw * scale);
    const imgH = Math.floor(nh * scale);

    const totalW = isMdUp ? imgW + GAP + PANEL_W : imgW;

    const contentLeft = Math.round((vw - totalW) / 2);
    const imgLeft = contentLeft;
    const imgTop = Math.round((vh - imgH) / 2);

    const panelLeft = isMdUp ? imgLeft + imgW + GAP : pad;
    const panelTop = isMdUp
      ? imgTop + Math.round(imgH / 2)
      : imgTop + imgH + 16;

    return {
      imgW,
      imgH,
      imgLeft,
      imgTop,
      panelLeft,
      panelTop,
      isMdUp,
    };
  }, [isMdUp, isLgUp, nat, win]);

  const googleMapsUrl =
    photo.site.latitude != null && photo.site.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${photo.site.latitude},${photo.site.longitude}`
      : null;

  /** ---------- RENDER ---------- */
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Controls */}
        <button
          className="absolute top-2 right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-30"
          onClick={onClose}
          aria-label="Close"
        >
          <Icon name="xmark" />
        </button>

        <button
          className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-30"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((p) => (p - 1 + photos.length) % photos.length);
          }}
          aria-label="Previous"
        >
          <Icon name="chevron-left" />
        </button>

        <button
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-30"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((p) => (p + 1) % photos.length);
          }}
          aria-label="Next"
        >
          <Icon name="chevron-right" />
        </button>

        {/* IMAGE */}
        {imgSrc && (
          <div
            className="absolute rounded-2xl overflow-hidden shadow-2xl bg-black/20"
            style={{
              left: geom.imgLeft,
              top: geom.imgTop,
              width: Math.max(1, geom.imgW),
              height: Math.max(1, geom.imgH),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imgSrc}
              alt={photo.caption ?? ""}
              width={Math.max(1, geom.imgW)}
              height={Math.max(1, geom.imgH)}
              priority
              quality={90}
              unoptimized
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        )}

        {/* INFO PANEL */}
        <div
          className={
            geom.isMdUp ? "absolute z-20" : "absolute z-20 w-[min(92vw,620px)]"
          }
          style={{
            left: geom.panelLeft,
            top: geom.isMdUp ? geom.panelTop : geom.panelTop,
            transform: geom.isMdUp ? "translateY(-50%)" : "none",
            width: geom.isMdUp ? PANEL_W : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-white space-y-4">
            <div>
              <h3 className="font-bold text-xl">{photo.site.name}</h3>
              {photo.site.location && (
                <p className="text-sm text-gray-300">{photo.site.location}</p>
              )}
              <p className="text-sm text-gray-400 mt-1">
                Photo by{" "}
                {photo.author.profileUrl ? (
                  <Link
                    href={photo.author.profileUrl}
                    className="hover:underline"
                  >
                    {photo.author.name}
                  </Link>
                ) : (
                  <span>{photo.author.name}</span>
                )}
              </p>

              {/* ✅ Show caption here instead of tagline */}
              {photo.caption && (
                <p className="text-sm text-gray-200 mt-2 italic">
                  {photo.caption}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {photo.site.region && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80">
                  {photo.site.region}
                </span>
              )}
              {photo.site.categories.map((cat) => (
                <span
                  key={cat}
                  className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80"
                >
                  {cat}
                </span>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center gap-2">
              {onBookmarkToggle && (
                <button
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20"
                  onClick={() => onBookmarkToggle(photo)}
                  title={
                    photo.isBookmarked
                      ? "Remove from collection"
                      : "Add to collection"
                  }
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
