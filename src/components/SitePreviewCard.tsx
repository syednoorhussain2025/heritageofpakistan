// src/components/SitePreviewCard.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useBookmarks } from "./BookmarkProvider";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal"; // <-- added

type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

/** Simple SVG fallback (brand-ish gradient), sized to 3:2 */
const FALLBACK_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="533" viewBox="0 0 800 533">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#F78300"/>
          <stop offset="100%" stop-color="#00b78b"/>
        </linearGradient>
      </defs>
      <rect width="800" height="533" fill="url(#g)"/>
    </svg>`
  );

/**
 * Build a Supabase transform URL sized safely for sharp preview cards.
 * Now using a slightly shorter **3:2** aspect (800×533 by default) at quality=85.
 * Uses resize=cover to keep a consistent crop within the card.
 */
function transformedUrl(url?: string | null, w = 800, q = 85) {
  if (!url) return "";
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url; // Already a non-storage URL
  const [origin] = url.split(marker);
  const tail = url.split(marker)[1];
  const h = Math.round(w * (2 / 3)); // 3:2 aspect
  const u = new URL(`${origin}/storage/v1/render/image/public/${tail}`);
  u.searchParams.set("width", String(w));
  u.searchParams.set("height", String(h));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("quality", String(q));
  return u.toString();
}

/** Render children into document.body so the modal isn't clipped by the card */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export default function SitePreviewCard({
  site,
  onClose,
}: {
  site: Site;
  onClose?: () => void;
}) {
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();
  const isBookmarked = isLoaded ? bookmarkedIds.has(site.id) : false;

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false); // <-- added

  // Image source with robust fallbacks:
  // 1) try transformed URL (800x533 @ q=85)
  // 2) fall back to original public URL
  // 3) final fallback to gradient SVG
  const original = site.cover_photo_url || "";
  const transformed = transformedUrl(original);

  const [imgSrc, setImgSrc] = useState<string>(
    () => transformed || original || FALLBACK_SVG
  );
  const triedOriginalRef = useRef(false); // track if we've already tried original

  useEffect(() => {
    const orig = site.cover_photo_url || "";
    const trans = transformedUrl(orig);
    triedOriginalRef.current = false;
    setImgSrc(trans || orig || FALLBACK_SVG);
  }, [site.cover_photo_url]);

  const handleImgError = () => {
    if (!triedOriginalRef.current && original && imgSrc !== original) {
      triedOriginalRef.current = true;
      setImgSrc(original);
      return;
    }
    setImgSrc(FALLBACK_SVG);
  };

  return (
    <div className="w-full max-w-sm rounded-xl overflow-hidden bg-white shadow-lg relative transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1 bg-black/40 text-white rounded-full hover:bg-black/60"
          title="Close"
        >
          <Icon name="times" size={16} />
        </button>
      )}

      <Link href={`/heritage/${site.slug}`} className="group block">
        <div className="relative">
          {/* Slightly shorter rectangle: aspect-[3/2] */}
          <img
            src={imgSrc}
            alt={site.title}
            width={800}
            height={533}
            className="block w-full aspect-[3/2] object-cover"
            loading="lazy"
            decoding="async"
            onError={handleImgError}
          />

          {site.heritage_type && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#F78300]/90 text-white text-xs font-semibold shadow">
              {site.heritage_type}
            </div>
          )}

          <div className="absolute top-3 right-3 flex items-center gap-2">
            {site.review_count != null && (
              <span className="px-2 py-1 rounded-full bg-white/90 text-gray-800 text-xs font-medium shadow">
                {site.review_count} Reviews
              </span>
            )}
            {site.avg_rating != null && (
              <span className="px-2 py-1 rounded-full bg-[#00b78b] text-white text-xs font-semibold shadow inline-flex items-center gap-1">
                <Icon name="star" size={12} /> {site.avg_rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="bg-gradient-to-t from-black/70 to-transparent rounded-b-xl -m-3 p-3 pt-10">
              <h3 className="text-white text-xl font-extrabold drop-shadow">
                {site.title}
              </h3>
              {site.location_free && (
                <div className="mt-1 flex items-center gap-1 text-white/90 text-sm">
                  <Icon name="map-marker-alt" size={12} /> {site.location_free}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-between px-4 py-3"
          onClick={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Icon
                name="university"
                className="text-[var(--brand-orange)]"
                size={14}
              />
              {site.heritage_type || "—"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-gray-700">
            <button
              title="Quick view"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // hook up your quick-view here if needed
              }}
            >
              <Icon
                name="search-plus"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </button>

            <button
              title="Bookmark"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleBookmark(site.id);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isBookmarked
                  ? "bg-[var(--brand-orange)] hover:brightness-90"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
              disabled={!isLoaded}
            >
              <Icon
                name="heart"
                size={14}
                className={
                  isBookmarked ? "text-white" : "text-[var(--brand-orange)]"
                }
              />
            </button>

            <button
              title="Add to Wishlist"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowWishlistModal(true);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Icon
                name="list-ul"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </button>

            <button
              title="Add to Trip"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTripModal(true); // <-- opens Trip modal
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Icon
                name="route"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </button>
          </div>
        </div>
      </Link>

      {showWishlistModal && (
        <Portal>
          <AddToWishlistModal
            siteId={site.id}
            onClose={() => setShowWishlistModal(false)}
          />
        </Portal>
      )}

      {showTripModal && (
        <Portal>
          <AddToTripModal
            siteId={site.id}
            onClose={() => setShowTripModal(false)}
          />
        </Portal>
      )}
    </div>
  );
}
