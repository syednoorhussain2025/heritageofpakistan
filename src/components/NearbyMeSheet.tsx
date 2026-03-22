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
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F78300"/><stop offset="100%" stop-color="var(--brand-green)"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`
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
        <div className="shrink-0 flex items-center gap-3 px-4 pb-3 border-b border-gray-100">
          <img
            src="/illustrations/nearby-search.svg"
            alt=""
            aria-hidden="true"
            className="w-24 h-24 shrink-0 object-contain"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[var(--brand-green)] text-[11px] font-semibold uppercase tracking-wider mb-0.5">Nearby You</p>
            <h2 className="text-[var(--brand-blue)] text-[18px] font-bold leading-tight">
              {loading
                ? "Searching…"
                : sites.length > 0
                  ? `${sites.length} site${sites.length !== 1 ? "s" : ""} found`
                  : "No sites found"}
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {cityName ? `Within ${RADIUS_KM} km of ${cityName}` : `Within ${RADIUS_KM} km of your location`}
            </p>
          </div>
          <button
            onClick={() => { void hapticLight(); handleClose(); }}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 shrink-0 self-start mt-0.5"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={`flex-1 min-h-0 overflow-y-auto px-4 pb-4 ${!expanded ? "overflow-hidden" : ""}`}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="w-7 h-7 border-[3px] border-[var(--brand-green)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Searching within {RADIUS_KM} km…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && sites.length === 0 && (
            <div className="py-10 text-center px-6">
              <img src="/illustrations/nearby-search.svg" alt="" className="w-40 mx-auto mb-4 opacity-60" />
              <p className="text-sm font-semibold text-gray-500">No sites found nearby</p>
              <p className="text-xs text-gray-400 mt-1">No heritage sites within {RADIUS_KM} km of your location.</p>
            </div>
          )}

          {!loading && !error && sites.length > 0 && (
            <div className="flex flex-col divide-y divide-gray-100">
              {sites.map((site, i) => (
                <button
                  key={site.id}
                  onClick={() => {
                    void hapticMedium();
                    handleClose();
                    onSiteSelect(site);
                  }}
                  className="flex items-center gap-3 py-3 text-left active:bg-gray-50 transition-colors"
                >
                  {/* Rank */}
                  <span className="text-[11px] font-bold text-gray-300 w-4 text-center shrink-0">{i + 1}</span>

                  {/* Thumbnail */}
                  <div className="shrink-0 w-[68px] h-[68px] rounded-xl overflow-hidden relative">
                    <img
                      src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
                      alt={site.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
                    />
                    {site.heritage_type && (
                      <span className="absolute bottom-1 left-1 bg-[var(--brand-orange)] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-tight">
                        {site.heritage_type}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[var(--brand-blue)] line-clamp-1">{site.title}</p>
                    <p className="text-[12px] text-gray-400 mt-0.5 line-clamp-1">{site.location_free || "—"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-semibold text-[var(--brand-green)]">
                        {site.distance_km < 1
                          ? `${Math.round(site.distance_km * 1000)} m away`
                          : `${site.distance_km.toFixed(1)} km away`}
                      </span>
                      {site.avg_rating != null && (
                        <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                          <span className="text-yellow-400">★</span>
                          {site.avg_rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>

                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
