// src/components/SitePreviewCard.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { useBookmarks } from "./BookmarkProvider";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import { supabase } from "@/lib/supabaseClient";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";

type Site = {
  id: string;
  slug: string;
  province_slug?: string | null;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  distance_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

/* ---------- Helpers ---------- */
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

function fmtKm(v?: number | null) {
  if (v == null || Number.isNaN(v)) return "";
  return v < 10 ? `${v.toFixed(1)} km` : `${Math.round(v)} km`;
}

/** Round to a step to avoid tiny resizes that cause shimmer. */
function roundToStep(n: number, step = 40, min = 280, max = 800) {
  const clamped = Math.max(min, Math.min(max, n));
  return Math.round(clamped / step) * step;
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* ---------- Component ---------- */
export default function SitePreviewCard({
  site,
  onClose,
}: {
  site: Site;
  onClose?: () => void;
}) {
  const router = useRouter();
  const { bookmarkedIds, toggleBookmark, isLoaded } = useBookmarks();
  const isBookmarked = isLoaded ? bookmarkedIds.has(site.id) : false;

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);

  const detailHref =
    site.province_slug && site.province_slug?.length
      ? `/heritage/${site.province_slug}/${site.slug}`
      : `/heritage/${site.slug}`;

  /* ---------- Image sizing for accurate 'sizes' ---------- */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(384);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 0) setContainerW(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseW = roundToStep(containerW, 40, 280, 800);

  // We keep a tiny placeholder to avoid layout thrash on slow networks
  const [src, setSrc] = useState<string>(site.cover_photo_url || FALLBACK_SVG);
  useEffect(() => {
    setSrc(site.cover_photo_url || FALLBACK_SVG);
  }, [site.cover_photo_url]);

  const [broken, setBroken] = useState(false);

  const hasDistance =
    site.distance_km != null && !Number.isNaN(site.distance_km);
  const distanceLabel = fmtKm(site.distance_km ?? null);

  /* ---------- Places Nearby ---------- */
  const handlePlacesNearby = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let lat = site.latitude;
    let lng = site.longitude;

    if ((lat == null || lng == null) && site.id) {
      try {
        const { data, error } = await supabase
          .from("sites")
          .select("latitude, longitude")
          .eq("id", site.id)
          .maybeSingle();
        if (!error && data) {
          lat = data.latitude ?? null;
          lng = data.longitude ?? null;
        }
      } catch {
        /* ignore */
      }
    }

    if (lat == null || lng == null) {
      console.warn(
        "Site missing latitude/longitude, cannot open nearby search"
      );
      return;
    }

    const href = buildPlacesNearbyURL({
      siteId: site.id,
      lat,
      lng,
      radiusKm: 25,
      basePath: "/explore",
    });

    try {
      router.push(href);
    } catch {
      if (typeof window !== "undefined") window.location.assign(href);
    }
  };

  /* ---------- Render ---------- */
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

      <Link href={detailHref} className="group block" prefetch={false}>
        <div className="relative" ref={containerRef}>
          {/* Image (Next/Image picks the closest width & DPR to kill aliasing) */}
          <div className="relative aspect-[3/2] w-full">
            <Image
              src={broken ? FALLBACK_SVG : src}
              alt={site.title}
              fill
              // Tell Next the real render width so it chooses the right file
              sizes={`${baseW}px`}
              className="object-cover"
              onError={() => setBroken(true)}
              priority={false}
              // These hints often reduce blur on Chrome without harming Safari/Firefox
              style={{ imageRendering: "auto" }}
            />
          </div>

          {/* Heritage type chip */}
          {site.heritage_type && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#F78300]/90 text-white text-xs font-semibold shadow">
              {site.heritage_type}
            </div>
          )}

          {/* Reviews & rating */}
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

          {/* Distance badge */}
          {hasDistance && (
            <div
              className="absolute bottom-3 right-3 w-12 h-12 rounded-full bg-[#00b87b] text-white shadow-xl flex items-center justify-center font-extrabold text-xs z-20"
              title={distanceLabel}
              aria-label={distanceLabel}
            >
              <span className="leading-tight text-center">{distanceLabel}</span>
            </div>
          )}

          {/* Title & location gradient */}
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

        {/* Footer actions */}
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
            {/* Places Nearby */}
            <button
              type="button"
              title="Places Nearby"
              onClick={handlePlacesNearby}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Icon
                name="nearby"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </button>

            {/* Bookmark */}
            <button
              type="button"
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

            {/* Wishlist */}
            <button
              type="button"
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

            {/* Trip */}
            <button
              type="button"
              title="Add to Trip"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTripModal(true);
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
