// src/app/map/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useMemo } from "react";
import Icon from "@/components/Icon";
import CollapsibleSidebar, { Tool } from "@/components/CollapsibleSidebar";
import { Filters } from "@/components/SearchFilters";
import { supabase } from "@/lib/supabase/browser";
import type { Site as ClientMapSite } from "@/components/ClientOnlyMap";

/* ───────────────────────────── Types ───────────────────────────── */
type MapSite = ClientMapSite & {
  province_id?: number | null;
  province_slug?: string | null; // computed from province_id → provinces.slug
};

/* ───────────────────────────── Debounce ───────────────────────────── */
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debouncedValue;
};

/* ───────────────────────────── Sidebar tools ───────────────────────────── */
const mapTools: Tool[] = [
  { id: "search", name: "Search", icon: "search" },
  { id: "bookmarks", name: "Bookmarks", icon: "heart" },
  { id: "wishlist", name: "Wishlist", icon: "list-ul" },
  { id: "trips", name: "My Trips", icon: "route" },
];

/* ───────── Province helpers (sites.province_id → provinces.slug) ───────── */
async function buildProvinceSlugMapForSites(siteIds: string[]) {
  const out = new Map<string, string | null>();
  if (!siteIds.length) return out;

  const { data: siteRows, error: siteErr } = await supabase
    .from("sites")
    .select("id, province_id")
    .in("id", siteIds);

  if (siteErr || !siteRows?.length) return out;

  const bySiteId = new Map<string, number | null>();
  const provinceIds = new Set<number>();
  for (const r of siteRows as { id: string; province_id: number | null }[]) {
    bySiteId.set(r.id, r.province_id ?? null);
    if (r.province_id != null) provinceIds.add(r.province_id);
  }

  let slugByProvinceId = new Map<number, string>();
  if (provinceIds.size > 0) {
    const { data: provs } = await supabase
      .from("provinces")
      .select("id, slug")
      .in("id", Array.from(provinceIds));
    slugByProvinceId = new Map(
      (provs || []).map((p: any) => [
        p.id as number,
        String(p.slug ?? "").trim(),
      ])
    );
  }

  for (const id of siteIds) {
    const pid = bySiteId.get(id);
    const slug = pid != null ? slugByProvinceId.get(pid) ?? null : null;
    out.set(id, slug && slug.length > 0 ? slug : null);
  }
  return out;
}

export default function MapPage() {
  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
  });

  const [allLocations, setAllLocations] = useState<MapSite[]>([]);
  const [mapSettings, setMapSettings] = useState<any>(null);
  const [allIcons, setAllIcons] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const debouncedName = useDebounce(filters.name, 350);

  /* ───────── Initial load: settings, icons, locations + province slugs ───────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [settingsRes, iconsRes, locationsRes] = await Promise.all([
        supabase
          .from("global_settings")
          .select("value")
          .eq("key", "map_settings")
          .maybeSingle(),
        supabase.from("icons").select("name, svg_content"),
        supabase
          .from("sites")
          .select(
            `id, slug, title, cover_photo_url, location_free, heritage_type, avg_rating, review_count, latitude, longitude, province_id,
             site_categories!inner(category_id, categories(icon_key)),
             site_regions!inner(region_id)`
          )
          .not("latitude", "is", null)
          .not("longitude", "is", null),
      ]);

      if (cancelled) return;

      if (settingsRes.data) {
        setMapSettings(settingsRes.data.value as any);
      }

      if (iconsRes.data) {
        const iconMap = new Map<string, string>();
        (iconsRes.data as any[]).forEach((icon) =>
          iconMap.set(icon.name, icon.svg_content)
        );
        setAllIcons(iconMap); // single set; stable afterwards
      }

      if (locationsRes.data) {
        let valid: MapSite[] = (locationsRes.data as any[])
          .map((site) => ({
            ...site,
            latitude: parseFloat(site.latitude),
            longitude: parseFloat(site.longitude),
          }))
          .filter(
            (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
          );

        // province_slug enrichment (one-time)
        const ids = valid.map((s) => s.id as string);
        const provMap = await buildProvinceSlugMapForSites(ids);
        valid = valid.map((s) => ({
          ...s,
          province_slug: provMap.get(s.id) ?? null,
        }));

        if (!cancelled) setAllLocations(valid);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ───────── Derived filtering (memoized; no setState → fewer renders) ───────── */
  const filteredLocations: MapSite[] = useMemo(() => {
    if (loading) return allLocations;

    let res = allLocations;

    if (debouncedName.trim()) {
      const q = debouncedName.trim().toLowerCase();
      res = res.filter((site) => site.title.toLowerCase().includes(q));
    }
    if (filters.categoryIds.length > 0) {
      const setCats = new Set(filters.categoryIds);
      res = res.filter((site) =>
        (site as any).site_categories?.some((sc: any) =>
          setCats.has(sc.category_id)
        )
      );
    }
    if (filters.regionIds.length > 0) {
      const setRegs = new Set(filters.regionIds);
      res = res.filter((site) =>
        (site as any).site_regions?.some((sr: any) => setRegs.has(sr.region_id))
      );
    }

    return res;
    // Depend on primitives/arrays; arrays are stable since we never recreate allLocations except once
  }, [
    loading,
    allLocations,
    debouncedName,
    filters.categoryIds,
    filters.regionIds,
  ]);

  /* ───────── Map component (no SSR) ───────── */
  const ClientOnlyMap = useMemo(
    () =>
      dynamic(() => import("@/components/ClientOnlyMap"), {
        ssr: false,
        loading: () => (
          <div className="flex items-center justify-center h-full w-full bg-gray-100">
            <Icon
              name="spinner"
              className="animate-spin text-[var(--brand-orange)]"
              size={48}
            />
            <p className="ml-4 text-lg text-gray-600">Initializing Map...</p>
          </div>
        ),
      }),
    []
  );

  return (
    <div className="w-full h-[calc(100vh-88px)] flex">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } } .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }`}</style>

      <CollapsibleSidebar
        tools={mapTools}
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={() => {}}
      />

      <div className="flex-grow h-full relative">
        {loading && (
          <div className="absolute top-4 right-4 z-[1000] bg-white p-2 rounded-full shadow-lg">
            <Icon
              name="spinner"
              className="animate-spin text-[var(--brand-orange)]"
              size={24}
            />
          </div>
        )}
        {/* Pass enriched, memoized data with province_slug for province-aware links */}
        <ClientOnlyMap
          locations={filteredLocations as ClientMapSite[]}
          settings={mapSettings}
          icons={allIcons}
        />
      </div>
    </div>
  );
}
