// src/components/SitePreviewCard.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import SiteActionsSheet from "@/components/SiteActionsSheet";
import { supabase } from "@/lib/supabase/browser";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";

type Site = {
  id: string;
  slug: string;
  province_slug?: string | null;
  region_slug?: string | null;
  province?: string | null;
  title: string;

  // new thumbnail column coming from sites table
  cover_photo_thumb_url?: string | null;
  // full-size cover URL (used as fallback when thumb not available, e.g. map popup)
  cover_photo_url?: string | null;

  // existing blur + meta
  cover_blur_data_url?: string | null;
  cover_width?: number | null;
  cover_height?: number | null;

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

/** Format latitude/longitude for display (e.g. "28.1234, 70.5678"). */
function fmtLatLong(lat?: number | null, lng?: number | null): string {
  const a = lat != null && !Number.isNaN(lat) ? lat.toFixed(4) : null;
  const b = lng != null && !Number.isNaN(lng) ? lng.toFixed(4) : null;
  if (a && b) return `${a}, ${b}`;
  if (a) return `${a}, —`;
  if (b) return `—, ${b}`;
  return "—";
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

/** Resolve the best available province/region slug field from the card data. */
function resolveProvinceSlug(site: Site): string | null {
  if (site.province_slug && site.province_slug.trim().length > 0) {
    return site.province_slug.trim();
  }
  if (site.region_slug && site.region_slug.trim().length > 0) {
    return site.region_slug.trim();
  }
  if (site.province && site.province.trim().length > 0) {
    return site.province.trim();
  }
  return null;
}

/* ---------- Component ---------- */
export default function SitePreviewCard({
  site,
  onClose,
  index = 0,
  onCardClick,
  onPlacesNearby,
}: {
  site: Site;
  onClose?: () => void;
  /** Index from ExplorePage used to prioritise first two rows */
  index?: number;
  /** When provided, clicking the card calls this instead of navigating to the site page. */
  onCardClick?: () => void;
  /** When provided, "Places Nearby" applies this site on the current page (e.g. map) instead of navigating to Explore. */
  onPlacesNearby?: (site: { id: string; title: string; latitude: number; longitude: number }) => void;
}) {
  const router = useRouter();

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ bottom: number; left: number } | null>(null);

  const regionSlug = resolveProvinceSlug(site);
  const detailHref = regionSlug
    ? `/heritage/${regionSlug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const galleryHref = regionSlug
    ? `/heritage/${regionSlug}/${site.slug}/gallery`
    : `/heritage/${site.slug}/gallery`;
  const photoStoryHref = regionSlug
    ? `/heritage/${regionSlug}/${site.slug}/photo-story`
    : `/heritage/${site.slug}/photo-story`;
  const googleMapsHref =
    site.latitude != null && site.longitude != null && !Number.isNaN(site.latitude) && !Number.isNaN(site.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`
      : null;
  const prefetchedRef = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuPortalRef = useRef<HTMLDivElement>(null);

  // Position the desktop actions menu in a portal (avoids overflow-hidden clipping). Align menu bottom with card/trigger bottom.
  useEffect(() => {
    if (!showActionsMenu) {
      setMenuPosition(null);
      return;
    }
    // Desktop only — md breakpoint (768px)
    if (window.matchMedia("(max-width: 767px)").matches) return;
    const el = actionsMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Align menu bottom with card bottom (trigger is inside footer; card has py-2 so nudge down)
    const cardBottomOffset = 8;
    const gapBetweenCardAndMenu = 12;
    setMenuPosition({
      bottom: rect.bottom + cardBottomOffset,
      left: rect.right + gapBetweenCardAndMenu,
    });
  }, [showActionsMenu]);

  // Derive isSharpLoaded from which src has actually loaded.
  // This resets to false SYNCHRONOUSLY during render when sharpSrc changes,
  // preventing the stale-true → empty-img flash caused by useEffect timing.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [allowBlur, setAllowBlur] = useState(false);

  const hasBlur = Boolean(site.cover_blur_data_url);

  // Prefer thumbnail; fall back to cover URL converted to thumb variant, then placeholder
  const sharpSrc = site.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") || FALLBACK_SVG;

  // isSharpLoaded is true only when the CURRENT sharpSrc has loaded
  const isSharpLoaded = loadedSrc === sharpSrc;
  const showBlur = hasBlur && !isSharpLoaded && allowBlur;

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
  }, [sharpSrc, site.id]);

  // Show blur only if sharp image is not ready quickly.
  // Cached images usually resolve before this delay and skip blur entirely.
  useEffect(() => {
    setAllowBlur(false);
    if (!hasBlur || isSharpLoaded) return;
    const t = window.setTimeout(() => setAllowBlur(true), 90);
    return () => window.clearTimeout(t);
  }, [sharpSrc, hasBlur, isSharpLoaded]);

  // Prioritise first two rows in the Explore grid
  const isPriority = index < 6;

  // Decode before reveal to avoid progressive paint flicker on hard refresh.
  useEffect(() => {
    if (!sharpSrc) return;
    if (sharpSrc === FALLBACK_SVG) {
      setLoadedSrc(sharpSrc);
      return;
    }
    if (typeof window === "undefined") return;

    let cancelled = false;
    const pre = new window.Image();
    pre.decoding = "async";
    pre.src = sharpSrc;

    const markLoaded = () => {
      if (!cancelled) setLoadedSrc(sharpSrc);
    };
    const markError = () => {
      if (!cancelled) {
        setHasError(true);
        setLoadedSrc(sharpSrc);
      }
    };

    if (pre.complete && pre.naturalWidth > 0) {
      markLoaded();
      return () => {
        cancelled = true;
      };
    }

    if (typeof pre.decode === "function") {
      pre
        .decode()
        .then(markLoaded)
        .catch(() => {
          if (pre.complete && pre.naturalWidth > 0) markLoaded();
          else markError();
        });
    } else {
      pre.onload = markLoaded;
      pre.onerror = markError;
    }

    return () => {
      cancelled = true;
      pre.onload = null;
      pre.onerror = null;
      // Abort any in-flight network request for this image.
      pre.src = "";
    };
  }, [sharpSrc]);

  const hasDistance =
    site.distance_km != null && !Number.isNaN(site.distance_km);
  const distanceLabel = fmtKm(site.distance_km ?? null);

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

    if (onPlacesNearby) {
      onPlacesNearby({ id: site.id, title: site.title, latitude: Number(lat), longitude: Number(lng) });
      return;
    }

    const href = buildPlacesNearbyURL({
      siteId: site.id,
      lat,
      lng,
      radiusKm: 5,
      basePath: "/explore",
    });

    try {
      router.push(href);
    } catch {
      if (typeof window !== "undefined") window.location.assign(href);
    }
  };

  useEffect(() => {
    prefetchedRef.current = false;
  }, [detailHref]);

  const prefetchDetail = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    void router.prefetch(detailHref);
  }, [router, detailHref]);

  // Close desktop popup on outside click(button ovsr portal menu count as inside)
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
        return;
      }
      const target = e.target as Node;
      const inTrigger = actionsMenuRef.current?.contains(target);
      const inMenu = actionsMenuPortalRef.current?.contains(target);
      if (!inTrigger && !inMenu) setShowActionsMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showActionsMenu]);


  return (
    <div className="w-[calc(100%+0.5rem)] -mx-1 sm:w-full sm:mx-0 rounded-xl overflow-hidden bg-white relative border border-[#e5e5e5]">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1 bg-black/40 text-white rounded-full hover:bg-black/60 active:scale-95 transition-transform duration-100"
          title="Close"
        >
          <Icon name="times" size={16} />
        </button>
      )}

      <Link
        href={detailHref}
        className="group block"
        onMouseEnter={prefetchDetail}
        onFocus={prefetchDetail}
        onTouchStart={prefetchDetail}
        onClick={onCardClick ? (e) => { e.preventDefault(); e.stopPropagation(); onCardClick(); } : undefined}
      >
        <div className="relative">
          {/* Image container — bg-neutral-300 ensures any transparent frame
              shows neutral gray instead of the card's white background */}
          <div
            className="relative aspect-[4/3] sm:aspect-[5/3] w-full overflow-hidden rounded-none bg-neutral-300"
            style={{ transform: "translateZ(0)", contain: "paint" }}
          >
            {hasBlur && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none select-none overflow-hidden"
                style={{
                  opacity: showBlur ? 1 : 0,
                  transition: isSharpLoaded ? "opacity 220ms ease" : "none",
                  zIndex: 1,
                  willChange: "opacity",
                  backfaceVisibility: "hidden",
                  transform: "translateZ(0)",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: "#a3a3a3",
                    backgroundImage: `url(${site.cover_blur_data_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(14px)",
                    transform: "translateZ(0) scale(1.05)",
                  }}
                />
              </div>
            )}

            {showBlur && !hasError && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 2 }}
              >
                <span className="inline-block w-5 h-5 rounded-full border-2 border-white/85 border-t-transparent animate-spin shadow bg-black/10 backdrop-blur-[1px]" />
              </div>
            )}

            <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110">
              <img
                src={sharpSrc}
                alt={site.title}
                loading={isPriority ? "eager" : "lazy"}
                fetchPriority={isPriority ? "high" : "auto"}
                decoding="async"
                onLoad={() => setLoadedSrc(sharpSrc)}
                onError={() => {
                  setHasError(true);
                  setLoadedSrc(sharpSrc);
                }}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  imageRendering: "auto",
                  opacity: hasBlur ? 1 : isSharpLoaded ? 1 : 0,
                  transition: hasBlur ? "none" : "opacity 220ms ease",
                  willChange: "opacity",
                  backfaceVisibility: "hidden",
                  transform: "translateZ(0)",
                }}
              />
            </div>

            {/* Small spinner overlay while high-res image is loading */}
            {!hasBlur && !isSharpLoaded && !hasError && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
                <span className="inline-block w-6 h-6 rounded-full border-2 border-white/80 border-t-transparent animate-spin shadow-md bg-black/10 backdrop-blur-[2px]" />
              </div>
            )}

            {/* Hover dark overlay */}
            {/* <div className="absolute inset-0 bg-[#242429] opacity-0 group-hover:opacity-65 transition-opacity duration-300 pointer-events-none" /> */}
          </div>

          {/* Heritage type chip (slightly smaller) */}
          {site.heritage_type && (
            <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#F78300]/90 text-white text-[10px] sm:text-xs font-semibold shadow">
              {site.heritage_type}
            </div>
          )}

          {/* Rating and reviews pills rating on top, reviews below */}
          <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
            {site.avg_rating != null && (
              <span className="px-2 py-0.5 rounded-full bg-[#00b78b] text-white text-[11px] font-semibold shadow inline-flex items-center gap-1">
                <Icon name="star" size={11} /> {site.avg_rating.toFixed(1)}
              </span>
            )}
            {site.review_count != null && (
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full bg-white/90 text-gray-800 text-[10px] font-medium shadow">
                {site.review_count} Reviews
              </span>
            )}
          </div>

          {/* Distance badge */}
          {hasDistance && (
            <div
              className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-[#00b87b] text-white shadow-xl flex items-center justify-center font-extrabold text-[10px] z-20"
              title={distanceLabel}
              aria-label={distanceLabel}
            >
              <span className="leading-tight text-center">{distanceLabel}</span>
            </div>
          )}

          {/* Title and location giradient desktop / tablet only */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="bg-gradient-to-t from-black/60 to-transparent rounded-b-xl -m-3 p-3 pt-10">
              <h3 className="hidden md:block text-white text-lg sm:text-xl font-extrabold transition-transform duration-300 group-hover:translate-x-1">
                {site.title}
              </h3>
              {site.location_free && (
                <div className="hidden md:flex mt-1 items-center gap-1 text-white/90 text-xs sm:text-sm">
                  <Icon name="map-marker-alt" size={12} /> {site.location_free}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          className="px-2 py-2"
          onClick={(e) => e.preventDefault()}
        >
          {/* Mobile title + location + ellipsis inside white card */}
          <div className="md:hidden flex items-center gap-2 pt-0 pb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-[16px] font-extrabold leading-tight truncate">
                {site.title}
              </h3>
              {site.location_free && (
                <div className="mt-[1px] text-[11px] text-gray-400 truncate">
                  {site.location_free}
                </div>
              )}
            </div>
            <button
              type="button"
              title="More actions"
              aria-label="More actions"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(true); }}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors cursor-pointer active:scale-95 transition-transform duration-100"
            >
              <Icon name="ellipsis" size={18} />
            </button>
          </div>

          {/* Desktop / tablet: Lat/Long left (pill), actions menu right */}
          <div className="hidden md:flex items-center gap-2 text-gray-700">
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 tabular-nums ring-1 ring-gray-200/80">
              <Icon name="map-marker-alt" className="text-[var(--brand-orange)] shrink-0" size={12} aria-hidden />
              <span className="font-mono tracking-tight">{fmtLatLong(site.latitude, site.longitude)}</span>
            </span>

            <div className="ml-auto relative" ref={actionsMenuRef}>
              <button
                type="button"
                title="More actions"
                aria-label="More actions"
                aria-expanded={showActionsMenu}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu((v) => !v); }}
                className="p-1 flex items-center justify-center text-gray-600 hover:text-[var(--brand-orange)] transition-colors cursor-pointer active:scale-95 transition-transform duration-100"
              >
                <Icon name="ellipsis" size={24} className="text-current" />
              </button>
            </div>
          </div>

        </div>
      </Link>

      {/* Desktop actions menu in portal so it isn't clipped by card overflow-hidden */}
      {showActionsMenu && menuPosition && (
        <Portal>
          {/* Backdrop: first click closes only the menu; card stays open until next outside click */}
          <div
            aria-hidden
            className="fixed inset-0 z-[9998]"
            onClick={() => setShowActionsMenu(false)}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div
            ref={actionsMenuPortalRef}
            className="fixed w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-200 origin-bottom-left"
            style={{
              bottom: typeof window !== "undefined" ? `${window.innerHeight - menuPosition.bottom}px` : 0,
              left: `${menuPosition.left}px`,
            }}
          >
            <a
              href={detailHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowActionsMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 active:scale-95 transition-transform duration-100"
            >
              <Icon name="external-link-alt" size={14} className="text-[var(--brand-orange)]" />
              Open Site
            </a>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); setShowWishlistModal(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
            >
              <Icon name="heart" size={14} className="text-[var(--brand-orange)]" />
              Save
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); setShowTripModal(true); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
            >
              <Icon name="route" size={14} className="text-[var(--brand-orange)]" />
              Add to Trip
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); void handlePlacesNearby(e); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
            >
              <Icon name="nearby" size={14} className="text-[var(--brand-orange)]" />
              Places Nearby
            </button>
            <div className="border-t border-gray-100" />
            <a
              href={galleryHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowActionsMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
            >
              <Icon name="gallery" size={14} className="text-[var(--brand-orange)]" />
              Gallery
            </a>
            <a
              href={photoStoryHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowActionsMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
            >
              <Icon name="book" size={14} className="text-[var(--brand-orange)]" />
              Photo Story
            </a>
            {googleMapsHref && (
              <a
                href={googleMapsHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowActionsMenu(false)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100 active:scale-95 transition-transform duration-100"
              >
                <Icon name="map-marker-alt" size={14} className="text-[var(--brand-orange)]" />
                Open in Google Maps
              </a>
            )}
          </div>
        </Portal>
      )}

      {showWishlistModal && (
        <Portal>
          <AddToWishlistModal
            siteId={site.id}
            onClose={() => setShowWishlistModal(false)}
            site={{
              name: site.title,
              imageUrl: site.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site.cover_photo_url, "thumb") ?? undefined,
              location: site.location_free ?? undefined,
            }}
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

      {/* Mobile actions sheet */}
      <SiteActionsSheet
        site={site}
        isOpen={showActionsMenu}
        onClose={() => setShowActionsMenu(false)}
        onPlacesNearby={onPlacesNearby}
      />
    </div>
  );
}
