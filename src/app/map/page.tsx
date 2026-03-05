// src/app/map/page.tsx
"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import CollapsibleSidebar, { Tool } from "@/components/CollapsibleSidebar";
import SearchFilters, { Filters } from "@/components/SearchFilters";
import NearbySearchModal from "@/components/NearbySearchModal";
import { clearPlacesNearby } from "@/lib/placesNearby";
import { supabase } from "@/lib/supabase/browser";
import type { Site as ClientMapSite, MapType } from "@/components/ClientOnlyMap";
import { useBookmarks } from "@/components/BookmarkProvider";
import { getWishlists, getWishlistItems } from "@/lib/wishlists";
import { listTripsByUsername, getTripWithItems, getTripTimeline, type TimelineItem } from "@/lib/trips";
import Link from "next/link";

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

type SidebarFilter =
  | null
  | "bookmarks"
  | { wishlistId: string }
  | { tripId: string };

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

/* ───────────────────────────── Distance (haversine) ───────────────────────────── */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ───────────────────────────── Map headline helpers ───────────────────────────── */
function humanJoinMap(list: string[]) {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

function buildMapHeadline({
  query,
  categoryNames,
  regionNames,
  sidebarFilter,
  wishlistName,
  tripName,
  centerSiteTitle,
  radiusKm,
  nearbyActive,
}: {
  query: string;
  categoryNames: string[];
  regionNames: string[];
  sidebarFilter: SidebarFilter;
  wishlistName?: string | null;
  tripName?: string | null;
  centerSiteTitle?: string | null;
  radiusKm?: number | null;
  nearbyActive?: boolean;
}) {
  if (sidebarFilter === "bookmarks") return "Bookmarks";
  if (typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter) {
    return wishlistName ?? "Wishlist";
  }
  if (typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter) {
    return tripName ?? "Trip";
  }

  /* "Search Around a Site" (nearby) takes precedence over text/category/region */
  if (nearbyActive && (typeof radiusKm === "number" || centerSiteTitle)) {
    const siteLabel = centerSiteTitle || "Selected Site";
    const kmLabel = typeof radiusKm === "number" ? `${radiusKm} km` : "Radius";
    return `Sites around ${siteLabel} within ${kmLabel}`;
  }

  const q = (query || "").trim();
  const hasCats = categoryNames.length > 0;
  const hasRegs = regionNames.length > 0;

  if (q && !hasCats && !hasRegs) return `Search for "${q}"`;
  if (hasCats && !hasRegs) {
    const cats = humanJoinMap(categoryNames);
    return q ? `${cats} in Pakistan matching "${q}"` : `${cats} in Pakistan`;
  }
  if (!hasCats && hasRegs) {
    const regs = regionNames.length === 1 ? regionNames[0] : humanJoinMap(regionNames);
    return q ? `Sites in ${regs} matching "${q}"` : `Sites in ${regs}`;
  }
  if (hasCats && hasRegs) {
    const cats = humanJoinMap(categoryNames);
    const regs = regionNames.length === 1 ? regionNames[0] : humanJoinMap(regionNames);
    return q ? `${cats} in ${regs} matching "${q}"` : `${cats} in ${regs}`;
  }
  return "All Heritage Sites";
}

export default function MapPage() {
  const { bookmarkedIds, isLoaded: bookmarksLoaded } = useBookmarks();
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
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
  const [sitesLoading, setSitesLoading] = useState(true);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [regionMap, setRegionMap] = useState<Record<string, string>>({});

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>(null);
  const [wishlistSiteIds, setWishlistSiteIds] = useState<string[]>([]);
  const [tripSiteIds, setTripSiteIds] = useState<string[]>([]);

  const [wishlists, setWishlists] = useState<{ id: string; name: string; wishlist_items: { count: number }[] }[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(false);
  const [trips, setTrips] = useState<{ id: string; name: string; slug?: string | null }[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [showNearbyModal, setShowNearbyModal] = useState(false);
  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<"search" | "bookmarks" | "wishlist" | "trips" | "site">("search");
  const [highlightSiteId, setHighlightSiteId] = useState<string | null>(null);
  const [expandedWishlistId, setExpandedWishlistId] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<{ site_id: string; sites: { title: string; slug: string; cover_photo_url: string | null } | null }[]>([]);
  const [wishlistItemsLoading, setWishlistItemsLoading] = useState(false);
  type TripItemMap = { id?: string; site_id: string; day_id?: string | null; order_index?: number; date_in?: string | null; site?: { id: string; title: string; slug: string; cover_photo_url: string | null } | null };
  const [tripItems, setTripItems] = useState<TripItemMap[]>([]);
  const [tripItemsLoading, setTripItemsLoading] = useState(false);
  const [tripTimeline, setTripTimeline] = useState<TimelineItem[]>([]);
  const [tripTimelineLoading, setTripTimelineLoading] = useState(false);
  const [mapType, setMapType] = useState<MapType>("osm");
  const mapTypeInitializedRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const stableLocationsRef = useRef<{ key: string; value: MapSite[] }>({ key: "", value: [] });

  // ── Map action toast ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastLoading, setToastLoading] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const filteredLocationsRef = useRef<MapSite[]>([]);
  const filterToastInitRef = useRef(false);

  // Selected site (from clicking a map pin) — shown in the left panel on desktop
  // and in the mobile search panel on mobile.
  const [selectedMapSite, setSelectedMapSite] = useState<MapSite | null>(null);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const debouncedName = useDebounce(filters.name, 350);

  const selectedCategoryNames = useMemo(
    () => filters.categoryIds.map((id) => categoryMap[id]).filter(Boolean) as string[],
    [filters.categoryIds, categoryMap]
  );
  const selectedRegionNames = useMemo(
    () => filters.regionIds.map((id) => regionMap[id]).filter(Boolean) as string[],
    [filters.regionIds, regionMap]
  );
  const activeWishlistName = useMemo(() => {
    if (typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter) {
      return wishlists.find((w) => w.id === sidebarFilter.wishlistId)?.name ?? null;
    }
    return null;
  }, [sidebarFilter, wishlists]);
  const activeTripName = useMemo(() => {
    if (typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter) {
      return trips.find((t) => t.id === sidebarFilter.tripId)?.name ?? null;
    }
    return null;
  }, [sidebarFilter, trips]);
  const nearbyActive =
    filters.centerSiteId != null &&
    filters.centerLat != null &&
    filters.centerLng != null &&
    filters.radiusKm != null;
  const mapHeadline = useMemo(
    () => buildMapHeadline({
      query: debouncedName,
      categoryNames: selectedCategoryNames,
      regionNames: selectedRegionNames,
      sidebarFilter,
      wishlistName: activeWishlistName,
      tripName: activeTripName,
      centerSiteTitle,
      radiusKm: filters.radiusKm,
      nearbyActive,
    }),
    [debouncedName, selectedCategoryNames, selectedRegionNames, sidebarFilter, activeWishlistName, activeTripName, centerSiteTitle, filters.radiusKm, nearbyActive]
  );

  /* Keep centerSiteTitle in sync when "Search Around a Site" center changes */
  useEffect(() => {
    let active = true;
    if (!filters.centerSiteId) {
      setCenterSiteTitle(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("id,title")
        .eq("id", filters.centerSiteId)
        .maybeSingle();
      if (active && data) setCenterSiteTitle((data as { title: string }).title);
    })();
    return () => { active = false; };
  }, [filters.centerSiteId]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setIsSignedIn(!!user?.id);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      setWishlistsLoading(true);
      try {
        const list = await getWishlists();
        if (!cancelled) setWishlists(list as { id: string; name: string; wishlist_items: { count: number }[] }[]);
      } catch {
        if (!cancelled) setWishlists([]);
      } finally {
        if (!cancelled) setWishlistsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      setTripsLoading(true);
      try {
        const list = await listTripsByUsername("");
        if (!cancelled) setTrips((list ?? []).map((t) => ({ id: t.id, name: t.name, slug: t.slug })));
      } catch {
        if (!cancelled) setTrips([]);
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!expandedWishlistId || !isSignedIn) {
      setWishlistItems([]);
      return;
    }
    let cancelled = false;
    setWishlistItemsLoading(true);
    getWishlistItems(expandedWishlistId)
      .then((data) => {
        if (!cancelled) {
          const raw = (data ?? []) as unknown as { site_id: string; sites?: { title: string; slug: string; cover_photo_url: string | null } | { title: string; slug: string; cover_photo_url: string | null }[] }[];
          const normalized: { site_id: string; sites: { title: string; slug: string; cover_photo_url: string | null } | null }[] = raw.map((item) => ({
            site_id: item.site_id,
            sites: Array.isArray(item.sites) ? item.sites[0] ?? null : item.sites ?? null,
          }));
          setWishlistItems(normalized);
        }
      })
      .catch(() => { if (!cancelled) setWishlistItems([]); })
      .finally(() => { if (!cancelled) setWishlistItemsLoading(false); });
    return () => { cancelled = true; };
  }, [expandedWishlistId, isSignedIn]);

  // Load trip items when a trip is applied to the map (for the right-hand details panel only)
  const tripIdToLoad =
    typeof sidebarFilter === "object" &&
    sidebarFilter !== null &&
    "tripId" in sidebarFilter
      ? sidebarFilter.tripId
      : null;

  useEffect(() => {
    if (!tripIdToLoad || !isSignedIn) {
      setTripItems([]);
      setTripTimeline([]);
      return;
    }
    let cancelled = false;
    setTripItemsLoading(true);
    setTripTimelineLoading(true);
    getTripWithItems(tripIdToLoad)
      .then(({ items }) => {
        if (!cancelled) setTripItems((items ?? []) as TripItemMap[]);
      })
      .catch(() => { if (!cancelled) setTripItems([]); })
      .finally(() => { if (!cancelled) setTripItemsLoading(false); });
    getTripTimeline(tripIdToLoad)
      .then((timeline) => { if (!cancelled) setTripTimeline(timeline ?? []); })
      .catch(() => { if (!cancelled) setTripTimeline([]); })
      .finally(() => { if (!cancelled) setTripTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [tripIdToLoad, isSignedIn]);

  /* ───────── Phase 1: Load settings, icons, categories, regions (fast) so map shell renders ───────── */
  useEffect(() => {
    let cancelled = false;
    const QUICK_LOAD_TIMEOUT_MS = 8000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("QUICK_LOAD_TIMEOUT")), QUICK_LOAD_TIMEOUT_MS)
    );
    (async () => {
      setLoading(true);
      setLoadError(false);
      setSitesLoading(true);
      let settingsRes: any;
      let iconsRes: any;
      let catsRes: any;
      let regsRes: any;
      try {
        [settingsRes, iconsRes, catsRes, regsRes] = await Promise.race([
          Promise.all([
            supabase
              .from("global_settings")
              .select("value")
              .eq("key", "map_settings")
              .maybeSingle(),
            supabase.from("icons").select("name, svg_content"),
            supabase.from("categories").select("id,name").order("name"),
            supabase.from("regions").select("id,name").order("name"),
          ]),
          timeoutPromise,
        ]);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === "QUICK_LOAD_TIMEOUT") {
          setLoadError(true);
          setLoading(false);
          setSitesLoading(false);
          return;
        }
        throw err;
      }

      if (cancelled) return;

      if (settingsRes?.data) {
        setMapSettings(settingsRes.data.value as any);
      }
      if (iconsRes?.data) {
        const iconMap = new Map<string, string>();
        (iconsRes.data as any[]).forEach((icon: { name: string; svg_content: string }) =>
          iconMap.set(icon.name, icon.svg_content)
        );
        setAllIcons(iconMap);
      }
      if (catsRes?.data) {
        const m: Record<string, string> = {};
        (catsRes.data as { id: string; name: string }[]).forEach((r) => { m[r.id] = r.name; });
        setCategoryMap(m);
      }
      if (regsRes?.data) {
        const m: Record<string, string> = {};
        (regsRes.data as { id: string; name: string }[]).forEach((r) => { m[r.id] = r.name; });
        setRegionMap(m);
      }

      setLoading(false);

      /* ───────── Phase 2: Load sites in background (no blocking; longer timeout) ───────── */
      const SITES_LOAD_TIMEOUT_MS = 45000;
      const sitesTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SITES_LOAD_TIMEOUT")), SITES_LOAD_TIMEOUT_MS)
      );
      let locationsRes: { data?: any[]; error?: unknown } | undefined;
      try {
        locationsRes = await Promise.race([
          supabase
            .from("sites")
            .select(
              `id, slug, title, cover_photo_url, location_free, heritage_type, avg_rating, review_count, tagline, latitude, longitude, province_id,
             site_categories!inner(category_id, categories(icon_key)),
             site_regions!inner(region_id)`
            )
            .not("latitude", "is", null)
            .not("longitude", "is", null),
          sitesTimeoutPromise,
        ]) as { data?: any[]; error?: unknown };
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === "SITES_LOAD_TIMEOUT") {
          setLoadError(true);
        }
        setSitesLoading(false);
        return;
      }

      if (cancelled) return;
      if (locationsRes?.error) {
        setSitesLoading(false);
        return;
      }

      if (locationsRes?.data && locationsRes.data.length > 0) {
        let valid: MapSite[] = (locationsRes.data as any[])
          .map((site: any) => ({
            ...site,
            latitude: parseFloat(site.latitude),
            longitude: parseFloat(site.longitude),
          }))
          .filter(
            (s: MapSite) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
          );

        const ids = valid.map((s) => s.id as string);
        const provMap = await buildProvinceSlugMapForSites(ids);
        valid = valid.map((s) => ({
          ...s,
          province_slug: provMap.get(s.id) ?? null,
        }));

        if (!cancelled) setAllLocations(valid);
      }

      if (!cancelled) setSitesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Sync map type from admin settings once when settings load */
  useEffect(() => {
    if (mapTypeInitializedRef.current || !mapSettings) return;
    mapTypeInitializedRef.current = true;
    setMapType((prev) => {
      const p = mapSettings as { provider?: string };
      return p?.provider === "google" ? "google" : prev;
    });
  }, [mapSettings]);

  /* ───────── Derived filtering (memoized; no setState → fewer renders) ───────── */
  const filteredLocations: MapSite[] = useMemo(() => {
    if (loading) return allLocations;

    const clat = filters.centerLat;
    const clng = filters.centerLng;
    const rkm = filters.radiusKm;
    const nearbyActive =
      typeof clat === "number" &&
      typeof clng === "number" &&
      typeof rkm === "number" &&
      rkm > 0;

    let res = allLocations;

    /* When "Search Around a Site" is active, only apply distance (and sidebar). Ignore name/category/region. */
    if (!nearbyActive) {
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
    }

    if (sidebarFilter === "bookmarks" && bookmarksLoaded) {
      res = res.filter((site) => bookmarkedIds.has(site.id));
    } else if (
      typeof sidebarFilter === "object" &&
      sidebarFilter !== null &&
      "wishlistId" in sidebarFilter &&
      wishlistSiteIds.length > 0
    ) {
      const set = new Set(wishlistSiteIds);
      res = res.filter((site) => set.has(site.id));
    } else if (
      typeof sidebarFilter === "object" &&
      sidebarFilter !== null &&
      "tripId" in sidebarFilter &&
      tripSiteIds.length > 0
    ) {
      const set = new Set(tripSiteIds);
      res = res.filter((site) => set.has(site.id));
    }

    /* Filter by "Search Around a Site" radius when active */
    if (nearbyActive) {
      res = res.filter((site) => {
        const lat = Number(site.latitude);
        const lng = Number(site.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return haversineKm(clat, clng, lat, lng) <= rkm!;
      });
    }

    /* Return stable reference when the set of locations is unchanged to avoid map re-render storms */
    const key = res.length + "|" + res.map((s) => s.id).sort().join(",");
    const prev = stableLocationsRef.current;
    if (prev.key === key) return prev.value;
    stableLocationsRef.current = { key, value: res };
    return res;
  }, [
    loading,
    allLocations,
    debouncedName,
    filters.categoryIds,
    filters.regionIds,
    filters.centerLat,
    filters.centerLng,
    filters.radiusKm,
    sidebarFilter,
    bookmarksLoaded,
    bookmarkedIds,
    wishlistSiteIds,
    tripSiteIds,
  ]);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!searchPanelOpen) {
      setSearchPanelVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSearchPanelVisible(true));
    });
    return () => cancelAnimationFrame(id);
  }, [searchPanelOpen]);
  const closeSearchPanel = useCallback(() => {
    setSearchPanelVisible(false);
    setTimeout(() => setSearchPanelOpen(false), 300);
  }, []);
  useEffect(() => {
    if (searchPanelOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [searchPanelOpen]);

  const showMapToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastLoading(false);
    setToastMessage(message);
    setToastVisible(true);
    setToastOpen(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setToastOpen(true));
    });
    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      window.setTimeout(() => setToastVisible(false), 220);
    }, 2500);
  }, []);

  const showLoadingTripToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastLoading(true);
    setToastMessage("Loading Trip");
    setToastVisible(true);
    setToastOpen(true);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current); };
  }, []);

  // Show "Loading Trip" toast while trip items load; show success toast only after trip is fully loaded
  const isTripActive =
    typeof sidebarFilter === "object" &&
    sidebarFilter !== null &&
    "tripId" in sidebarFilter;
  useEffect(() => {
    if (isTripActive && (tripItemsLoading || tripTimelineLoading)) {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToastLoading(true);
      setToastMessage("Loading Trip");
      setToastVisible(true);
      setToastOpen(true);
    } else if (toastLoading && !tripItemsLoading && !tripTimelineLoading && isTripActive && tripItems.length > 0) {
      const name = activeTripName ?? "Trip";
      const count = tripItems.length;
      showMapToast(`Loaded Trip '${name}' and ${count} ${count === 1 ? "site" : "sites"} loaded`);
    }
  }, [isTripActive, tripItemsLoading, tripTimelineLoading, toastLoading, activeTripName, tripItems.length, showMapToast]);

  // Keep a ref to the current filteredLocations so the filter toast effect can read it without deps
  filteredLocationsRef.current = filteredLocations;

  // Show a toast when the user applies text/category/region search filters
  useEffect(() => {
    if (!filterToastInitRef.current) {
      filterToastInitRef.current = true;
      return;
    }
    const hasActive =
      debouncedName.trim() !== "" ||
      filters.categoryIds.length > 0 ||
      filters.regionIds.length > 0;
    if (!hasActive) return;
    const count = filteredLocationsRef.current.length;
    showMapToast(`${count} ${count === 1 ? "site" : "sites"} found`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName, filters.categoryIds, filters.regionIds]);

  const applyWishlistFilter = useCallback(async (wishlistId: string, wishlistName?: string) => {
    const { data } = await supabase
      .from("wishlist_items")
      .select("site_id")
      .eq("wishlist_id", wishlistId);
    const ids = (data ?? []).map((r: { site_id: string }) => r.site_id);
    setWishlistSiteIds(ids);
    setSidebarFilter({ wishlistId });
    const count = ids.length;
    const label = wishlistName ? `"${wishlistName}"` : "Wishlist";
    showMapToast(`${label} · ${count} ${count === 1 ? "site" : "sites"} on map`);
  }, [showMapToast]);

  const applyTripFilter = useCallback(async (tripId: string, tripName?: string) => {
    showLoadingTripToast();
    try {
      const { items } = await getTripWithItems(tripId);
      const ids = (items ?? []).map((it: { site_id: string }) => it.site_id);
      setTripSiteIds(ids);
      setSidebarFilter({ tripId });
    } catch {
      setTripSiteIds([]);
      setToastLoading(false);
      setToastOpen(false);
      window.setTimeout(() => setToastVisible(false), 220);
    }
  }, [showLoadingTripToast]);

  const clearSidebarFilter = useCallback(() => {
    setSidebarFilter(null);
    setWishlistSiteIds([]);
    setTripSiteIds([]);
  }, []);

  // Called when the user clicks a pin on the map
  const handleSiteSelect = useCallback((site: MapSite) => {
    setSelectedMapSite(site);
    // Mobile: open the slide-up panel showing site details
    setMobilePanelTab("site");
    setSearchPanelOpen(true);
  }, []);

  const signInRedirectUrl = "/auth/sign-in?redirectTo=" + encodeURIComponent("/map");

  const renderToolPanel = useCallback(
    (toolId: string, onClose: () => void) => {
      if (toolId === "site") {
        if (!selectedMapSite) return null;
        const regionSlug = selectedMapSite.province_slug ?? null;
        const detailHref = regionSlug
          ? `/heritage/${regionSlug}/${selectedMapSite.slug}`
          : `/heritage/${selectedMapSite.slug}`;
        return (
          <div className="flex flex-col">
            {/* Cover photo */}
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-300 flex-shrink-0">
              {selectedMapSite.cover_photo_url ? (
                <img
                  src={selectedMapSite.cover_photo_url}
                  alt={selectedMapSite.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#F78300] to-[#00b78b]" />
              )}
              {/* Close button overlaid on photo */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                title="Close"
              >
                <Icon name="times" size={16} />
              </button>
            </div>

            {/* Details */}
            <div className="p-4 flex flex-col gap-3">
              {/* Title */}
              <h2 className="text-xl font-bold text-[var(--brand-blue)] leading-tight">
                {selectedMapSite.title}
              </h2>

              {/* Rating */}
              {selectedMapSite.avg_rating != null && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#00b78b] text-white text-sm font-semibold inline-flex items-center gap-1">
                    <Icon name="star" size={12} />
                    {selectedMapSite.avg_rating.toFixed(1)}
                  </span>
                  {selectedMapSite.review_count != null && selectedMapSite.review_count > 0 && (
                    <span className="text-sm text-gray-500">
                      {selectedMapSite.review_count}{" "}
                      {selectedMapSite.review_count === 1 ? "Review" : "Reviews"}
                    </span>
                  )}
                </div>
              )}

              {/* Tagline */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedMapSite.heritage_type && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F78300]/10 text-[#F78300] font-medium text-xs">
                    {selectedMapSite.heritage_type}
                  </span>
                )}
                {selectedMapSite.location_free && (
                  <span className="flex items-center gap-1 text-gray-500 text-xs">
                    <Icon name="map-marker-alt" size={11} />
                    {selectedMapSite.location_free}
                  </span>
                )}
              </div>

              {/* Tagline */}
              {selectedMapSite.tagline && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {selectedMapSite.tagline}
                </p>
              )}

              {/* Open Site button */}
              <Link
                href={detailHref}
                className="mt-2 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Open Site
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          </div>
        );
      }

      if (toolId === "bookmarks") {
        if (isSignedIn === false) {
          return (
            <div className="p-4 flex flex-col items-center justify-center min-h-[200px] text-center bg-gray-50/80 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">Sign in to View Bookmarks</p>
              <Link
                href={signInRedirectUrl}
                className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold hover:opacity-90"
              >
                Sign in
              </Link>
            </div>
          );
        }
        const bookmarkedSites = allLocations.filter((s) => bookmarkedIds.has(s.id));
        return (
          <div className="p-4 space-y-3">
            {sidebarFilter === "bookmarks" && (
              <button
                type="button"
                onClick={() => { clearSidebarFilter(); onClose(); }}
                className="text-sm text-[var(--brand-orange)] font-medium"
              >
                Clear · Show all on map
              </button>
            )}
            {!bookmarksLoaded ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : bookmarkedSites.length === 0 ? (
              <p className="text-sm text-gray-500">
                No bookmarks yet. Add sites from the heart icon on a site.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {bookmarkedSites.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow">
                    <button
                      type="button"
                      onClick={() => { setHighlightSiteId(s.id); onClose(); }}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                    >
                      <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                        {(s as any).cover_photo_url ? (
                          <img
                            src={(s as any).cover_photo_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                            <Icon name="map-pin" size={18} />
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {bookmarkedSites.length > 0 && (
              <button
                type="button"
                onClick={() => { setSidebarFilter("bookmarks"); onClose(); }}
                className="flex w-full items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold"
              >
                <Icon name="map-pin" size={16} />
                Show on map
              </button>
            )}
          </div>
        );
      }
      if (toolId === "wishlist") {
        if (isSignedIn === false) {
          return (
            <div className="p-4 flex flex-col items-center justify-center min-h-[200px] text-center bg-gray-50/80 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">Sign in to View Wishlists</p>
              <Link
                href={signInRedirectUrl}
                className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold hover:opacity-90"
              >
                Sign in
              </Link>
            </div>
          );
        }
        const expandedWishlist = expandedWishlistId ? wishlists.find((w) => w.id === expandedWishlistId) : null;
        const activeWishlistId = typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter
          ? sidebarFilter.wishlistId : null;

        return (
          <div className="flex flex-col min-h-0 h-full">
            {expandedWishlistId ? (
              /* ── Expanded: single wishlist ── */
              <>
                {/* Header */}
                <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setExpandedWishlistId(null)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--brand-blue)] font-medium mb-2 transition-colors"
                  >
                    <Icon name="arrow-left" size={12} />
                    All wishlists
                  </button>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[var(--brand-blue)] truncate leading-tight">
                        {expandedWishlist?.name ?? "Wishlist"}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {wishlistItems.length} {wishlistItems.length === 1 ? "site" : "sites"}
                      </p>
                    </div>
                    {wishlistItems.length > 0 && (
                      activeWishlistId === expandedWishlistId ? (
                        <button
                          type="button"
                          onClick={() => { clearSidebarFilter(); onClose(); }}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-orange)] border border-[var(--brand-orange)] rounded-lg px-2.5 py-1.5 hover:bg-orange-50 transition-colors"
                        >
                          <Icon name="times" size={10} />
                          Clear filter
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { applyWishlistFilter(expandedWishlistId, expandedWishlist?.name); onClose(); }}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-orange)] rounded-lg px-2.5 py-1.5 hover:opacity-90 transition-opacity"
                        >
                          <Icon name="map-pin" size={10} />
                          Show on map
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Site list */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  {wishlistItemsLoading ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                      <Icon name="spinner" size={16} className="animate-spin" />
                      <span className="text-sm">Loading sites…</span>
                    </div>
                  ) : wishlistItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Icon name="heart" size={28} className="text-gray-200 mb-2" />
                      <p className="text-sm text-gray-500">No sites in this wishlist yet.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {wishlistItems.map((item) => {
                        const site = item.sites;
                        const title = site?.title ?? "Site";
                        const cover = site?.cover_photo_url ?? null;
                        return (
                          <li key={item.site_id}>
                            <button
                              type="button"
                              onClick={() => { setHighlightSiteId(item.site_id); onClose(); }}
                              className="w-full flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5 shadow-sm hover:border-[var(--brand-orange)]/50 hover:shadow-md transition-all text-left group"
                            >
                              <span className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                {cover ? (
                                  <img src={cover} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-gray-300">
                                    <Icon name="map-pin" size={18} />
                                  </span>
                                )}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate">{title}</span>
                                <span className="block text-xs text-gray-400 mt-0.5">Tap to locate on map</span>
                              </span>
                              <Icon name="map-pin" size={14} className="text-gray-300 group-hover:text-[var(--brand-orange)] shrink-0 transition-colors" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              /* ── List: all wishlists ── */
              <>
                {/* Active filter banner */}
                {activeWishlistId && (
                  <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="map-pin" size={13} className="text-[var(--brand-orange)] shrink-0" />
                      <span className="text-xs font-medium text-orange-800 truncate">
                        {wishlists.find((w) => w.id === activeWishlistId)?.name ?? "Wishlist"} active
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { clearSidebarFilter(); onClose(); }}
                      className="shrink-0 text-xs font-semibold text-[var(--brand-orange)] hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                  {wishlistsLoading ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                      <Icon name="spinner" size={16} className="animate-spin" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : wishlists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Icon name="heart" size={32} className="text-gray-200 mb-2" />
                      <p className="text-sm font-medium text-gray-500">No wishlists yet</p>
                      <p className="text-xs text-gray-400 mt-1">Save sites from their detail pages to create wishlists.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {wishlists.map((w) => {
                        const count = (w.wishlist_items?.[0] as { count?: number })?.count ?? 0;
                        const isActive = activeWishlistId === w.id;
                        return (
                          <li key={w.id}
                            className={`rounded-xl border bg-white shadow-sm transition-all ${
                              isActive ? "border-[var(--brand-orange)] ring-1 ring-[var(--brand-orange)]/20" : "border-gray-100 hover:border-gray-200 hover:shadow-md"
                            }`}
                          >
                            <div className="flex items-center gap-0">
                              {/* Expand row */}
                              <button
                                type="button"
                                onClick={() => { setExpandedWishlistId(w.id); applyWishlistFilter(w.id, w.name); }}
                                className="flex flex-1 min-w-0 items-center gap-3 p-3 text-left"
                              >
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  isActive ? "bg-[var(--brand-orange)]" : "bg-orange-50"
                                }`}>
                                  <Icon name="heart" size={14} className={isActive ? "text-white" : "text-[var(--brand-orange)]"} />
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate">{w.name}</span>
                                  <span className="block text-xs text-gray-400 mt-0.5">{count} {count === 1 ? "site" : "sites"}</span>
                                </span>
                                <Icon name="arrow-right" size={13} className="text-gray-300 shrink-0" />
                              </button>

                              {/* Show on map pin button */}
                              <button
                                type="button"
                                title={isActive ? "Clear filter" : "Show on map"}
                                onClick={() => isActive ? (clearSidebarFilter(), onClose()) : (applyWishlistFilter(w.id, w.name), onClose())}
                                className={`shrink-0 mr-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                  isActive
                                    ? "bg-[var(--brand-orange)] text-white hover:bg-orange-600"
                                    : "bg-gray-50 text-gray-400 hover:bg-orange-50 hover:text-[var(--brand-orange)] border border-gray-100"
                                }`}
                              >
                                <Icon name={isActive ? "times" : "map-pin"} size={13} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }
      if (toolId === "trips") {
        if (isSignedIn === false) {
          return (
            <div className="p-4 flex flex-col items-center justify-center min-h-[200px] text-center bg-gray-50/80 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">Sign in to View Trips</p>
              <Link
                href={signInRedirectUrl}
                className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold hover:opacity-90"
              >
                Sign in
              </Link>
            </div>
          );
        }
        return (
          <div className="p-4 space-y-3 flex flex-col min-h-0">
            {typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && (
              <button
                type="button"
                onClick={() => { clearSidebarFilter(); onClose(); }}
                className="text-sm text-[var(--brand-orange)] font-medium"
              >
                Clear · Show all on map
              </button>
            )}
            {tripsLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : trips.length === 0 ? (
              <p className="text-sm text-gray-500">No trips yet.</p>
            ) : (
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {trips.map((t) => {
                  const isActive = typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && sidebarFilter.tripId === t.id;
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border bg-white p-3 shadow-sm ${
                        isActive ? "border-[var(--brand-orange)] ring-1 ring-[var(--brand-orange)]/20" : "border-gray-200 hover:border-[var(--brand-orange)]/40"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applyTripFilter(t.id, t.name)}
                        className="flex flex-1 min-w-0 text-left"
                      >
                        <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{t.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { applyTripFilter(t.id, t.name); onClose(); }}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand-orange)] py-1.5 px-2 text-white text-xs font-medium"
                      >
                        <Icon name="map-pin" size={12} />
                        Show on map
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      }
      return null;
    },
    [
      selectedMapSite,
      isSignedIn,
      signInRedirectUrl,
      allLocations,
      bookmarkedIds,
      bookmarksLoaded,
      sidebarFilter,
      clearSidebarFilter,
      wishlists,
      wishlistsLoading,
      trips,
      tripsLoading,
      expandedWishlistId,
      wishlistItems,
      wishlistItemsLoading,
      tripItems,
      tripItemsLoading,
      tripTimeline,
      tripTimelineLoading,
      applyWishlistFilter,
      applyTripFilter,
    ]
  );

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
            <p className="ml-4 text-lg text-gray-600">Loading map…</p>
          </div>
        ),
      }),
    []
  );

  const tools: Tool[] = mapTools; // always show Bookmarks, Wishlist, Trips (signed-out users see sign-in prompt)

  const mobilePanelContent = mobilePanelTab === "search" ? (
    <SearchFilters
      filters={filters}
      onFilterChange={handleFilterChange}
      onSearch={closeSearchPanel}
      onOpenNearbyModal={() => setShowNearbyModal(true)}
      onClearNearby={() => showMapToast("Proximity filter cleared")}
      onReset={() => showMapToast("Filters reset")}
    />
  ) : mobilePanelTab === "site" ? (
    renderToolPanel("site", () => { setSelectedMapSite(null); closeSearchPanel(); })
  ) : mobilePanelTab === "bookmarks" ? (
    renderToolPanel("bookmarks", closeSearchPanel)
  ) : mobilePanelTab === "wishlist" ? (
    renderToolPanel("wishlist", closeSearchPanel)
  ) : (
    renderToolPanel("trips", closeSearchPanel)
  );

  return (
    <>
    <div className="fixed inset-0 w-full z-0">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } } .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }`}</style>

      {/* Map: full size from top; header overlays transparently */}
      <div className="absolute inset-0">
        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-50 p-6">
            <p className="text-center text-gray-700">
              Map failed to load. The request may have timed out. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-white font-medium hover:opacity-90"
            >
              Refresh page
            </button>
          </div>
        ) : (
          <>
        {/* Pass enriched, memoized data with province_slug for province-aware links */}
        <ClientOnlyMap
          locations={filteredLocations as ClientMapSite[]}
          settings={mapSettings}
          icons={allIcons}
          highlightSiteId={highlightSiteId}
          onHighlightConsumed={() => setHighlightSiteId(null)}
          onSiteSelect={(site) => handleSiteSelect(site as MapSite)}
          mapType={mapType}
        />
        {sitesLoading && (
          <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12" aria-live="polite">
            <div
              className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
              role="status"
            >
              <span className="shrink-0 w-4 h-4 inline-block text-white" aria-hidden>
                <svg className="animate-spin w-full h-full" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="16 48" strokeLinecap="round" />
                </svg>
              </span>
              <span className="font-medium text-[15px] leading-tight truncate">
                Loading sites…
              </span>
            </div>
          </div>
        )}
        {/* Map type switcher: OSM, Google roadmap, Google satellite */}
        <div
          className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2"
          aria-label="Map type"
        >
          {(
            [
              {
                type: "osm" as const,
                iconKey: "climate-geography-environment",
                label: "Light",
              },
              {
                type: "google" as const,
                iconKey: "map",
                label: "Map",
              },
              {
                type: "google_satellite" as const,
                iconKey: "mountain",
                label: "Terrain",
              },
            ] as const
          ).map(({ type, iconKey, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => setMapType(type)}
              aria-label={label}
              aria-pressed={mapType === type}
              title={label}
              className={`flex-shrink-0 w-11 h-11 rounded-full border-2 overflow-hidden bg-white shadow-md transition-all flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand-orange)] hover:bg-gray-50 ${
                mapType === type
                  ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Icon
                name={iconKey}
                size={22}
                className={mapType === type ? "text-[var(--brand-orange)]" : "text-gray-600"}
              />
            </button>
          ))}
        </div>
          </>
        )}
        {/* Single pill on the right: trip details (when trip loaded) or map context (otherwise) */}
        {!loadError &&
          (() => {
            const isTripActive =
              typeof sidebarFilter === "object" &&
              sidebarFilter !== null &&
              "tripId" in sidebarFilter;

            if (isTripActive) {
              return (
                <div
                  className="absolute right-10 top-[62px] z-[1000] w-[280px] max-h-[calc(100vh-88px)] flex flex-col rounded-2xl bg-white/95 backdrop-blur-sm shadow-lg ring-1 ring-gray-200 overflow-hidden"
                  aria-label="Trip details"
                >
                  <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-800 truncate leading-snug">
                    Trip: {activeTripName ?? "—"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tripItemsLoading || tripTimelineLoading
                      ? "Loading…"
                      : `${tripItems.length} ${tripItems.length === 1 ? "site" : "sites"}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSidebarFilter}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors text-gray-500"
                  title="Close trip panel"
                  aria-label="Close trip panel"
                >
                  <Icon name="times" size={12} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
                {tripItemsLoading && !tripTimeline.length ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Icon name="spinner" size={16} className="animate-spin" />
                    <span className="text-sm">Loading sites…</span>
                  </div>
                ) : tripItems.length === 0 && tripTimeline.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No sites in this trip.</p>
                ) : tripTimeline.length > 0 ? (
                  <ul className="space-y-0 pb-2">
                    {(() => {
                      type DayEntry = TimelineItem & { kind: "day"; id: string; title?: string | null; the_date?: string | null; order_index?: number };
                      const formatSmallDate = (dateStr: string | null | undefined) =>
                        dateStr
                          ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : null;

                      const daysInOrder = (tripTimeline.filter((e) => e.kind === "day") as DayEntry[]).sort(
                        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
                      );
                      const itemsByDayId = new Map<string | null, TripItemMap[]>();
                      for (const item of tripItems) {
                        const key = item.day_id ?? null;
                        if (!itemsByDayId.has(key)) itemsByDayId.set(key, []);
                        itemsByDayId.get(key)!.push(item);
                      }
                      for (const arr of itemsByDayId.values()) {
                        arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                      }

                      const out: React.ReactNode[] = [];
                      daysInOrder.forEach((day, idx) => {
                        const dayNumber = idx + 1;
                        const title = day.title?.trim() || "Day";
                        out.push(
                          <li key={`day-${day.id}`} className="pt-3 pb-1.5 first:pt-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[var(--brand-blue)] text-white text-[11px] font-semibold">
                                Day {dayNumber}: {title}
                              </span>
                            </div>
                            <div className="border-b border-amber-200/60 mb-1.5" />
                          </li>
                        );
                        const itemsForDay = itemsByDayId.get(day.id) ?? [];
                        itemsForDay.forEach((item) => {
                          const siteTitle = item.site?.title ?? "Site";
                          const cover = item.site?.cover_photo_url ?? null;
                          const smallDate = formatSmallDate(item.date_in ?? day.the_date ?? null);
                          out.push(
                            <li key={`site-${item.id ?? item.site_id}`} className="mb-2">
                              <button
                                type="button"
                                onClick={() => setHighlightSiteId(item.site_id)}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow text-left transition-all"
                              >
                                <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                  {cover ? (
                                    <img src={cover} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                      <Icon name="map-pin" size={14} />
                                    </span>
                                  )}
                                </span>
                                <span className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate">{siteTitle}</span>
                                  {smallDate && (
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                      <Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />
                                      {smallDate}
                                    </span>
                                  )}
                                </span>
                                <Icon name="map-pin" size={12} className="text-gray-300 shrink-0" />
                              </button>
                            </li>
                          );
                        });
                      });
                      const ungroupedItems = itemsByDayId.get(null) ?? [];
                      if (ungroupedItems.length > 0) {
                        out.push(
                          <li key="day-ungrouped" className="pt-3 pb-1.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-semibold text-gray-500">Other sites</span>
                            </div>
                            <div className="border-b border-gray-100 mb-1.5" />
                          </li>
                        );
                        ungroupedItems.forEach((item) => {
                          const siteTitle = item.site?.title ?? "Site";
                          const cover = item.site?.cover_photo_url ?? null;
                          const smallDate = formatSmallDate(item.date_in ?? null);
                          out.push(
                            <li key={`site-${item.id ?? item.site_id}`} className="mb-2">
                              <button
                                type="button"
                                onClick={() => setHighlightSiteId(item.site_id)}
                                className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow text-left transition-all"
                              >
                                <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                  {cover ? (
                                    <img src={cover} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                      <Icon name="map-pin" size={14} />
                                    </span>
                                  )}
                                </span>
                                <span className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate">{siteTitle}</span>
                                  {smallDate && (
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                      <Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />
                                      {smallDate}
                                    </span>
                                  )}
                                </span>
                                <Icon name="map-pin" size={12} className="text-gray-300 shrink-0" />
                              </button>
                            </li>
                          );
                        });
                      }
                      return out;
                    })()}
                  </ul>
                ) : (
                  <ul className="space-y-1.5 pb-2">
                    {tripItems.map((item) => {
                      const site = item.site;
                      const title = site?.title ?? "Site";
                      const cover = site?.cover_photo_url ?? null;
                      return (
                        <li key={item.site_id}>
                          <button
                            type="button"
                            onClick={() => setHighlightSiteId(item.site_id)}
                            className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow text-left transition-all"
                          >
                            <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                              {cover ? (
                                <img src={cover} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                  <Icon name="map-pin" size={14} />
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-medium text-[var(--brand-blue)] truncate flex-1 min-w-0">{title}</span>
                            <Icon name="map-pin" size={12} className="text-gray-300 shrink-0" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
              );
            }

            const hasActiveFilter =
              sidebarFilter !== null ||
              filters.name.trim() !== "" ||
              filters.categoryIds.length > 0 ||
              filters.regionIds.length > 0 ||
              (filters.centerSiteId != null && filters.centerLat != null && filters.centerLng != null && filters.radiusKm != null);
            return (
              <div
                className="absolute right-10 top-[62px] z-[1000] rounded-2xl bg-white/95 backdrop-blur-sm shadow-lg ring-1 ring-gray-200 px-4 py-2.5 max-w-[220px] lg:max-w-[300px] flex items-center gap-2"
                aria-label="Map view context"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate leading-snug">
                    {mapHeadline}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {loading || sitesLoading
                      ? "Loading…"
                      : nearbyActive && typeof filters.radiusKm === "number"
                        ? `${filteredLocations.length} ${filteredLocations.length === 1 ? "site" : "sites"} within ${filters.radiusKm} km`
                        : filteredLocations.length === allLocations.length
                          ? `${allLocations.length} ${allLocations.length === 1 ? "site" : "sites"}`
                          : `${filteredLocations.length} of ${allLocations.length} sites`}
                  </div>
                </div>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      clearSidebarFilter();
                      setFilters((prev) => ({ ...prev, name: "", categoryIds: [], regionIds: [], ...clearPlacesNearby() }));
                      showMapToast("All filters cleared");
                    }}
                    className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors text-gray-500"
                    title="Clear all filters"
                    aria-label="Clear all filters"
                  >
                    <Icon name="times" size={9} />
                  </button>
                )}
              </div>
            );
          })()}
      </div>

      {mounted &&
        createPortal(
          <div className="lg:hidden fixed top-0 inset-x-0 z-[1200] bg-white border-b border-gray-200 shadow-sm h-14 flex items-center px-3 gap-2">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() =>
                document.dispatchEvent(new CustomEvent("open-mobile-menu"))
              }
              className="p-2 -ml-1 shrink-0 flex items-center justify-center text-[#004f32]"
            >
              <Icon name="navigator" size={20} />
            </button>
            <button
              type="button"
              aria-label="Search & Filters"
              onClick={() => setSearchPanelOpen(true)}
              className="flex-1 min-w-0 flex items-center gap-2 text-left"
            >
              <span className="text-sm font-bold text-gray-800 truncate">
                Map
              </span>
              <span className="text-[10px] text-gray-500">
                {filteredLocations.length} sites
              </span>
              <Icon
                name="search"
                size={20}
                className="text-[var(--brand-orange)] shrink-0"
              />
            </button>
          </div>,
          document.body
        )}

      {mounted &&
        searchPanelOpen &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[3200] touch-none">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
                searchPanelVisible ? "opacity-100" : "opacity-0"
              }`}
              onClick={closeSearchPanel}
            />
            <div
              className="absolute top-0 bottom-0 w-full bg-[var(--ivory-cream)] flex flex-col overflow-hidden transition-[right] duration-300 ease-out"
              style={{ right: searchPanelVisible ? 0 : "-100%" }}
            >
              <div className="shrink-0 bg-white border-b border-gray-100 shadow-sm">
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2.5" />
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (mobilePanelTab === "site") setSelectedMapSite(null);
                      closeSearchPanel();
                    }}
                    aria-label="Close"
                    className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 shrink-0"
                  >
                    <Icon name="times" size={18} className="text-gray-600" />
                  </button>
                  <span className="text-base font-bold text-gray-800 truncate">
                    {mobilePanelTab === "search"
                      ? "Search & Filters"
                      : mobilePanelTab === "bookmarks"
                        ? "Bookmarks"
                        : mobilePanelTab === "wishlist"
                          ? "Wishlist"
                          : mobilePanelTab === "trips"
                            ? "My Trips"
                            : selectedMapSite?.title ?? "Site Details"}
                  </span>
                </div>
                {/* Tab bar: hidden when showing a site preview */}
                {mobilePanelTab !== "site" && (
                  <div className="flex border-t border-gray-100">
                    {(["search", "bookmarks", "wishlist", "trips"] as const).map(
                      (tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setMobilePanelTab(tab)}
                          className={`flex-1 py-2.5 text-xs font-medium ${
                            mobilePanelTab === tab
                              ? "text-[var(--brand-orange)] border-b-2 border-[var(--brand-orange)]"
                              : "text-[var(--brand-grey)]"
                          }`}
                        >
                          {tab === "search"
                            ? "Search"
                            : tab === "bookmarks"
                              ? "Bookmarks"
                              : tab === "wishlist"
                                ? "Wishlist"
                                : "Trips"}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto touch-auto overscroll-contain p-4">
                <div className={`min-h-full rounded-xl bg-white shadow-md border border-gray-200 overflow-hidden ${mobilePanelTab === "site" ? "p-0" : ""}`}>
                  {mobilePanelContent}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>

      {/* Desktop: sidebar overlays the map and header (fixed, outside z-0 stacking context) */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 z-[1150]">
        <CollapsibleSidebar
          tools={tools}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={() => {}}
          onOpenNearbyModal={() => setShowNearbyModal(true)}
          onClearNearby={() => showMapToast("Proximity filter cleared")}
          onReset={() => showMapToast("Filters reset")}
          renderToolPanel={renderToolPanel}
          controlledOpenTool={selectedMapSite ? "site" : null}
          onControlledToolClose={() => setSelectedMapSite(null)}
        />
      </aside>

      {/* Nearby search modal (Search Around a Site) */}
      <NearbySearchModal
        isOpen={showNearbyModal}
        onClose={() => setShowNearbyModal(false)}
        value={{
          centerSiteId: filters.centerSiteId,
          centerLat: filters.centerLat,
          centerLng: filters.centerLng,
          radiusKm: filters.radiusKm,
        }}
        onApply={(v) => {
          /* Search Around a Site is exclusive: clear text, category, and region filters */
          handleFilterChange({
            ...v,
            name: "",
            categoryIds: [],
            regionIds: [],
          });
          setShowNearbyModal(false);
          const clat = v.centerLat;
          const clng = v.centerLng;
          const rkm = v.radiusKm ?? 25;
          if (typeof clat === "number" && typeof clng === "number" && rkm > 0) {
            const count = allLocations.filter((site) => {
              const lat = Number(site.latitude);
              const lng = Number(site.longitude);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
              return haversineKm(clat, clng, lat, lng) <= rkm;
            }).length;
            showMapToast(`${count} ${count === 1 ? "site" : "sites"} within ${rkm} km`);
          }
        }}
      />

      {/* Map action toast */}
      {toastVisible && (
        <div className="fixed inset-0 z-[2147483647] pointer-events-none flex items-end justify-center pb-14 sm:pb-12">
          <div
            className="px-6 py-3.5 rounded-2xl bg-gray-900 text-white shadow-2xl flex items-center gap-3 max-w-[90vw] sm:max-w-lg w-max"
            style={{
              transform: toastOpen ? "translateY(0)" : "translateY(16px)",
              opacity: toastOpen ? 1 : 0,
              transition: "transform 220ms ease, opacity 220ms ease",
            }}
            role="status"
            aria-live="polite"
          >
            {toastLoading ? (
              <>
                <span className="shrink-0 w-4 h-4 inline-block text-white" aria-hidden>
                  <svg className="animate-spin w-full h-full" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="16 48" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="font-medium text-[15px] leading-tight truncate">
                  Loading Trip
                </span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7.5" stroke="rgba(255,255,255,0.45)" />
                  <path d="M4.5 8.5L7 11L11.5 5.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-medium text-[15px] leading-tight truncate">
                  {toastMessage}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
