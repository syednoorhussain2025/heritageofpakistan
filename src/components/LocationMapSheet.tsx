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

      // Current site as a MapSite (always shown)
      const currentSite: MapSite = {
        id: site.id,
        slug: site.slug,
        title: site.title,
        latitude: lat,
        longitude: lng,
        province_slug: site.province_slug ?? null,
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
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
          sheetVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeWithAnimation}
        aria-hidden="true"
      />

      {/* Full-height sheet sliding up from bottom */}
      <div
        className={`absolute left-0 right-0 bottom-0 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sheetVisible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ top: 0 }}
      >
        {/* Header — safe area aware */}
        <div
          className="shrink-0 flex items-center gap-3 px-4 bg-white border-b border-gray-100 z-10"
          style={{
            paddingTop: "max(env(safe-area-inset-top, 0px), 16px)",
            paddingBottom: "12px",
          }}
        >
          <button
            type="button"
            onClick={closeWithAnimation}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shrink-0"
            aria-label="Close map"
          >
            <Icon name="arrow-left" size={16} className="text-gray-700" />
          </button>
          <h2 className="flex-1 min-w-0 text-[15px] font-semibold text-[var(--brand-blue)] truncate">
            {site.title}
          </h2>
        </div>

        {/* Map — fills remaining space */}
        <div className="flex-1 relative overflow-hidden">
          {(!bootstrapReady || !sitesReady) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50 z-10">
              <Icon name="spinner" size={32} className="animate-spin text-[var(--brand-orange)]" />
              <span className="text-sm text-gray-500">Loading map…</span>
            </div>
          )}
          {bootstrapReady && sitesReady && (
            <ClientOnlyMap
              locations={nearbySites}
              settings={mapSettings}
              icons={mapIcons}
              highlightSiteId={site.id}
              mapType="osm"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return sheet;
}
