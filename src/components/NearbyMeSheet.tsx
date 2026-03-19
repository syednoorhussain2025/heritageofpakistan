"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/browser";
import { getPublicClient } from "@/lib/supabase/browser";
import { hapticLight, hapticMedium } from "@/lib/haptics";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type NearbyResult = {
  id: string;
  slug: string;
  title: string;
  location_free: string | null;
  cover_photo_thumb_url: string | null;
  cover_photo_url: string | null;
  heritage_type: string | null;
  avg_rating: number | null;
  review_count: number | null;
  province_id: string | null;
  province_slug?: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
};

const RADIUS_KM = 20;

const FALLBACK_GRADIENT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F78300"/><stop offset="100%" stop-color="#00b78b"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`
  );

/* ─── Province cache ─────────────────────────────────────────────────────── */

const _cache = new Map<string, string>();
let _cachePromise: Promise<void> | null = null;

async function warmCache() {
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    try {
      const { data } = await getPublicClient()
        .from("provinces")
        .select("id, slug");
      for (const p of (data || []) as { id: string; slug: string | null }[]) {
        if (p.id != null) _cache.set(String(p.id), p.slug ?? "");
      }
    } catch {
      /* non-fatal */
    }
  })();
  return _cachePromise;
}

async function attachProvinceSlugs(sites: NearbyResult[]) {
  const missing = sites.filter((s) => !s.province_slug);
  if (!missing.length) return;
  await warmCache();
  for (const s of missing) {
    if (s.province_id != null) {
      const slug = _cache.get(String(s.province_id)) ?? null;
      s.province_slug = slug && slug.length > 0 ? slug : null;
    }
  }
}

/* ─── NearbyMeSheet ──────────────────────────────────────────────────────── */

interface Props {
  isOpen: boolean;
  lat: number | null;
  lng: number | null;
  cityName?: string | null;
  onClose: () => void;
  onSiteSelect: (site: { id: string; slug: string; province_slug?: string | null; title: string; cover_photo_url?: string | null; cover_photo_thumb_url?: string | null; heritage_type?: string | null; avg_rating?: number | null; review_count?: number | null; location_free?: string | null; tagline?: string | null; cover_slideshow_image_ids?: string[] | null }) => void;
}

// Heights as viewport percentages (for math)
const PEEK_VH = 32;
const FULL_VH = 88;

export default function NearbyMeSheet({
  isOpen,
  lat,
  lng,
  cityName,
  onClose,
  onSiteSelect,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [sites, setSites] = useState<NearbyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Drag state — all in refs to avoid re-renders during gesture
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);
  const expandedRef = useRef(false);

  // Keep expandedRef in sync
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  /* ── mount / open — always start in peek mode ── */
  useEffect(() => {
    if (isOpen) {
      setExpanded(false);
      expandedRef.current = false;
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [isOpen]);

  /* ── close animation ── */
  const handleClose = useCallback(() => {
    setClosing(true);
    setVisible(false);
    setTimeout(() => {
      setClosing(false);
      setMounted(false);
      setExpanded(false);
      expandedRef.current = false;
      onClose();
    }, 320);
  }, [onClose]);

  /* ── fetch sites ── */
  useEffect(() => {
    if (!isOpen || lat == null || lng == null) return;
    setSites([]);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "sites_within_radius",
          { center_lat: lat, center_lng: lng, radius_km: RADIUS_KM, name_ilike: null }
        );
        if (rpcError) throw rpcError;

        const ids = ((data as { id: string }[]) || []).map((r) => r.id);
        const distMap = new Map<string, number>(
          ((data as { id: string; distance_km: number }[]) || []).map((r) => [r.id, r.distance_km])
        );

        if (ids.length === 0) { setSites([]); setLoading(false); return; }

        const { data: full } = await supabase
          .from("sites")
          .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids, latitude, longitude")
          .in("id", ids)
          .eq("is_published", true);

        type RawSite = Omit<NearbyResult, "distance_km">;
        const enriched: NearbyResult[] = ((full || []) as unknown as RawSite[]).map(
          (s) => ({ ...s, distance_km: distMap.get(s.id) ?? 0 })
        );
        enriched.sort((a, b) => a.distance_km - b.distance_km);
        await attachProvinceSlugs(enriched);
        setSites(enriched);
      } catch {
        setError("Could not load nearby sites. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, lat, lng]);

  /* ── drag handlers ── */
  const setSheetTransform = (dy: number, animated: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animated
      ? "transform 0.35s cubic-bezier(0.32,0.72,0,1)"
      : "none";
    el.style.transform = dy === 0 ? "" : `translateY(${dy}px)`;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragCurrentY.current = 0;
    isDragging.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    isDragging.current = true;
    dragCurrentY.current = delta;

    const isExp = expandedRef.current;
    // Peek: only allow dragging down. Full: only allow dragging down.
    // Allow upward drag in peek too (feels natural), but clamp it.
    if (!isExp && delta < -40) return; // don't drag above peek origin much
    if (delta < 0 && !isExp) return;   // in peek, resist upward beyond small threshold

    setSheetTransform(Math.max(0, delta), false);
  };

  const onTouchEnd = () => {
    if (!isDragging.current) {
      dragStartY.current = null;
      return;
    }
    const delta = dragCurrentY.current;
    isDragging.current = false;
    dragStartY.current = null;

    const isExp = expandedRef.current;

    if (!isExp) {
      if (delta < -60) {
        // Swiped up enough from peek → expand
        // Animate sheet back to origin first, then let height transition take over
        setSheetTransform(0, true);
        setTimeout(() => { void hapticLight(); setExpanded(true); }, 10);
      } else if (delta > 80) {
        // Swiped down from peek → close (animate down then close)
        void hapticLight();
        const el = sheetRef.current;
        if (el) {
          el.style.transition = "transform 0.32s cubic-bezier(0.32,0.72,0,1)";
          el.style.transform = "translateY(100%)";
          setTimeout(() => handleClose(), 320);
        } else {
          handleClose();
        }
      } else {
        // Snap back to peek
        setSheetTransform(0, true);
      }
    } else {
      if (delta > 100) {
        // Swiped down enough from full → collapse to peek
        setSheetTransform(0, true);
        setTimeout(() => { void hapticLight(); setExpanded(false); }, 10);
      } else {
        // Snap back to full
        setSheetTransform(0, true);
      }
    }

    dragCurrentY.current = 0;
  };

  if (!mounted && !closing) return null;

  const content = (
    <div
      className="fixed inset-0 z-[3002]"
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.35)",
          opacity: visible && expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-[24px] flex flex-col"
        style={{
          height: expanded ? `${FULL_VH}dvh` : `${PEEK_VH}dvh`,
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1), height 0.35s cubic-bezier(0.32,0.72,0,1)",
          paddingBottom: "env(safe-area-inset-bottom, 12px)",
          willChange: "transform, height",
          touchAction: "none",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 shrink-0 cursor-pointer"
          onClick={() => { void hapticLight(); setExpanded((v) => !v); }}
        >
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-1.5 pb-3 shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1c1f4c]">Nearby Me</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading
                ? "Searching…"
                : sites.length > 0
                  ? `${sites.length} ${sites.length === 1 ? "site" : "sites"} within ${RADIUS_KM} km`
                  : cityName
                    ? `Within ${RADIUS_KM} km of ${cityName}`
                    : `Heritage sites within ${RADIUS_KM} km`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void hapticLight(); setExpanded((v) => !v); }}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => { void hapticLight(); handleClose(); }}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
              aria-label="Close"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 pb-2 ${!expanded ? "overflow-hidden" : ""}`}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="w-7 h-7 border-[3px] border-[#00c9a7] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Searching within {RADIUS_KM} km…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && sites.length === 0 && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No sites found nearby</p>
              <p className="text-xs text-gray-400 mt-1">No heritage sites within {RADIUS_KM} km of your location.</p>
            </div>
          )}

          {!loading && !error && sites.length > 0 && (
            <div className="flex flex-col gap-3">
              {sites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => {
                    void hapticMedium();
                    handleClose();
                    onSiteSelect(site);
                  }}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left active:bg-gray-50"
                >
                  <div className="shrink-0 w-20 h-20 relative">
                    <img
                      src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
                      alt={site.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
                    />
                    {site.heritage_type && (
                      <span className="absolute bottom-1 left-1 bg-[#F78300] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-tight">
                        {site.heritage_type}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 py-3 pr-3">
                    <p className="text-sm font-bold text-[#1c1f4c] line-clamp-1">{site.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{site.location_free || "—"}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[#00b78b] bg-[#00c9a7]/10 px-2 py-0.5 rounded-full">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        {site.distance_km < 1
                          ? `${Math.round(site.distance_km * 1000)} m`
                          : `${site.distance_km.toFixed(1)} km`}
                      </span>
                      {site.avg_rating != null && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <span className="text-yellow-400">★</span>
                          {site.avg_rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pr-3 shrink-0">
                    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
