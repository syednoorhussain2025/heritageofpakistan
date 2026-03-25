"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import { getPublicClient } from "@/lib/supabase/browser";
import { getCachedBootstrap } from "@/lib/mapCache";
import { hapticMedium } from "@/lib/haptics";
import type { Site as MapSite } from "@/components/ClientOnlyMap";

const ClientOnlyMap = dynamic(() => import("@/components/ClientOnlyMap"), {
  ssr: false,
});

/* ── Haversine ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bboxAround(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export type LocationMapSheetSite = {
  id: string;
  slug: string;
  province_slug?: string | null;
  title: string;
  latitude: number;
  longitude: number;
  cover_photo_url?: string | null;
  cover_photo_thumb_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

interface Props {
  site: LocationMapSheetSite;
  isOpen: boolean;
  onClose: () => void;
}

export default function LocationMapSheet({ site, isOpen, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Map bootstrap (settings + icons) from cache or fetch ── */
  const [mapSettings, setMapSettings] = useState<any>(null);
  const [mapIcons, setMapIcons] = useState<Map<string, string>>(new Map());
  const [bootstrapReady, setBootstrapReady] = useState(false);

  /* ── Nearby sites ── */
  const [nearbySites, setNearbySites] = useState<MapSite[]>([]);
  const [sitesReady, setSitesReady] = useState(false);


  useEffect(() => {
    setMounted(true);
  }, []);

  /* ── Load bootstrap once on mount ── */
  useEffect(() => {
    if (!mounted) return;

    // Try localStorage cache first
    const cached = getCachedBootstrap();
    if (cached?.mapSettings && cached.icons?.length) {
      if (cached.mapSettings != null) setMapSettings(cached.mapSettings);
      const m = new Map<string, string>();
      cached.icons.forEach((ic) => m.set(ic.name, ic.svg_content));
      setMapIcons(m);
      setBootstrapReady(true);
      return;
    }

    // Fetch from Supabase
    let cancelled = false;
    async function loadBootstrap() {
      const supabase = getPublicClient();
      const [settingsRes, iconsRes] = await Promise.all([
        supabase
          .from("global_settings")
          .select("value")
          .eq("key", "map_settings")
          .maybeSingle(),
        supabase.from("icons").select("name, svg_content"),
      ]);
      if (cancelled) return;
      if (settingsRes.data) {
        setMapSettings((settingsRes.data as { value?: Record<string, unknown> }).value ?? null);
      }
      if (iconsRes.data?.length) {
        const m = new Map<string, string>();
        (iconsRes.data as { name: string; svg_content: string }[]).forEach((ic) =>
          m.set(ic.name, ic.svg_content)
        );
        setMapIcons(m);
      }
      setBootstrapReady(true);
    }
    void loadBootstrap();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  /* ── Fetch nearby sites when sheet opens ── */
  useEffect(() => {
    if (!isOpen) return;
    if (!site.latitude || !site.longitude) {
      setSitesReady(true);
      return;
    }

    let cancelled = false;
    setSitesReady(false);
    setNearbySites([]);

    async function fetchNearby() {
      const supabase = getPublicClient();
      const lat = site.latitude;
      const lng = site.longitude;

      // Current site as a MapSite — use all rich data passed from the listing page
      const currentSite: MapSite = {
        id: site.id,
        slug: site.slug,
        title: site.title,
        latitude: lat,
        longitude: lng,
        province_slug: site.province_slug ?? null,
        cover_photo_url: site.cover_photo_url ?? null,
        cover_photo_thumb_url: site.cover_photo_thumb_url ?? null,
        location_free: site.location_free ?? null,
        heritage_type: site.heritage_type ?? null,
        avg_rating: site.avg_rating ?? null,
        review_count: site.review_count ?? null,
        site_categories: [],
      };

      // Try 20km first, fall back to 50km if 0 results
      async function querySites(radiusKm: number): Promise<MapSite[]> {
        const box = bboxAround(lat, lng, radiusKm);
        const { data, error } = await supabase
          .from("sites")
          .select(
            `id, slug, title, cover_photo_url, cover_photo_thumb_url,
             location_free, heritage_type, avg_rating, review_count,
             latitude, longitude, province_id,
             site_categories!inner(category_id, categories(icon_key)),
             site_regions!inner(region_id)`
          )
          .neq("id", site.id)
          .eq("is_published", true)
          .is("deleted_at", null)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .gte("latitude", box.minLat)
          .lte("latitude", box.maxLat)
          .gte("longitude", box.minLng)
          .lte("longitude", box.maxLng)
          .limit(200);

        if (error || !data?.length) return [];

        return (data as any[])
          .map((s) => ({
            ...s,
            latitude: parseFloat(s.latitude),
            longitude: parseFloat(s.longitude),
          }))
          .filter(
            (s) =>
              Number.isFinite(s.latitude) &&
              Number.isFinite(s.longitude) &&
              haversineKm(lat, lng, s.latitude, s.longitude) <= radiusKm
          ) as MapSite[];
      }

      let nearby = await querySites(20);
      if (!cancelled && nearby.length === 0) {
        nearby = await querySites(50);
      }

      if (cancelled) return;
      // Current site first, then nearby sorted by distance
      const sorted = nearby.sort(
        (a, b) =>
          haversineKm(lat, lng, a.latitude, a.longitude) -
          haversineKm(lat, lng, b.latitude, b.longitude)
      );
      setNearbySites([currentSite, ...sorted]);
      setSitesReady(true);
    }

    void fetchNearby();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, site.id]);

  /* ── Open/close animation (matches SiteBottomSheet pattern) ── */
  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      setClosing(false);
      return;
    }
    void hapticMedium();
    raf1Ref.current = requestAnimationFrame(() => {
      raf2Ref.current = requestAnimationFrame(() => {
        raf2Ref.current = null;
        setVisible(true);
      });
    });
    return () => {
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) cancelAnimationFrame(raf2Ref.current);
    };
  }, [isOpen]);

  const closeWithAnimation = useCallback(() => {
    if (closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  if (!mounted || (!isOpen && !closing)) return null;

  const sheetVisible = visible && !closing;

  const sheet = createPortal(
    <div
      className="fixed inset-0 z-[3500] touch-none"
      aria-modal="true"
      role="dialog"
      aria-label={`Map for ${site.title}`}
    >
      {/* Full-screen panel sliding in from the right */}
      <div
        className={`absolute inset-0 overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sheetVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Scoped Leaflet overrides — only affect this sheet's map */}
        <style>{`
          #location-map-sheet .leaflet-container { background: #f0ebe3 !important; }
          #location-map-sheet .leaflet-fade-anim .leaflet-popup { transition: opacity 220ms ease !important; }
          #location-map-sheet .leaflet-zoom-anim .leaflet-zoom-hide { visibility: visible !important; }
          #location-map-sheet .leaflet-tooltip { opacity: 1 !important; visibility: visible !important; transition: opacity 500ms ease !important; }
          #location-map-sheet .leaflet-tooltip.hop-tooltip-hidden { opacity: 0 !important; }
          @keyframes hop-card-in {
            from { opacity: 0; transform: translateY(6px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)  scale(1); }
          }
          #location-map-sheet .leaflet-popup-content-wrapper {
            animation: hop-card-in 220ms cubic-bezier(0.22,1,0.36,1) both !important;
          }
        `}</style>

        {/* Map — full screen */}
        <div id="location-map-sheet" className="absolute inset-0">
          {/* Spinner — stays under map, hidden once map fades in */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f0ebe3]">
            <Icon name="spinner" size={32} className="animate-spin text-[var(--brand-orange)]" />
            <span className="text-sm text-gray-500">Loading map…</span>
          </div>
          {bootstrapReady && sitesReady && (
            <div className="absolute inset-0 animate-in fade-in duration-500">
              <ClientOnlyMap
                locations={nearbySites}
                settings={{
                  ...mapSettings,
                  default_center_lat: site.latitude,
                  default_center_lng: site.longitude,
                  default_zoom: 18,
                }}
                icons={mapIcons}
                highlightSiteId={site.id}
                openPreviewWithoutZoom
                lockHighlightPopup
                mapType="osm"
              />
            </div>
          )}
        </div>

        {/* Floating back button — safe-area aware, frosted glass */}
        <button
          type="button"
          onClick={closeWithAnimation}
          aria-label="Close map"
          className="absolute z-[4000] flex items-center justify-center transition-transform active:scale-90"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 16px)",
            left: "calc(env(safe-area-inset-left, 0px) + 16px)",
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
          }}
        >
          <Icon name="circle-arrow-left" size={28} className="text-gray-800" />
        </button>
      </div>
    </div>,
    document.body
  );

  return sheet;
}
