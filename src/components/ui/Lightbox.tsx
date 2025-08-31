"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { LightboxPhoto } from "../../types/lightbox";
import Icon from "../Icon"; // Assuming Icon is at components/Icon.tsx

type LightboxProps = {
  photos: LightboxPhoto[];
  startIndex: number;
  onClose: () => void;
  // Optional actions. Buttons will only show if these are provided.
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
  }, [photos.length, onClose]);

  const photo = photos[currentIndex];
  if (!photo) return null;

  const googleMapsUrl =
    photo.site.latitude && photo.site.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${photo.site.latitude},${photo.site.longitude}`
      : null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Main container for image and info */}
        <div
          className="relative w-full h-full flex flex-col md:flex-row items-center justify-center gap-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button (Top right of screen) */}
          <button
            className="absolute top-2 right-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-20"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="xmark" />
          </button>

          {/* Prev / Next Buttons */}
          <button
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-20"
            onClick={() =>
              setCurrentIndex((p) => (p - 1 + photos.length) % photos.length)
            }
            aria-label="Previous"
          >
            <Icon name="chevron-left" />
          </button>
          <button
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white z-20"
            onClick={() => setCurrentIndex((p) => (p + 1) % photos.length)}
            aria-label="Next"
          >
            <Icon name="chevron-right" />
          </button>

          {/* Image Wrapper */}
          <div className="relative flex-shrink-0 w-full md:w-auto md:h-full flex items-center justify-center">
            <Image
              src={photo.url}
              alt={photo.caption ?? ""}
              width={1600}
              height={1200}
              quality={90}
              className="object-contain w-auto h-auto max-w-[90vw] max-h-[70vh] md:max-h-full rounded-lg shadow-2xl"
            />
          </div>

          {/* --- NEW: Info Panel (Right side on desktop) --- */}
          <div className="w-full md:w-72 flex-shrink-0 text-white p-4 space-y-4 self-center">
            {/* Site and Author Info */}
            <div>
              <h3 className="font-bold text-xl">{photo.site.name}</h3>
              <p className="text-sm text-gray-300">{photo.site.location}</p>
              <p className="text-sm text-gray-400 mt-1">
                Photo by:{" "}
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
            </div>

            {/* Caption */}
            {photo.caption && (
              <p className="text-sm text-gray-200 bg-white/5 p-3 rounded-lg">
                {photo.caption}
              </p>
            )}

            {/* Taxonomies */}
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80">
                {photo.site.region}
              </span>
              {photo.site.categories.map((cat) => (
                <span
                  key={cat}
                  className="px-2 py-0.5 text-xs rounded-full bg-gray-700/80"
                >
                  {cat}
                </span>
              ))}
            </div>

            {/* Actions: Bookmark, Collection, GPS */}
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
