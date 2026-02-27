// src/components/SitePreviewCard.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import { supabase } from "@/lib/supabase/browser";
import { buildPlacesNearbyURL } from "@/lib/placesNearby";

type Site = {
  id: string;
  slug: string;
  province_slug?: string | null;
  region_slug?: string | null;
  province?: string | null;
  title: string;

  // new thumbnail column coming from sites table
  cover_photo_thumb_url?: string | null;

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
}: {
  site: Site;
  onClose?: () => void;
  /** Index from ExplorePage used to prioritise first two rows */
  index?: number;
}) {
  const router = useRouter();

  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [showTripModal, setShowTripModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const regionSlug = resolveProvinceSlug(site);
  const detailHref = regionSlug
    ? `/heritage/${regionSlug}/${site.slug}`
    : `/heritage/${site.slug}`;
  const prefetchedRef = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Derive isSharpLoaded from which src has actually loaded.
  // This resets to false SYNCHRONOUSLY during render when sharpSrc changes,
  // preventing the stale-true → empty-img flash caused by useEffect timing.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [allowBlur, setAllowBlur] = useState(false);

  const hasBlur = Boolean(site.cover_blur_data_url);

  // use only the thumbnail URL from the table, no transformations, no fallback to cover_photo_url
  const sharpSrc = site.cover_photo_thumb_url || FALLBACK_SVG;

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

  useEffect(() => {
    prefetchedRef.current = false;
  }, [detailHref]);

  const prefetchDetail = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    void router.prefetch(detailHref);
  }, [router, detailHref]);

  // Close desktop popup on outside click
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showActionsMenu]);

  // Animate bottom sheet in after mount
  useEffect(() => {
    if (!showActionsMenu) {
      setSheetVisible(false);
      return;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    let id2: number;
    const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setSheetVisible(true)); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
  }, [showActionsMenu]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Close: transition down first, then unmount.
  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setShowActionsMenu(false);
      closeTimerRef.current = null;
    }, 300);
  }, []);

  return (
    <div className="w-[calc(100%+0.5rem)] -mx-1 sm:w-full sm:mx-0 rounded-xl overflow-hidden bg-white relative border border-[#e5e5e5]">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1 bg-black/40 text-white rounded-full hover:bg-black/60"
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

          {/* Title and location gradient desktop / tablet only */}
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

          {/* Mobile plus button — pinned to image bottom-right */}
          <button
            type="button"
            title="Actions"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(true); }}
            className="md:hidden absolute bottom-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/75 hover:scale-110 transition-all cursor-pointer shadow-md z-[21] backdrop-blur-sm"
          >
            <Icon name="plus" size={13} className="text-white" />
          </button>
        </div>

        {/* Footer */}
        <div
          className="px-2 py-2"
          onClick={(e) => e.preventDefault()}
        >
          {/* Mobile title + location inside white card, no pin */}
          <div className="md:hidden text-gray-900 px-0 pt-0 pb-2">
            <h3 className="text-[16px] font-extrabold leading-tight truncate">
              {site.title}
            </h3>
            {site.location_free && (
              <div className="mt-[1px] text-[11px] text-gray-400 truncate">
                {site.location_free}
              </div>
            )}
          </div>

          {/* Desktop / tablet type left, actions right */}
          <div className="hidden md:flex items-center gap-2 text-gray-700">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Icon
                name="university"
                className="text-[var(--brand-orange)]"
                size={14}
              />
              {site.heritage_type || "—"}
            </span>

            {/* Plus button + popup */}
            <div className="ml-auto relative" ref={actionsMenuRef}>
              <button
                type="button"
                title="Actions"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu((v) => !v); }}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--brand-orange)] hover:scale-110 transition-transform cursor-pointer shadow-md"
              >
                <Icon name="plus" size={16} className="text-white" />
              </button>

              {showActionsMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); setShowWishlistModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700"
                  >
                    <Icon name="heart" size={14} className="text-[var(--brand-orange)]" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); setShowTripModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100"
                  >
                    <Icon name="route" size={14} className="text-[var(--brand-orange)]" />
                    Add to Trip
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowActionsMenu(false); void handlePlacesNearby(e); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100"
                  >
                    <Icon name="nearby" size={14} className="text-[var(--brand-orange)]" />
                    Places Nearby
                  </button>
                </div>
              )}
            </div>
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

      {/* Mobile bottom sheet */}
      {showActionsMenu && (
        <Portal>
          <div className="md:hidden fixed inset-0 z-[3100] touch-none">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${sheetVisible ? "opacity-100" : "opacity-0"}`}
              onClick={closeSheet}
            />
            <div
              className={`absolute bottom-0 left-0 right-0 bg-[#f2f2f7] rounded-t-3xl transition-transform duration-300 ease-out ${sheetVisible ? "translate-y-0" : "translate-y-full"}`}
            >
              {/* Drag handle */}
              <div className="w-10 h-1 bg-gray-400/40 rounded-full mx-auto mt-3" />

              {/* Site name header */}
              <p className="text-center text-[13px] text-gray-500 font-medium pt-3 pb-2 px-8 truncate">
                {site.title}
              </p>

              {/* Actions group */}
              <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => { closeSheet(); setTimeout(() => setShowWishlistModal(true), 310); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="heart" size={16} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Save</span>
                </button>
                <div className="ml-16 mr-0 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={() => { closeSheet(); setTimeout(() => setShowTripModal(true), 310); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="route" size={16} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Add to Trip</span>
                </button>
                <div className="ml-16 mr-0 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={(e) => { void handlePlacesNearby(e as unknown as React.MouseEvent); closeSheet(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                >
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="nearby" size={16} className="text-gray-700" />
                  </div>
                  <span className="text-[15px] font-medium text-gray-900">Places Nearby</span>
                </button>
              </div>

              {/* Cancel */}
              <div className="mx-4 mb-4 bg-white rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={closeSheet}
                  className="w-full px-4 py-4 text-[15px] font-semibold text-[var(--brand-blue)] active:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

              {/* Safe area spacer */}
              <div className="pb-[env(safe-area-inset-bottom,0.5rem)]" />
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
