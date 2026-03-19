// src/app/map/page.tsx
"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import CollapsibleSidebar, { Tool } from "@/components/CollapsibleSidebar";
import SearchFilters, { Filters } from "@/components/SearchFilters";
import NearbySearchModal from "@/components/NearbySearchModal";
import AddToWishlistModal from "@/components/AddToWishlistModal";
import AddToTripModal from "@/components/AddToTripModal";
import { clearPlacesNearby } from "@/lib/placesNearby";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { getPublicClient } from "@/lib/supabase/browser";
import type { Site as ClientMapSite, MapType } from "@/components/ClientOnlyMap";
import { getWishlistItems } from "@/lib/wishlists";
import { useWishlists } from "@/components/WishlistProvider";
import { listTripsByUsername, getTripWithItems, getTripTimeline, type TimelineItem } from "@/lib/trips";
import Link from "next/link";
import { useMapBootstrap } from "@/components/MapBootstrapProvider";
import { useNativeLocation } from "@/hooks/useNativeLocation";
import NearbyMeSheet from "@/components/NearbyMeSheet";
import { getCachedBootstrap, setCachedBootstrap, getCachedSites, setCachedSites } from "@/lib/mapCache";
import { getThumbOrVariantUrlNoTransform, getVariantPublicUrl } from "@/lib/imagevariants";
import SiteCarousel from "@/components/SiteCarousel";
import SiteBottomSheet from "@/components/SiteBottomSheet";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useQuery } from "@tanstack/react-query";

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

/* ────────────────── Phase-1 retry policy ──────────────────────────────── */
const PHASE1_MAX_ATTEMPTS = 4; // initial + 3 auto-retries
const PHASE1_BACKOFF_MS = [1000, 2000, 4000]; // delay before retry 1, 2, 3

/* ───────────────────────────── Sidebar tools ───────────────────────────── */
const mapTools: Tool[] = [
  { id: "search", name: "Search", icon: "search" },
  { id: "wishlist", name: "My Saved Lists", icon: "list-ul" },
  { id: "trips", name: "My Trips", icon: "route" },
];

type SidebarFilter =
  | null
  | { wishlistId: string }
  | { tripId: string };

/* ───────── Province helpers (sites.province_id → provinces.slug) ───────── */
async function buildProvinceSlugMapForSites(siteIds: string[], signal?: AbortSignal) {
  const out = new Map<string, string | null>();
  if (!siteIds.length) return out;

  let sitesQ = getPublicClient()
    .from("sites")
    .select("id, province_id")
    .in("id", siteIds);
  if (signal) sitesQ = (sitesQ as any).abortSignal(signal);
  const { data: siteRows, error: siteErr } = await sitesQ;

  if (siteErr || !siteRows?.length) return out;

  const bySiteId = new Map<string, number | null>();
  const provinceIds = new Set<number>();
  for (const r of siteRows as { id: string; province_id: number | null }[]) {
    bySiteId.set(r.id, r.province_id ?? null);
    if (r.province_id != null) provinceIds.add(r.province_id);
  }

  let slugByProvinceId = new Map<number, string>();
  if (provinceIds.size > 0) {
    let provsQ = getPublicClient()
      .from("provinces")
      .select("id, slug")
      .in("id", Array.from(provinceIds));
    if (signal) provsQ = (provsQ as any).abortSignal(signal);
    const { data: provs } = await provsQ;
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

const SITES_LOAD_TIMEOUT_MS = 8000;

/** Fetches all map sites (for React Query). Returns MapSite[] or throws. */
async function fetchMapSites(signal?: AbortSignal): Promise<MapSite[]> {
  let query = getPublicClient()
    .from("sites")
    .select(
      `id, slug, title, cover_photo_url, cover_photo_thumb_url, cover_slideshow_image_ids, location_free, heritage_type, avg_rating, review_count, tagline, latitude, longitude, province_id,
       site_categories!inner(category_id, categories(icon_key)),
       site_regions!inner(region_id)`
    )
    .eq("is_published", true)
    .is("deleted_at", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (signal) query = (query as any).abortSignal(signal);
  const locationsRes = await query as { data?: any[]; error?: unknown };

  if (locationsRes?.error || !locationsRes?.data?.length) return [];

  let valid: MapSite[] = (locationsRes.data as any[])
    .map((site: any) => ({
      ...site,
      latitude: parseFloat(site.latitude),
      longitude: parseFloat(site.longitude),
    }))
    .filter((s: MapSite) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));

  const ids = valid.map((s) => s.id as string);
  const provMap = await buildProvinceSlugMapForSites(ids, signal);
  valid = valid.map((s) => ({
    ...s,
    province_slug: provMap.get(s.id) ?? null,
  }));
  return valid;
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
  if (typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter) {
    return wishlistName ?? "My Saved Lists";
  }
  if (typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter) {
    return tripName ?? "Trip";
  }

  /* "Search Around a Site" (nearby) takes precedence over text/category/region */
  if (nearbyActive && (typeof radiusKm === "number" || centerSiteTitle)) {
    const siteLabel = centerSiteTitle || "Selected site";
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

function applyBootstrapToState(
  b: { mapSettings: Record<string, unknown> | null; icons: Array<{ name: string; svg_content: string }>; categories: Array<{ id: string; name: string }>; regions: Array<{ id: string; name: string }> },
  setters: { setMapSettings: (v: any) => void; setAllIcons: (v: Map<string, string>) => void; setCategoryMap: (v: Record<string, string>) => void; setRegionMap: (v: Record<string, string>) => void; setLoading: (v: boolean) => void }
) {
  if (b.mapSettings != null) setters.setMapSettings(b.mapSettings);
  if (b.icons?.length) {
    const iconMap = new Map<string, string>();
    b.icons.forEach((icon) => iconMap.set(icon.name, icon.svg_content));
    setters.setAllIcons(iconMap);
  }
  if (b.categories?.length) {
    const m: Record<string, string> = {};
    b.categories.forEach((r) => { m[r.id] = r.name; });
    setters.setCategoryMap(m);
  }
  if (b.regions?.length) {
    const m: Record<string, string> = {};
    b.regions.forEach((r) => { m[r.id] = r.name; });
    setters.setRegionMap(m);
  }
  setters.setLoading(false);
}

export default function MapClient() {
  const initialBootstrapFromServer = useMapBootstrap();
  const { userId: authUserId, authLoading: authStateLoading } = useAuthUserId();
  // null = still loading (don't flash "sign in" prompts); true/false = resolved
  const isSignedIn: boolean | null = authStateLoading ? null : authUserId !== null;
  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
  });

  const [allLocations, setAllLocations] = useState<MapSite[]>(() => {
    const cached = getCachedSites();
    return cached?.sites?.length ? (cached.sites as MapSite[]) : [];
  });
  /** O(1) lookup by site id — rebuilt only when allLocations changes. */
  const allLocationsById = useMemo(
    () => new Map(allLocations.map((loc) => [loc.id, loc])),
    [allLocations]
  );
  const [mapSettings, setMapSettings] = useState<any>(() => {
    const cached = getCachedBootstrap();
    return cached?.mapSettings ?? null;
  });
  const [allIcons, setAllIcons] = useState<Map<string, string>>(() => {
    const cached = getCachedBootstrap();
    if (!cached?.icons?.length) return new Map();
    const m = new Map<string, string>();
    cached.icons.forEach((ic) => m.set(ic.name, ic.svg_content));
    return m;
  });
  const [loading, setLoading] = useState(true);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [regionMap, setRegionMap] = useState<Record<string, string>>({});

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>(null);
  const [wishlistSiteIds, setWishlistSiteIds] = useState<string[]>([]);
  const [tripSiteIds, setTripSiteIds] = useState<string[]>([]);

  // Use shared WishlistProvider context — avoids a duplicate DB fetch on sign-in.
  const { wishlists: rawWishlists, loading: wishlistsLoading } = useWishlists();
  const wishlists = rawWishlists as { id: string; name: string; wishlist_items: { count: number }[] }[];
  const [trips, setTrips] = useState<{ id: string; name: string; slug?: string | null }[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [showNearbyModal, setShowNearbyModal] = useState(false);
  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  /** What the mobile panel shows: "search" = filters only, "lists" = Saved Lists/Trips, "site" = site detail */
  const [mobilePanelMode, setMobilePanelMode] = useState<"search" | "lists" | "site">("search");
  const [mobilePanelTab, setMobilePanelTab] = useState<"search" | "wishlist" | "trips" | "site">("search");
  const [mobileEllipsisSheetOpen, setMobileEllipsisSheetOpen] = useState(false);
  const [mobileEllipsisSheetVisible, setMobileEllipsisSheetVisible] = useState(false);
  const [mobileTripSheetOpen, setMobileTripSheetOpen] = useState(false);
  const [mobileTripSheetVisible, setMobileTripSheetVisible] = useState(false);
  const [mobileTripSheetClosing, setMobileTripSheetClosing] = useState(false);
  const mobileTripSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobileListSheetOpen, setMobileListSheetOpen] = useState(false);
  const [mobileListSheetVisible, setMobileListSheetVisible] = useState(false);
  const [mobileListSheetClosing, setMobileListSheetClosing] = useState(false);
  const mobileListSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobileMapTypeSheetOpen, setMobileMapTypeSheetOpen] = useState(false);
  const [mobileMapTypeSheetVisible, setMobileMapTypeSheetVisible] = useState(false);
  const [highlightSiteId, setHighlightSiteId] = useState<string | null>(null);
  /** When true, map will open preview without zooming (e.g. click from saved list panel). */
  const [highlightFromSavedList, setHighlightFromSavedList] = useState(false);
  const [expandedWishlistId, setExpandedWishlistId] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<{ site_id: string; sites: { title: string; slug: string; cover_photo_url: string | null; cover_photo_thumb_url?: string | null } | null }[]>([]);
  const [wishlistItemsLoading, setWishlistItemsLoading] = useState(false);
  type TripItemMap = { id?: string; site_id: string; day_id?: string | null; order_index?: number; date_in?: string | null; site?: { id: string; title: string; slug: string; cover_photo_url: string | null; cover_photo_thumb_url?: string | null } | null };
  const [tripItems, setTripItems] = useState<TripItemMap[]>([]);
  const [tripItemsLoading, setTripItemsLoading] = useState(false);
  const [tripTimeline, setTripTimeline] = useState<TimelineItem[]>([]);
  const [tripTimelineLoading, setTripTimelineLoading] = useState(false);
  const [mapType, setMapType] = useState<MapType>("osm");
  const mapTypeInitializedRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [sitesLoadError, setSitesLoadError] = useState(false);
  /** Phase 1 (settings/icons/cats/regions) retry: effect depends on this; increment to retry (auto or manual). */
  const [phase1RetryCount, setPhase1RetryCount] = useState(0);
  /** When hovering a site in the trip panel, highlight the matching map tooltip. */
  const [tripPanelHoveredSiteId, setTripPanelHoveredSiteId] = useState<string | null>(null);
  /** Increment when trip is closed so the map resets to default zoom/position. */
  const [resetMapViewTrigger, setResetMapViewTrigger] = useState(0);
  /** Increment when user applies search filters so the map fits to the filtered pins. */
  const [fitFilteredTrigger, setFitFilteredTrigger] = useState(0);
  const triggerFitFiltered = useCallback(() => setFitFilteredTrigger((n) => n + 1), []);
  const stableLocationsRef = useRef<{ key: string; value: MapSite[] }>({ key: "", value: [] });

  // ── Map action toast ──
  const [toastVisible, setToastVisible] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastLoading, setToastLoading] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const toastRaf1Ref = useRef<number | null>(null);
  const toastRaf2Ref = useRef<number | null>(null);
  const searchPanelRaf2Ref = useRef<number | null>(null);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragStartRef = useRef<number | null>(null);
  const sheetIsDraggingRef = useRef(false);
  const ellipsisSheetRaf2Ref = useRef<number | null>(null);
  const mapTypeSheetRaf2Ref = useRef<number | null>(null);
  const tripSheetRaf2Ref = useRef<number | null>(null);
  const listSheetRaf2Ref = useRef<number | null>(null);
  const filteredLocationsRef = useRef<MapSite[]>([]);
  const filterToastInitRef = useRef(false);

  // Selected site (from clicking a map pin) — shown in the left panel on desktop
  // and in the mobile search panel on mobile.
  const [selectedMapSite, setSelectedMapSite] = useState<MapSite | null>(null);
  const [showSitePanelActionsMenu, setShowSitePanelActionsMenu] = useState(false);
  const [sitePanelMenuPosition, setSitePanelMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const sitePanelActionsMenuRef = useRef<HTMLDivElement>(null);
  const sitePanelActionsMenuPortalRef = useRef<HTMLDivElement>(null);
  const sitePanelCategoriesScrollRef = useRef<HTMLDivElement>(null);
  const sitePanelRegionsScrollRef = useRef<HTMLDivElement>(null);
  const [showSitePanelWishlistModal, setShowSitePanelWishlistModal] = useState(false);
  const [showSitePanelTripModal, setShowSitePanelTripModal] = useState(false);

  // Slideshow: resolved image URLs for the selected site
  // null = still loading (has IDs but fetch pending); [] = no slideshow (use cover fallback)
  const [slideshowUrls, setSlideshowUrls] = useState<string[] | null>(null);

  // Fetch slideshow image URLs when selected site changes
  useEffect(() => {
    const ids = selectedMapSite?.cover_slideshow_image_ids;
    if (!ids?.length) {
      // No slideshow IDs — immediately use cover fallback, no flash
      setSlideshowUrls([]);
      return;
    }
    // Has IDs: set null (loading) so the cover fallback is suppressed until fetch resolves
    setSlideshowUrls(null);
    let cancelled = false;
    getPublicClient()
      .from("site_images")
      .select("id, storage_path")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        if (!data?.length) { setSlideshowUrls([]); return; }
        // Preserve admin order
        const byId = new Map<string, string>(data.map((r: { id: string; storage_path: string }) => [r.id, r.storage_path]));
        const urls = ids
          .map((id) => {
            const path = byId.get(id);
            if (!path) return null;
            try { return getVariantPublicUrl(path, "md"); } catch { return null; }
          })
          .filter((u): u is string => !!u);
        setSlideshowUrls(urls);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMapSite?.id]);

  const handleFilterChange = useCallback((newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  useEffect(() => {
    setShowSitePanelActionsMenu(false);
    setSitePanelMenuPosition(null);
  }, [selectedMapSite?.id]);

  // Position site panel actions menu in portal (open downwards below trigger)
  useEffect(() => {
    if (!showSitePanelActionsMenu) {
      setSitePanelMenuPosition(null);
      return;
    }
    const el = sitePanelActionsMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    setSitePanelMenuPosition({
      top: rect.bottom + gap,
      left: rect.left,
    });
  }, [showSitePanelActionsMenu]);

  useEffect(() => {
    if (!selectedMapSite) {
      setShowSitePanelWishlistModal(false);
      setShowSitePanelTripModal(false);
    }
  }, [selectedMapSite]);

  /* Resolve localStorage-dependent initial states after mount to avoid SSR/client hydration mismatch. */
  useEffect(() => {
    if (getCachedSites()?.sites?.length) setSitesLoading(false);
  }, []);

  /* Apply server or localStorage bootstrap immediately so map can render without waiting (cache/pre-built). */
  useEffect(() => {
    const fromServer = initialBootstrapFromServer;
    const fromCache = getCachedBootstrap();
    const bootstrap = fromServer ?? fromCache;
    if (!bootstrap) return;
    const hasEnough = bootstrap.mapSettings != null && (bootstrap.icons?.length ?? 0) > 0;
    if (!hasEnough) return;
    applyBootstrapToState(bootstrap, {
      setMapSettings,
      setAllIcons,
      setCategoryMap,
      setRegionMap,
      setLoading,
    });
  }, [initialBootstrapFromServer]);

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

  /** Map of site_id → formatted date for trip pin tooltips (only when trip is loaded). */
  const tripSiteDates = useMemo(() => {
    if (typeof sidebarFilter !== "object" || sidebarFilter === null || !("tripId" in sidebarFilter)) return null;
    if (!tripItems.length && !tripTimeline.length) return null;
    const formatDate = (dateStr: string | null | undefined) =>
      dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
    const daysById = new Map<string | null, string | null>();
    tripTimeline.filter((e) => e.kind === "day").forEach((d) => daysById.set(d.id, (d as { the_date?: string | null }).the_date ?? null));
    const out = new Map<string, string>();
    tripItems.forEach((item) => {
      const dateStr = item.date_in ?? (item.day_id ? daysById.get(item.day_id) ?? null : null);
      const formatted = formatDate(dateStr);
      if (formatted) out.set(item.site_id, formatted);
    });
    return out;
  }, [sidebarFilter, tripItems, tripTimeline]);

  const nearbyActive =
    filters.centerSiteId != null &&
    filters.centerLat != null &&
    filters.centerLng != null &&
    filters.radiusKm != null;

  /* When proximity filter is cleared, return map to default zoom/center */
  const prevNearbyActiveRef = useRef(nearbyActive);
  useEffect(() => {
    if (prevNearbyActiveRef.current && !nearbyActive) {
      setResetMapViewTrigger((t) => t + 1);
    }
    prevNearbyActiveRef.current = nearbyActive;
  }, [nearbyActive]);

  const mapHeadline = useMemo(
    () => buildMapHeadline({
      query: debouncedName,
      categoryNames: selectedCategoryNames,
      regionNames: selectedRegionNames,
      sidebarFilter,
      wishlistName: activeWishlistName,
      tripName: activeTripName,
      centerSiteTitle: filters.centerSiteTitle ?? centerSiteTitle,
      radiusKm: filters.radiusKm,
      nearbyActive,
    }),
    [debouncedName, selectedCategoryNames, selectedRegionNames, sidebarFilter, activeWishlistName, activeTripName, filters.centerSiteTitle, centerSiteTitle, filters.radiusKm, nearbyActive]
  );

  /* Keep centerSiteTitle in sync when "Search Around a Site" center changes */
  useEffect(() => {
    let active = true;
    if (!filters.centerSiteId) {
      setCenterSiteTitle(null);
      return;
    }
    (async () => {
      const { data } = await getPublicClient()
        .from("sites")
        .select("id,title")
        .eq("id", filters.centerSiteId)
        .maybeSingle();
      if (active && data) setCenterSiteTitle((data as { title: string }).title);
    })();
    return () => { active = false; };
  }, [filters.centerSiteId]);

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
          const raw = (data ?? []) as unknown as { site_id: string; sites?: { title: string; slug: string; cover_photo_url: string | null; cover_photo_thumb_url?: string | null } | { title: string; slug: string; cover_photo_url: string | null; cover_photo_thumb_url?: string | null }[] }[];
          const normalized: { site_id: string; sites: { title: string; slug: string; cover_photo_url: string | null; cover_photo_thumb_url?: string | null } | null }[] = raw.map((item) => ({
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

  /* ───────── Phase 1: Load settings, icons, categories, regions (or revalidate if we have cache) ─────────
   * - If we have bootstrap (server or localStorage), only revalidate in background (no timeout).
   * - Otherwise fetch with no timeout so slow/cold Supabase can finish; retry on real failures. */
  useEffect(() => {
    let cancelled = false;
    const hasInitialData = !!(initialBootstrapFromServer || getCachedBootstrap());

    if (!hasInitialData) {
      setLoading(true);
    }
    setLoadError(false);
    setSitesLoadError(false);

    (async () => {
      let settingsRes: any;
      let iconsRes: any;
      let catsRes: any;
      let regsRes: any;

      const pub = getPublicClient();
      if (hasInitialData) {
        const [s, i, c, r] = await Promise.all([
          pub.from("global_settings").select("value").eq("key", "map_settings").maybeSingle(),
          pub.from("icons").select("name, svg_content"),
          pub.from("categories").select("id,name").order("name"),
          pub.from("regions").select("id,name").order("name"),
        ]);
        settingsRes = s;
        iconsRes = i;
        catsRes = c;
        regsRes = r;
      } else {
        try {
          [settingsRes, iconsRes, catsRes, regsRes] = await Promise.all([
            pub.from("global_settings").select("value").eq("key", "map_settings").maybeSingle(),
            pub.from("icons").select("name, svg_content"),
            pub.from("categories").select("id,name").order("name"),
            pub.from("regions").select("id,name").order("name"),
          ]);
        } catch (err) {
          if (cancelled) return;
          const shouldRetry = phase1RetryCount < PHASE1_MAX_ATTEMPTS - 1;
          if (shouldRetry) {
            setLoading(false);
            const delay = PHASE1_BACKOFF_MS[phase1RetryCount] ?? 4000;
            await new Promise<void>((res) => setTimeout(res, delay));
            if (cancelled) return;
            setPhase1RetryCount((c) => c + 1);
            return;
          }
          setLoadError(true);
          setLoading(false);
          return;
        }
      }

      if (cancelled) return;
      if (settingsRes?.data) {
        const newSettings = settingsRes.data.value as any;
        setMapSettings((prev: any) => {
          if (JSON.stringify(prev) === JSON.stringify(newSettings)) return prev;
          return newSettings;
        });
      }
      if (iconsRes?.data) {
        const newIconData = iconsRes.data as Array<{ name: string; svg_content: string }>;
        setAllIcons((prev) => {
          // Only replace the Map if content actually changed
          if (prev.size === newIconData.length &&
              newIconData.every((ic) => prev.get(ic.name) === ic.svg_content)) {
            return prev;
          }
          const iconMap = new Map<string, string>();
          newIconData.forEach((icon) => iconMap.set(icon.name, icon.svg_content));
          return iconMap;
        });
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
      if (!cancelled) {
        setLoading(false);
        setCachedBootstrap({
          mapSettings: settingsRes?.data?.value ?? null,
          icons: (iconsRes?.data as Array<{ name: string; svg_content: string }>) ?? [],
          categories: (catsRes?.data as Array<{ id: string; name: string }>) ?? [],
          regions: (regsRes?.data as Array<{ id: string; name: string }>) ?? [],
        });
      }
    })();
    return () => { cancelled = true; };
  }, [phase1RetryCount, initialBootstrapFromServer]);

  const bootstrapReady = !loading && !loadError;
  const cachedSites = getCachedSites();
  const sitesQuery = useQuery({
    queryKey: ["map-sites"],
    queryFn: async ({ signal: rqSignal }) => {
      const controller = new AbortController();
      const abortTimer = setTimeout(
        () => controller.abort(new Error(`map-sites staleConn abort after ${SITES_LOAD_TIMEOUT_MS}ms`)),
        SITES_LOAD_TIMEOUT_MS
      );
      rqSignal?.addEventListener("abort", () => controller.abort());
      try {
        return await fetchMapSites(controller.signal);
      } finally {
        clearTimeout(abortTimer);
      }
    },
    enabled: bootstrapReady,
    initialData: (cachedSites?.sites?.length ? (cachedSites.sites as MapSite[]) : undefined) as MapSite[] | undefined,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });

  useEffect(() => {
    if (!bootstrapReady) return;
    setSitesLoading(sitesQuery.isLoading);
    setSitesLoadError(sitesQuery.isError);
    if (sitesQuery.data?.length) {
      setAllLocations((prev) => {
        // Avoid re-render if site IDs and data are identical (e.g. revalidation returned same data)
        if (prev.length === sitesQuery.data!.length &&
            prev.every((s, i) => s.id === sitesQuery.data![i].id)) {
          return prev;
        }
        return sitesQuery.data!;
      });
      setCachedSites(sitesQuery.data);
    }
  }, [bootstrapReady, sitesQuery.isLoading, sitesQuery.isError, sitesQuery.data]);

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

    if (
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
    const key = res.length + "|" + res.map((s) => s.id).join(",");
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
    wishlistSiteIds,
    tripSiteIds,
  ]);

  const retrySitesLoad = useCallback(() => {
    setSitesLoadError(false);
    void sitesQuery.refetch();
  }, [sitesQuery]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!searchPanelOpen) {
      setSearchPanelVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      searchPanelRaf2Ref.current = requestAnimationFrame(() => {
        searchPanelRaf2Ref.current = null;
        setSearchPanelVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(id);
      if (searchPanelRaf2Ref.current != null) {
        cancelAnimationFrame(searchPanelRaf2Ref.current);
        searchPanelRaf2Ref.current = null;
      }
    };
  }, [searchPanelOpen]);
  const closeSearchPanel = useCallback(() => {
    setSearchPanelVisible(false);
    setTimeout(() => setSearchPanelOpen(false), 320);
  }, []);

  /* Ellipsis bottom sheet visibility animation */
  useEffect(() => {
    if (!mobileEllipsisSheetOpen) {
      setMobileEllipsisSheetVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      ellipsisSheetRaf2Ref.current = requestAnimationFrame(() => {
        ellipsisSheetRaf2Ref.current = null;
        setMobileEllipsisSheetVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(id);
      if (ellipsisSheetRaf2Ref.current != null) {
        cancelAnimationFrame(ellipsisSheetRaf2Ref.current);
        ellipsisSheetRaf2Ref.current = null;
      }
    };
  }, [mobileEllipsisSheetOpen]);

  /* Map type bottom sheet visibility animation */
  useEffect(() => {
    if (!mobileMapTypeSheetOpen) {
      setMobileMapTypeSheetVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      mapTypeSheetRaf2Ref.current = requestAnimationFrame(() => {
        mapTypeSheetRaf2Ref.current = null;
        setMobileMapTypeSheetVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(id);
      if (mapTypeSheetRaf2Ref.current != null) {
        cancelAnimationFrame(mapTypeSheetRaf2Ref.current);
        mapTypeSheetRaf2Ref.current = null;
      }
    };
  }, [mobileMapTypeSheetOpen]);


  /* Trip details bottom sheet visibility and close animation */
  useEffect(() => {
    if (!mobileTripSheetOpen) {
      setMobileTripSheetVisible(false);
      setMobileTripSheetClosing(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      tripSheetRaf2Ref.current = requestAnimationFrame(() => {
        tripSheetRaf2Ref.current = null;
        setMobileTripSheetVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(id);
      if (tripSheetRaf2Ref.current != null) {
        cancelAnimationFrame(tripSheetRaf2Ref.current);
        tripSheetRaf2Ref.current = null;
      }
    };
  }, [mobileTripSheetOpen]);

  const closeTripSheetWithAnimation = useCallback(() => {
    if (mobileTripSheetCloseTimerRef.current) return;
    setMobileTripSheetClosing(true);
    mobileTripSheetCloseTimerRef.current = setTimeout(() => {
      mobileTripSheetCloseTimerRef.current = null;
      setMobileTripSheetOpen(false);
      setMobileTripSheetClosing(false);
    }, 300);
  }, []);

  useEffect(() => () => {
    if (mobileTripSheetCloseTimerRef.current) clearTimeout(mobileTripSheetCloseTimerRef.current);
  }, []);

  /* List (saved list) bottom sheet visibility and close animation */
  useEffect(() => {
    if (!mobileListSheetOpen) {
      setMobileListSheetVisible(false);
      setMobileListSheetClosing(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      listSheetRaf2Ref.current = requestAnimationFrame(() => {
        listSheetRaf2Ref.current = null;
        setMobileListSheetVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(id);
      if (listSheetRaf2Ref.current != null) {
        cancelAnimationFrame(listSheetRaf2Ref.current);
        listSheetRaf2Ref.current = null;
      }
    };
  }, [mobileListSheetOpen]);

  const closeListSheetWithAnimation = useCallback(() => {
    if (mobileListSheetCloseTimerRef.current) return;
    setMobileListSheetClosing(true);
    mobileListSheetCloseTimerRef.current = setTimeout(() => {
      mobileListSheetCloseTimerRef.current = null;
      setMobileListSheetOpen(false);
      setMobileListSheetClosing(false);
    }, 300);
  }, []);

  useEffect(() => () => {
    if (mobileListSheetCloseTimerRef.current) clearTimeout(mobileListSheetCloseTimerRef.current);
  }, []);

  /* When a trip is applied on mobile, open the trip details bottom sheet automatically */
  useEffect(() => {
    if (!mounted) return;
    if (typeof sidebarFilter !== "object" || sidebarFilter === null || !("tripId" in sidebarFilter)) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileTripSheetOpen(true);
    }
  }, [mounted, sidebarFilter]);

  /* When a saved list is applied on mobile, open the list bottom sheet automatically */
  useEffect(() => {
    if (!mounted) return;
    if (typeof sidebarFilter !== "object" || sidebarFilter === null || !("wishlistId" in sidebarFilter)) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setExpandedWishlistId(sidebarFilter.wishlistId);
      setMobileListSheetOpen(true);
    }
  }, [mounted, sidebarFilter]);

  useEffect(() => {
    if (searchPanelOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [searchPanelOpen]);

  const showMapToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    if (toastRaf1Ref.current != null) {
      cancelAnimationFrame(toastRaf1Ref.current);
      toastRaf1Ref.current = null;
    }
    if (toastRaf2Ref.current != null) {
      cancelAnimationFrame(toastRaf2Ref.current);
      toastRaf2Ref.current = null;
    }
    setToastLoading(false);
    setToastMessage(message);
    setToastVisible(true);
    setToastOpen(false);
    toastRaf1Ref.current = requestAnimationFrame(() => {
      toastRaf1Ref.current = null;
      toastRaf2Ref.current = requestAnimationFrame(() => {
        toastRaf2Ref.current = null;
        setToastOpen(true);
      });
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

  const showLoadingSavedListToast = useCallback((listName: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastLoading(true);
    setToastMessage(`Loading ${listName}…`);
    setToastVisible(true);
    setToastOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (toastRaf1Ref.current != null) {
        cancelAnimationFrame(toastRaf1Ref.current);
        toastRaf1Ref.current = null;
      }
      if (toastRaf2Ref.current != null) {
        cancelAnimationFrame(toastRaf2Ref.current);
        toastRaf2Ref.current = null;
      }
    };
  }, []);

  const savedListLoadingDoneRef = useRef(false);
  useEffect(() => {
    if (!expandedWishlistId) {
      savedListLoadingDoneRef.current = false;
      return;
    }
    if (wishlistItemsLoading) {
      savedListLoadingDoneRef.current = true;
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      const name = wishlists.find((w) => w.id === expandedWishlistId)?.name ?? "list";
      setToastLoading(true);
      setToastMessage(`Loading ${name}…`);
      setToastVisible(true);
      setToastOpen(true);
    } else if (savedListLoadingDoneRef.current) {
      savedListLoadingDoneRef.current = false;
      const name = wishlists.find((w) => w.id === expandedWishlistId)?.name ?? "List";
      showMapToast(`Loaded ${name}`);
    }
  }, [expandedWishlistId, wishlistItemsLoading, wishlists, showMapToast]);

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
    const rows = (await getWishlistItems(wishlistId)) as { site_id: string }[];
    const ids = (rows ?? []).map((r) => r.site_id);
    setWishlistSiteIds(ids);
    setSidebarFilter({ wishlistId });
    const count = ids.length;
    const label = wishlistName ? `"${wishlistName}"` : "Saved list";
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
    const wasTrip = typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter;
    const wasWishlist = typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter;
    setSidebarFilter(null);
    setWishlistSiteIds([]);
    setTripSiteIds([]);
    if (wasTrip || wasWishlist) setResetMapViewTrigger((t) => t + 1);
  }, [sidebarFilter]);

  const hasActiveFilter =
    sidebarFilter !== null ||
    filters.name.trim() !== "" ||
    filters.categoryIds.length > 0 ||
    filters.regionIds.length > 0 ||
    (filters.centerSiteId != null && filters.centerLat != null && filters.centerLng != null && filters.radiusKm != null);

  const handleClearAllFilters = useCallback(() => {
    clearSidebarFilter();
    setFilters((prev) => ({ ...prev, name: "", categoryIds: [], regionIds: [], ...clearPlacesNearby(), centerSiteTitle: null }));
    showMapToast("All filters cleared");
  }, [clearSidebarFilter, showMapToast]);

  // ── Near Me (user location) ──
  const { status: gpsStatus, coords: gpsCoords, requestLocation } = useNativeLocation();
  const [nearbyMeSheetOpen, setNearbyMeSheetOpen] = useState(false);
  const [mapFlyToTrigger, setMapFlyToTrigger] = useState<{ lat: number; lng: number } | null>(null);

  async function handleNearMe() {
    void hapticMedium();
    if (gpsStatus === "granted" && gpsCoords) {
      setNearbyMeSheetOpen(true);
      setMapFlyToTrigger({ lat: gpsCoords.lat, lng: gpsCoords.lng });
    } else {
      const coords = await requestLocation();
      if (coords) {
        setNearbyMeSheetOpen(true);
        setMapFlyToTrigger({ lat: coords.lat, lng: coords.lng });
      }
    }
  }

  // Register mobile header slot — always visible, updates when state changes
  const mapDisplayText = loading || sitesLoading
    ? "Loading…"
    : nearbyActive && typeof filters.radiusKm === "number"
      ? `${filteredLocations.length} ${filteredLocations.length === 1 ? "site" : "sites"} within ${filters.radiusKm} km`
      : filteredLocations.length === allLocations.length
        ? `${allLocations.length} ${allLocations.length === 1 ? "site" : "sites"} total`
        : `${filteredLocations.length} of ${allLocations.length} sites`;
  const mapTitleText = typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter
    ? `Trip: ${activeTripName ?? mapHeadline}`
    : mapHeadline;

  // Called when the user clicks a pin or the preview card on the map
  const handleSiteSelect = useCallback((site: MapSite) => {
    void hapticMedium();
    setSelectedMapSite(site);
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) {
      setMobilePanelMode("site");
      setMobilePanelTab("site");
      setSearchPanelOpen(true);
    }
  }, []);

  // Stable callbacks for the map to avoid unnecessary re-renders and listener churn
  const onMapHighlightConsumed = useCallback(() => {
    setHighlightSiteId(null);
    setHighlightFromSavedList(false);
  }, []);
  const onMapSiteSelect = useCallback(
    (site: ClientMapSite) => handleSiteSelect(site as MapSite),
    [handleSiteSelect]
  );

  const signInRedirectUrl = "/auth/sign-in?redirectTo=" + encodeURIComponent("/map");

  const renderToolPanel = useCallback(
    (toolId: string, onClose: () => void, opts?: { autoAdvanceSlideshow?: boolean }) => {
      if (toolId === "site") {
        if (!selectedMapSite) return null;
        const regionSlug = selectedMapSite.province_slug ?? null;
        const detailHref = regionSlug
          ? `/heritage/${regionSlug}/${selectedMapSite.slug}`
          : `/heritage/${selectedMapSite.slug}`;
        return (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Carousel — fills available vertical space proportionally */}
            <div className="relative w-full overflow-hidden bg-neutral-300 flex-shrink-0" style={{ aspectRatio: "4/3" }}>
              <SiteCarousel
                slides={(() => {
                  const thumb = getThumbOrVariantUrlNoTransform(selectedMapSite.cover_photo_url, "thumb") || selectedMapSite.cover_photo_url || null;
                  if (slideshowUrls === null) return thumb ? [thumb] : [];
                  if (slideshowUrls.length === 0) return thumb ? [thumb] : [];
                  return thumb && thumb !== slideshowUrls[0] ? [thumb, ...slideshowUrls] : slideshowUrls;
                })()}
                alt={selectedMapSite.title}
                autoAdvance={opts?.autoAdvanceSlideshow ?? false}
              />
              {/* Close button overlaid on photo */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 z-20 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                title="Close"
              >
                <Icon name="times" size={16} />
              </button>
            </div>

            {/* Details — no scroll, everything must fit */}
            <div className="flex flex-col px-4 pt-3 pb-2 gap-2 flex-1 min-h-0 overflow-hidden">
              {/* Title row with ellipsis actions menu */}
              <div className="flex items-start gap-2 shrink-0">
                <h2 className="flex-1 min-w-0 text-lg font-bold text-[var(--brand-blue)] leading-tight truncate">
                  {selectedMapSite.title}
                </h2>
                <div className="shrink-0 relative" ref={sitePanelActionsMenuRef}>
                  <button
                    type="button"
                    title="More actions"
                    aria-label="More actions"
                    aria-expanded={showSitePanelActionsMenu}
                    onClick={() => setShowSitePanelActionsMenu((v) => !v)}
                    className="p-1 flex items-center justify-center text-gray-600 hover:text-[var(--brand-orange)] transition-colors cursor-pointer"
                  >
                    <Icon name="ellipsis" size={22} className="text-current" />
                  </button>
                </div>
              </div>

              {/* Rating + type badge + location */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {selectedMapSite.avg_rating != null && (
                  <span className="px-2 py-0.5 rounded-full bg-[#00b78b] text-white text-xs font-semibold inline-flex items-center gap-1">
                    <Icon name="star" size={11} />
                    {selectedMapSite.avg_rating.toFixed(1)}
                  </span>
                )}
                {selectedMapSite.heritage_type && (
                  <span className="px-2 py-0.5 rounded-full bg-[#F78300]/10 text-[#F78300] font-medium text-xs">
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

              {/* Description — clamped so it never causes overflow */}
              {selectedMapSite.tagline && (
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 shrink-0">
                  {selectedMapSite.tagline}
                </p>
              )}

              {/* Categories */}
              {(() => {
                const cats: string[] = ((selectedMapSite as any).site_categories ?? [])
                  .map((sc: any) => categoryMap[sc.category_id])
                  .filter(Boolean);
                return cats.length ? (
                  <div className="shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Categories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cats.map((name) => (
                        <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-[var(--brand-blue)] text-xs font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Regions */}
              {(() => {
                const regs: string[] = ((selectedMapSite as any).site_regions ?? [])
                  .map((sr: any) => regionMap[sr.region_id])
                  .filter(Boolean);
                return regs.length ? (
                  <div className="shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Regions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {regs.map((name) => (
                        <span key={name} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Spacer pushes button to bottom */}
              <div className="flex-1" />

              {/* Open Site button */}
              <Link
                href={detailHref}
                className="shrink-0 flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-[var(--brand-orange)] text-white font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
              >
                Open Site
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          </div>
        );
      }

      if (toolId === "wishlist") {
        if (isSignedIn === false) {
          return (
            <div className="p-4 flex flex-col items-center justify-center min-h-[200px] text-center bg-gray-50/80 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">Sign in to view your saved lists</p>
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
              /* ── Expanded: single saved list ── */
              <>
                <div className="shrink-0 px-4 pt-4 pb-3 border-b border-gray-100 bg-gray-50/50">
                  <button
                    type="button"
                    onClick={() => setExpandedWishlistId(null)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[var(--brand-blue)] font-medium mb-3 transition-colors"
                  >
                    <Icon name="arrow-left" size={14} />
                    Back to my lists
                  </button>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-[var(--brand-blue)] truncate leading-tight">
                        {expandedWishlist?.name ?? "Saved list"}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {wishlistItems.length} {wishlistItems.length === 1 ? "site" : "sites"} · Tap a site to locate on map
                      </p>
                    </div>
                    {wishlistItems.length > 0 && (
                      activeWishlistId === expandedWishlistId ? (
                        <button
                          type="button"
                          onClick={() => { clearSidebarFilter(); onClose(); }}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-orange)] border border-[var(--brand-orange)] rounded-lg px-3 py-2 hover:bg-orange-50 transition-colors"
                        >
                          <Icon name="times" size={10} />
                          Clear from map
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { applyWishlistFilter(expandedWishlistId, expandedWishlist?.name); onClose(); }}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-orange)] rounded-lg px-3 py-2 hover:opacity-90 transition-opacity"
                        >
                          <Icon name="map-pin" size={10} />
                          Show on map
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-3">
                  {wishlistItemsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                      <Icon name="spinner" size={20} className="animate-spin" />
                      <span className="text-sm">Loading sites…</span>
                    </div>
                  ) : wishlistItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                      <span className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Icon name="list-ul" size={24} className="text-gray-400" />
                      </span>
                      <p className="text-sm font-medium text-gray-600">No sites in this list yet</p>
                      <p className="text-xs text-gray-400 mt-1.5">Save heritage sites from their detail pages to build your list.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {wishlistItems.map((item) => {
                        const site = item.sites;
                        const title = site?.title ?? "Site";
                        const thumbUrl = site?.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site?.cover_photo_url, "thumb") ?? null;
                        return (
                          <li key={item.site_id}>
                            <button
                              type="button"
                              onClick={() => {
                                setHighlightFromSavedList(true);
                                setHighlightSiteId(item.site_id);
                              }}
                              className="w-full cursor-pointer flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow-md hover:bg-gray-50/50 transition-all text-left group"
                            >
                              <span className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-gray-300">
                                    <Icon name="map-pin" size={20} />
                                  </span>
                                )}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate group-hover:text-[var(--brand-orange)] transition-colors">{title}</span>
                                <span className="block text-xs text-gray-400 mt-0.5">Tap to locate on map</span>
                              </span>
                              <span className="shrink-0 p-2 -m-2 flex items-center justify-center cursor-pointer rounded-lg hover:bg-black/5 transition-colors" aria-hidden>
                                <Icon name="chevron-right" size={14} className="text-gray-300 group-hover:text-[var(--brand-orange)] transition-colors" />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              /* ── List: all saved lists (title is in sidebar header) ── */
              <>
                {activeWishlistId && (
                  <div className="mx-4 mt-2 mb-2 flex items-center justify-between gap-2 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon name="map-pin" size={14} className="text-[var(--brand-orange)] shrink-0" />
                      <span className="text-xs font-medium text-orange-800 truncate">
                        Showing: {wishlists.find((w) => w.id === activeWishlistId)?.name ?? "List"}
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

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 pt-4 pb-4">
                  {wishlistsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                      <Icon name="spinner" size={20} className="animate-spin" />
                      <span className="text-sm">Loading your lists…</span>
                    </div>
                  ) : wishlists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                      <span className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Icon name="list-ul" size={24} className="text-gray-400" />
                      </span>
                      <p className="text-sm font-medium text-gray-600">No saved lists yet</p>
                      <p className="text-xs text-gray-400 mt-1.5">Save sites from their detail pages to create lists and plan your visits.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2.5">
                      {wishlists.map((w) => {
                        const count = (w.wishlist_items?.[0] as { count?: number })?.count ?? 0;
                        const isActive = activeWishlistId === w.id;
                        return (
                          <li
                            key={w.id}
                            className={`rounded-xl border bg-white shadow-sm transition-all ${
                              isActive ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/15" : "border-gray-100 hover:border-gray-200 hover:shadow-md"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                showLoadingSavedListToast(w.name);
                                setExpandedWishlistId(w.id);
                                applyWishlistFilter(w.id, w.name);
                              }}
                              className="flex w-full min-w-0 items-center gap-3 p-3.5 text-left cursor-pointer"
                            >
                              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                isActive ? "bg-[var(--brand-orange)]" : "bg-orange-50"
                              }`}>
                                <Icon name="heart" size={18} className={isActive ? "text-white" : "text-[var(--brand-orange)]"} />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate">{w.name}</span>
                                <span className="block text-xs text-gray-500 mt-0.5">{count} {count === 1 ? "site" : "sites"}</span>
                              </span>
                              <Icon name="chevron-right" size={14} className="text-gray-300 shrink-0" />
                            </button>
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
            <div className="p-6 flex flex-col items-center justify-center min-h-[220px] text-center">
              <span className="w-14 h-14 rounded-full bg-[var(--brand-blue)]/10 flex items-center justify-center mb-4">
                <Icon name="route" size={28} className="text-[var(--brand-blue)]" />
              </span>
              <p className="text-sm font-medium text-gray-700 mb-1">Sign in to view your trips</p>
              <p className="text-xs text-gray-500 mb-5 max-w-[200px]">Your saved trips will appear here so you can show them on the map.</p>
              <Link
                href={signInRedirectUrl}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Sign in
              </Link>
            </div>
          );
        }
        return (
          <div className="flex flex-col min-h-0 h-full">
            <p className="px-4 pb-3 text-xs text-gray-500 border-b border-gray-100">
              Select a trip to show its sites on the map
            </p>
            {typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && (
              <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                <span className="text-xs font-medium text-orange-800">Showing a trip on map</span>
                <button
                  type="button"
                  onClick={() => { clearSidebarFilter(); onClose(); }}
                  className="text-xs font-semibold text-[var(--brand-orange)] hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {tripsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                  <Icon name="spinner" size={24} className="animate-spin text-[var(--brand-orange)]" />
                  <span className="text-sm">Loading your trips…</span>
                </div>
              ) : trips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-2">
                  <span className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Icon name="route" size={24} className="text-gray-400" />
                  </span>
                  <p className="text-sm font-medium text-gray-600">No trips yet</p>
                  <p className="text-xs text-gray-400 mt-1.5">Create a trip in your dashboard to see it here.</p>
                  <Link
                    href="/dashboard/mytrips"
                    className="mt-4 inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Icon name="route" size={14} />
                    Go to My Trips
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {trips.map((t) => {
                    const isActive = typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && sidebarFilter.tripId === t.id;
                    return (
                      <li
                        key={t.id}
                        className={`rounded-xl border bg-white shadow-sm transition-all duration-200 ${
                          isActive
                            ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/20 bg-orange-50/50"
                            : "border-gray-100 hover:border-gray-200 hover:shadow-md"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => { applyTripFilter(t.id, t.name); onClose(); }}
                          className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left"
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            isActive ? "bg-[var(--brand-orange)] text-white" : "bg-gray-100 text-[var(--brand-blue)]"
                          }`}>
                            <Icon name="route" size={18} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate transition-colors ${
                              isActive ? "text-[var(--brand-orange)]" : "text-[var(--brand-blue)]"
                            }`}>
                              {t.name}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {isActive ? "Visible on map" : "Tap to show on map"}
                            </p>
                          </div>
                          <Icon
                            name="chevron-right"
                            size={16}
                            className={`shrink-0 transition-colors ${isActive ? "text-[var(--brand-orange)]" : "text-gray-400"}`}
                            aria-hidden
                          />
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
      return null;
    },
    [
      selectedMapSite,
      categoryMap,
      regionMap,
      isSignedIn,
      signInRedirectUrl,
      allLocations,
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
      showLoadingSavedListToast,
      showSitePanelActionsMenu,
      setShowSitePanelActionsMenu,
      setShowSitePanelWishlistModal,
      setShowSitePanelTripModal,
      handleFilterChange,
      setShowNearbyModal,
      slideshowUrls,
    ]
  );

  /* Stable callback for "Places Nearby" from map so map pins don't re-render on every interaction */
  const onPlacesNearbyApply = useCallback((site: { id: string; title: string; latitude: number; longitude: number }) => {
    handleFilterChange({
      centerSiteId: site.id,
      centerLat: site.latitude,
      centerLng: site.longitude,
      radiusKm: 5,
      centerSiteTitle: site.title,
    });
    setSelectedMapSite(null);
  }, [handleFilterChange]);

  /* Stable radius circle object so map doesn't get new reference on every render */
  const radiusCircle = useMemo((): { centerLat: number; centerLng: number; radiusKm: number } | null => {
    const active =
      nearbyActive &&
      typeof filters.centerLat === "number" &&
      typeof filters.centerLng === "number" &&
      typeof filters.radiusKm === "number" &&
      filters.radiusKm > 0;
    if (!active) return null;
    return {
      centerLat: filters.centerLat as number,
      centerLng: filters.centerLng as number,
      radiusKm: filters.radiusKm as number,
    };
  }, [nearbyActive, filters.centerLat, filters.centerLng, filters.radiusKm]);

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

  const tools: Tool[] = mapTools;

  const mobilePanelContent = mobilePanelMode === "search" ? (
    <SearchFilters
      filters={filters}
      onFilterChange={handleFilterChange}
      onSearch={() => { closeSearchPanel(); triggerFitFiltered(); }}
      onOpenNearbyModal={() => setShowNearbyModal(true)}
      onClearNearby={() => showMapToast("Proximity filter cleared")}
      onReset={() => showMapToast("Filters reset")}
    />
  ) : mobilePanelMode === "site" ? (
    renderToolPanel("site", () => { setSelectedMapSite(null); closeSearchPanel(); })
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
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => { setLoadError(false); setLoading(true); setPhase1RetryCount(0); }}
                className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-white font-medium hover:opacity-90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
              >
                Refresh page
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Pass enriched, memoized data with province_slug for province-aware links */}
        <ClientOnlyMap
          locations={filteredLocations as ClientMapSite[]}
          settings={mapSettings}
          icons={allIcons}
          highlightSiteId={highlightSiteId}
          onHighlightConsumed={onMapHighlightConsumed}
          openPreviewWithoutZoom={
            highlightFromSavedList ||
            (typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter)
          }
          onSiteSelect={onMapSiteSelect}
          mapType={mapType}
          permanentTooltips={typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter}
          directMarkerSelect={typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter}
          siteDates={tripSiteDates}
          hoveredSiteId={tripPanelHoveredSiteId}
          resetMapViewTrigger={resetMapViewTrigger}
          fitFilteredTrigger={fitFilteredTrigger}
          fitBoundsToLocations={nearbyActive}
          radiusCircle={radiusCircle}
          onPlacesNearbyApply={onPlacesNearbyApply}
          userLat={gpsCoords?.lat ?? null}
          userLng={gpsCoords?.lng ?? null}
          flyToTrigger={mapFlyToTrigger}
        />
        {sitesLoadError && (
          <div className="fixed left-1/2 top-20 z-[2147483646] -translate-x-1/2 pointer-events-auto" aria-live="polite">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-lg flex items-center gap-3 max-w-[90vw]">
              <span className="text-sm text-amber-800">Sites could not be loaded.</span>
              <button
                type="button"
                onClick={retrySitesLoad}
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-white text-sm font-medium hover:bg-amber-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {sitesLoading && (
          <div className="fixed inset-x-0 bottom-0 z-[2900] pointer-events-none flex justify-center pb-20 sm:pb-16" aria-live="polite">
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
        {/* Map type switcher: desktop only; on mobile use ellipsis → Switch Map Type */}
        {(() => {
          return (
        <div
          className="hidden lg:flex absolute right-4 z-[1000] items-center gap-2 bottom-4 right-4"
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
          );
        })()}
        {/* Mobile: Trip Details button (above bottom nav) when a trip is applied */}
        {!loadError && typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && (
          <button
            type="button"
            onClick={() => setMobileTripSheetOpen(true)}
            className="lg:hidden fixed right-4 z-[3100] flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--brand-blue)] text-white shadow-lg text-sm font-semibold hover:opacity-90 active:opacity-95 transition-opacity"
            style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
            aria-label="Trip details"
          >
            <span>Trip Details</span>
          </button>
        )}
        {/* Mobile: Show List button (same position as Trip Details) when a saved list is applied */}
        {!loadError && typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter && (
          <button
            type="button"
            onClick={() => {
              setExpandedWishlistId(sidebarFilter.wishlistId);
              setMobileListSheetOpen(true);
            }}
            className="lg:hidden fixed right-4 z-[3100] flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--brand-blue)] text-white shadow-lg text-sm font-semibold hover:opacity-90 active:opacity-95 transition-opacity"
            style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
            aria-label="Show list"
          >
            <span>Show List</span>
          </button>
        )}
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
                  className="hidden lg:flex absolute right-10 top-[62px] bottom-[72px] z-[1000] w-[280px] flex-col rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/80 overflow-hidden"
                  aria-label="Trip details"
                >
                  <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                    <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-[var(--brand-orange)]/10 flex items-center justify-center text-[var(--brand-orange)]" aria-hidden>
                      <Icon name="map-marker-alt" size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-orange)] mb-0.5">
                        Showing on map
                      </div>
                      <h3 className="text-sm font-semibold text-gray-800 leading-snug break-words">
                        Trip: {activeTripName ?? "—"}
                      </h3>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {tripItemsLoading || tripTimelineLoading
                          ? "Loading…"
                          : `${tripItems.length} ${tripItems.length === 1 ? "site" : "sites"}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearSidebarFilter}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
                      title="Close trip panel"
                      aria-label="Close trip panel"
                    >
                      <Icon name="times" size={12} />
                    </button>
                  </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-3 py-2">
                {tripItemsLoading && !tripTimeline.length ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Icon name="spinner" size={16} className="animate-spin" />
                    <span className="text-sm">Loading sites…</span>
                  </div>
                ) : tripItems.length === 0 && tripTimeline.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No sites in this trip.</p>
                ) : tripTimeline.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-[5px] top-[10px] bottom-[18px] border-l-2 border-dashed border-[var(--brand-blue)]/40 pointer-events-none" aria-hidden="true" />
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
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[var(--brand-blue)] text-white text-[11px] font-semibold">
                                Day {dayNumber}: {title}
                              </span>
                            </div>
                          </li>
                        );
                        const itemsForDay = itemsByDayId.get(day.id) ?? [];
                        itemsForDay.forEach((item, itemIdx) => {
                          const siteTitle = item.site?.title ?? "Site";
                          const cover = item.site?.cover_photo_url ?? null;
                          const thumbUrl = item.site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(cover, "thumb") || null;
                          const smallDate = formatSmallDate(item.date_in ?? day.the_date ?? null);
                          out.push(
                            <li key={`site-${item.id ?? item.site_id}`}>
                              <button
                                type="button"
                                onClick={() => { const s = allLocationsById.get(item.site_id); if (s) handleSiteSelect(s as MapSite); }}
                                onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)}
                                onMouseLeave={() => setTripPanelHoveredSiteId(null)}
                                className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer"
                              >
                                <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                                <span className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate transition-colors">{siteTitle}</span>
                                  {smallDate && (
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                      <Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />
                                      {smallDate}
                                    </span>
                                  )}
                                </span>
                                <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                      <Icon name="map-pin" size={14} />
                                    </span>
                                  )}
                                </span>
                              </button>
                              {itemIdx < itemsForDay.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
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
                        ungroupedItems.forEach((item, itemIdx) => {
                          const siteTitle = item.site?.title ?? "Site";
                          const cover = item.site?.cover_photo_url ?? null;
                          const thumbUrl = item.site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(cover, "thumb") || null;
                          const smallDate = formatSmallDate(item.date_in ?? null);
                          out.push(
                            <li key={`site-${item.id ?? item.site_id}`}>
                              <button
                                type="button"
                                onClick={() => { const s = allLocationsById.get(item.site_id); if (s) handleSiteSelect(s as MapSite); }}
                                onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)}
                                onMouseLeave={() => setTripPanelHoveredSiteId(null)}
                                className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer"
                              >
                                <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                                <span className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate transition-colors">{siteTitle}</span>
                                  {smallDate && (
                                    <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                                      <Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />
                                      {smallDate}
                                    </span>
                                  )}
                                </span>
                                <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                      <Icon name="map-pin" size={14} />
                                    </span>
                                  )}
                                </span>
                              </button>
                              {itemIdx < ungroupedItems.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
                            </li>
                          );
                        });
                      }
                      return out;
                    })()}
                  </ul>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[5px] top-[10px] bottom-[18px] border-l-2 border-dashed border-[var(--brand-blue)]/40 pointer-events-none" aria-hidden="true" />
                  <ul className="pb-2">
                    {tripItems.map((item, itemIdx) => {
                      const site = item.site;
                      const title = site?.title ?? "Site";
                      const cover = site?.cover_photo_url ?? null;
                      const thumbUrl = site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(cover, "thumb") || null;
                      return (
                        <li key={item.site_id}>
                          <button
                            type="button"
                            onClick={() => { const s = allLocationsById.get(item.site_id); if (s) handleSiteSelect(s as MapSite); }}
                            onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)}
                            onMouseLeave={() => setTripPanelHoveredSiteId(null)}
                            className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer"
                          >
                            <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                            <span className="text-sm font-medium text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate flex-1 min-w-0 transition-colors">{title}</span>
                            <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                              {thumbUrl ? (
                                <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                  <Icon name="map-pin" size={14} />
                                </span>
                              )}
                            </span>
                          </button>
                          {itemIdx < tripItems.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                )}
              </div>
              <div className="shrink-0 flex justify-center py-2 border-t border-gray-100" aria-hidden="true">
                <Icon name="chevron-down" size={14} className="text-gray-400" />
              </div>
            </div>
              );
            }

            return (
              <div
                className={`hidden lg:flex absolute right-10 top-[62px] z-[1000] rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/80 px-4 py-3 max-w-[220px] lg:max-w-[320px] items-start gap-3 ${nearbyActive ? "cursor-pointer hover:ring-[var(--brand-orange)]/30 transition-shadow hover:shadow-md" : ""}`}
                aria-label={nearbyActive ? "Current map view – click to change places nearby" : "Current map view"}
                role={nearbyActive ? "button" : "status"}
                tabIndex={nearbyActive ? 0 : undefined}
                onClick={nearbyActive ? () => setShowNearbyModal(true) : undefined}
                onKeyDown={nearbyActive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowNearbyModal(true); } } : undefined}
              >
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-[var(--brand-orange)]/10 flex items-center justify-center text-[var(--brand-orange)]" aria-hidden>
                  <Icon name="map-marker-alt" size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-orange)] mb-0.5">
                    Showing on map
                  </div>
                  <div className="text-sm font-semibold text-gray-800 leading-snug break-words">
                    {mapHeadline}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {loading || sitesLoading
                      ? "Loading…"
                      : nearbyActive && typeof filters.radiusKm === "number"
                        ? `${filteredLocations.length} ${filteredLocations.length === 1 ? "site" : "sites"} within ${filters.radiusKm} km`
                        : filteredLocations.length === allLocations.length
                          ? `${allLocations.length} ${allLocations.length === 1 ? "site" : "sites"} total`
                          : `${filteredLocations.length} of ${allLocations.length} sites`}
                  </div>
                </div>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearAllFilters();
                    }}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
                    title="Clear filters and show all sites"
                    aria-label="Clear filters and show all sites"
                  >
                    <Icon name="times" size={12} />
                  </button>
                )}
              </div>
            );
          })()}
      </div>

      {mounted &&
        searchPanelOpen &&
        createPortal(
          <div
            className="lg:hidden fixed inset-0 touch-none"
            style={{ zIndex: 99999 }}
            aria-modal="true"
            role="dialog"
            aria-label="Map menu"
          >
            {/* Backdrop */}
            <div
              className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${searchPanelVisible ? "opacity-100" : "opacity-0"}`}
              onClick={() => {
                if (mobilePanelMode === "site") setSelectedMapSite(null);
                closeSearchPanel();
              }}
            />

            {/* Bottom sheet */}
            <div
              className="absolute inset-x-0 bottom-0 bg-[var(--ivory-cream)] flex flex-col overflow-hidden rounded-t-2xl shadow-2xl"
              style={{
                maxHeight: "92dvh",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                transform: searchPanelVisible
                  ? `translateY(${sheetDragY}px)`
                  : "translateY(100%)",
                transition: sheetIsDraggingRef.current ? "none" : "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
              }}
            >
              {/* Drag handle + header */}
              <div
                className="shrink-0 bg-white border-b border-gray-100 select-none cursor-grab active:cursor-grabbing"
                onTouchStart={(e) => {
                  sheetDragStartRef.current = e.touches[0].clientY;
                  sheetIsDraggingRef.current = false;
                }}
                onTouchMove={(e) => {
                  if (sheetDragStartRef.current === null) return;
                  const dy = e.touches[0].clientY - sheetDragStartRef.current;
                  if (dy > 0) { sheetIsDraggingRef.current = true; setSheetDragY(dy); }
                }}
                onTouchEnd={(e) => {
                  if (sheetDragStartRef.current === null) return;
                  const dy = e.changedTouches[0].clientY - sheetDragStartRef.current;
                  sheetDragStartRef.current = null;
                  sheetIsDraggingRef.current = false;
                  setSheetDragY(0);
                  if (dy > 80) {
                    if (mobilePanelMode === "site") setSelectedMapSite(null);
                    closeSearchPanel();
                  }
                }}
              >
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-1" />
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center shrink-0">
                    <Icon
                      name={mobilePanelMode === "site" ? "map-marker-alt" : mobilePanelMode === "lists" ? "list-ul" : "search"}
                      size={13}
                      className="text-[var(--brand-orange)]"
                    />
                  </div>
                  <span className="flex-1 text-base font-bold text-gray-800 truncate min-w-0">
                    {mobilePanelMode === "search"
                      ? "Search & Filters"
                      : mobilePanelMode === "lists"
                          ? (mobilePanelTab === "wishlist" ? "Saved Lists" : "My Trips")
                          : selectedMapSite?.title ?? "Site Details"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (mobilePanelMode === "site") setSelectedMapSite(null);
                      closeSearchPanel();
                    }}
                    aria-label="Close"
                    className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors shrink-0"
                  >
                    <Icon name="times" size={13} />
                  </button>
                </div>
                {/* Tab bar: only when mode is "lists" */}
                {mobilePanelMode === "lists" && (
                  <div className="flex border-t border-gray-100">
                    {(["wishlist", "trips"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setMobilePanelTab(tab)}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${
                          mobilePanelTab === tab
                            ? "text-[var(--brand-orange)] border-b-2 border-[var(--brand-orange)]"
                            : "text-[var(--brand-grey)]"
                        }`}
                      >
                        {tab === "wishlist" ? "Saved Lists" : "My Trips"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Scrollable content */}
              <div className={`flex-1 min-h-0 overflow-y-auto touch-auto overscroll-contain ${mobilePanelMode === "search" ? "" : "p-4"} ${mobilePanelMode === "site" ? "scrollbar-hide p-0" : ""}`}>
                <div className={`min-h-full overflow-hidden ${mobilePanelMode === "search" ? "" : "rounded-xl bg-white shadow-md border border-gray-200"} ${mobilePanelMode === "site" ? "p-0 border-0 shadow-none rounded-none" : ""}`}>
                  {mobilePanelContent}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile: ellipsis bottom sheet — My Saved Lists & My Trips */}
      {mounted && mobileEllipsisSheetOpen &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[3500] touch-none" aria-modal="true" role="dialog" aria-label="My lists and trips">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${mobileEllipsisSheetVisible ? "opacity-100" : "opacity-0"}`}
              onClick={() => setMobileEllipsisSheetOpen(false)}
              aria-hidden="true"
            />
            <div
              className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileEllipsisSheetVisible ? "translate-y-0" : "translate-y-full"}`}
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300/80 mx-auto mt-3 shrink-0" aria-hidden="true" />
              <p className="text-center text-[13px] text-gray-500 font-medium pt-2 pb-3 px-6">Lists & Trips</p>
              <div className="px-4 pb-6 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileEllipsisSheetOpen(false);
                    setMobilePanelMode("lists");
                    setMobilePanelTab("wishlist");
                    setSearchPanelOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-orange)]/10 flex items-center justify-center shrink-0">
                    <Icon name="list-ul" size={20} className="text-[var(--brand-orange)]" />
                  </div>
                  <span className="text-[15px] font-semibold text-gray-900">My Saved Lists</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileEllipsisSheetOpen(false);
                    setMobilePanelMode("lists");
                    setMobilePanelTab("trips");
                    setSearchPanelOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-blue)]/10 flex items-center justify-center shrink-0">
                    <Icon name="route" size={20} className="text-[var(--brand-blue)]" />
                  </div>
                  <span className="text-[15px] font-semibold text-gray-900">My Trips</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileEllipsisSheetOpen(false);
                    setMobileMapTypeSheetOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-200/80 flex items-center justify-center shrink-0">
                    <Icon name="map" size={20} className="text-gray-600" />
                  </div>
                  <span className="text-[15px] font-semibold text-gray-900">Switch Map Type</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile: map type selection bottom sheet */}
      {mounted && mobileMapTypeSheetOpen &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[3600] touch-none" aria-modal="true" role="dialog" aria-label="Map type">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${mobileMapTypeSheetVisible ? "opacity-100" : "opacity-0"}`}
              onClick={() => setMobileMapTypeSheetOpen(false)}
              aria-hidden="true"
            />
            <div
              className={`absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileMapTypeSheetVisible ? "translate-y-0" : "translate-y-full"}`}
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300/80 mx-auto mt-3 shrink-0" aria-hidden="true" />
              <p className="text-center text-[13px] text-gray-500 font-medium pt-2 pb-3 px-6">Map type</p>
              <div className="px-4 pb-6 space-y-2">
                {[
                  { type: "osm" as const, label: "Default (Light)", iconKey: "climate-geography-environment" as const },
                  { type: "google" as const, label: "Road Map", iconKey: "map" as const },
                  { type: "google_satellite" as const, label: "Terrain", iconKey: "mountain" as const },
                ].map(({ type, label, iconKey }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setMapType(type);
                      setMobileMapTypeSheetOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors ${
                      mapType === type ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]" : "bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-900"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mapType === type ? "bg-[var(--brand-orange)]/20" : "bg-gray-200/80"}`}>
                      <Icon name={iconKey} size={20} className={mapType === type ? "text-[var(--brand-orange)]" : "text-gray-600"} />
                    </div>
                    <span className="text-[15px] font-semibold">{label}</span>
                    {mapType === type && <Icon name="check" size={18} className="ml-auto text-[var(--brand-orange)]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile: site info bottom sheet */}
      <SiteBottomSheet
        site={selectedMapSite}
        isOpen={selectedMapSite !== null}
        onClose={() => setSelectedMapSite(null)}
      />

      {/* Mobile: trip details bottom sheet (same content as desktop floating panel) */}
      {mounted && (mobileTripSheetOpen || mobileTripSheetClosing) && typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[3500] touch-none" aria-modal="true" role="dialog" aria-label="Trip details">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${mobileTripSheetVisible && !mobileTripSheetClosing ? "opacity-100" : "opacity-0"}`}
              onClick={closeTripSheetWithAnimation}
              aria-hidden="true"
            />
            <div
              className={`absolute left-0 right-0 bottom-0 top-[20%] bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileTripSheetVisible && !mobileTripSheetClosing ? "translate-y-0" : "translate-y-full"}`}
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300/80 mx-auto mt-3 shrink-0" aria-hidden="true" />
              <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-[var(--brand-orange)]/10 flex items-center justify-center text-[var(--brand-orange)]" aria-hidden>
                  <Icon name="map-marker-alt" size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-orange)] mb-0.5">Showing on map</div>
                  <h3 className="text-sm font-semibold text-gray-800 leading-snug break-words">Trip: {activeTripName ?? "—"}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {tripItemsLoading || tripTimelineLoading ? "Loading…" : `${tripItems.length} ${tripItems.length === 1 ? "site" : "sites"}`}
                  </p>
                </div>
                <button type="button" onClick={closeTripSheetWithAnimation} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700" aria-label="Close trip panel">
                  <Icon name="times" size={12} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-3 py-2">
                {tripItemsLoading && !tripTimeline.length ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <Icon name="spinner" size={16} className="animate-spin" />
                    <span className="text-sm">Loading sites…</span>
                  </div>
                ) : tripItems.length === 0 && tripTimeline.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No sites in this trip.</p>
                ) : tripTimeline.length > 0 ? (
                  (() => {
                    type DayEntry = TimelineItem & { kind: "day"; id: string; title?: string | null; the_date?: string | null; order_index?: number };
                    const formatSmallDate = (dateStr: string | null | undefined) =>
                      dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
                    const daysInOrder = (tripTimeline.filter((e) => e.kind === "day") as DayEntry[]).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                    const itemsByDayId = new Map<string | null, TripItemMap[]>();
                    for (const item of tripItems) {
                      const key = item.day_id ?? null;
                      if (!itemsByDayId.has(key)) itemsByDayId.set(key, []);
                      itemsByDayId.get(key)!.push(item);
                    }
                    for (const arr of itemsByDayId.values()) arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                    return (
                      <div className="relative">
                        <div className="absolute left-[5px] top-[10px] bottom-[18px] border-l-2 border-dashed border-[var(--brand-blue)]/40 pointer-events-none" aria-hidden="true" />
                        <ul className="space-y-0 pb-2">
                          {daysInOrder.map((day, idx) => {
                            const dayNumber = idx + 1;
                            const title = day.title?.trim() || "Day";
                            const itemsForDay = itemsByDayId.get(day.id) ?? [];
                            return (
                              <React.Fragment key={`day-${day.id}`}>
                                <li className="pt-3 pb-1.5 first:pt-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[var(--brand-blue)] text-white text-[11px] font-semibold">Day {dayNumber}: {title}</span>
                                  </div>
                                </li>
                                {itemsForDay.map((item, itemIdx) => {
                                  const siteTitle = item.site?.title ?? "Site";
                                  const thumbUrl = item.site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(item.site?.cover_photo_url, "thumb") || null;
                                  const smallDate = formatSmallDate(item.date_in ?? (day as DayEntry).the_date ?? null);
                                  const site = allLocationsById.get(item.site_id);
                                  return (
                                    <li key={`site-${item.id ?? item.site_id}`}>
                                      <button type="button" onClick={() => site && handleSiteSelect(site as MapSite)} onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)} onMouseLeave={() => setTripPanelHoveredSiteId(null)} className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer">
                                        <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                                        <span className="flex-1 min-w-0 text-left">
                                          <span className="block text-sm font-semibold text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate transition-colors">{siteTitle}</span>
                                          {smallDate && <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5"><Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />{smallDate}</span>}
                                        </span>
                                        <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                                          {thumbUrl ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]"><Icon name="map-pin" size={14} /></span>}
                                        </span>
                                      </button>
                                      {itemIdx < itemsForDay.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
                                    </li>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                          {(itemsByDayId.get(null) ?? []).length > 0 && (
                            <>
                              <li className="pt-3 pb-1.5"><div className="flex items-center gap-2 mb-1.5"><span className="text-[10px] font-semibold text-gray-500">Other sites</span></div><div className="border-b border-gray-100 mb-1.5" /></li>
                              {itemsByDayId.get(null)!.map((item, itemIdx) => {
                                const siteTitle = item.site?.title ?? "Site";
                                const thumbUrl = item.site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(item.site?.cover_photo_url, "thumb") || null;
                                const smallDate = formatSmallDate(item.date_in ?? null);
                                const site = allLocationsById.get(item.site_id);
                                return (
                                  <li key={`site-${item.id ?? item.site_id}`}>
                                    <button type="button" onClick={() => site && handleSiteSelect(site as MapSite)} onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)} onMouseLeave={() => setTripPanelHoveredSiteId(null)} className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer">
                                      <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                                      <span className="flex-1 min-w-0 text-left">
                                        <span className="block text-sm font-semibold text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate transition-colors">{siteTitle}</span>
                                        {smallDate && <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5"><Icon name="calendar-alt" size={10} className="text-amber-600 shrink-0" />{smallDate}</span>}
                                      </span>
                                      <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                                        {thumbUrl ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]"><Icon name="map-pin" size={14} /></span>}
                                      </span>
                                    </button>
                                    {itemIdx < itemsByDayId.get(null)!.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
                                  </li>
                                );
                              })}
                            </>
                          )}
                        </ul>
                      </div>
                    );
                  })()
                ) : (
                  <div className="relative">
                    <div className="absolute left-[5px] top-[10px] bottom-[18px] border-l-2 border-dashed border-[var(--brand-blue)]/40 pointer-events-none" aria-hidden="true" />
                    <ul className="pb-2">
                      {tripItems.map((item, itemIdx) => {
                        const site = item.site;
                        const title = site?.title ?? "Site";
                        const thumbUrl = site?.cover_photo_thumb_url || getThumbOrVariantUrlNoTransform(site?.cover_photo_url, "thumb") || null;
                        const siteObj = allLocationsById.get(item.site_id);
                        return (
                          <li key={item.site_id}>
                            <button type="button" onClick={() => siteObj && handleSiteSelect(siteObj as MapSite)} onMouseEnter={() => setTripPanelHoveredSiteId(item.site_id)} onMouseLeave={() => setTripPanelHoveredSiteId(null)} className="group w-full flex items-start gap-2.5 py-2 pr-1 hover:bg-gray-200 text-left transition-colors cursor-pointer">
                              <span className="relative z-10 w-3 h-3 rounded-full bg-[var(--brand-blue)] group-hover:bg-[var(--brand-orange)] shrink-0 ring-2 ring-white mt-[3px] transition-colors" />
                              <span className="text-sm font-medium text-[var(--brand-blue)] group-hover:text-[var(--brand-orange)] truncate flex-1 min-w-0 transition-colors">{title}</span>
                              <span className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                                {thumbUrl ? <img src={thumbUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]"><Icon name="map-pin" size={14} /></span>}
                              </span>
                            </button>
                            {itemIdx < tripItems.length - 1 && <div className="mx-12 h-px bg-gray-100" />}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile: saved list bottom sheet (same structure as trip sheet) */}
      {mounted && (mobileListSheetOpen || mobileListSheetClosing) && typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[3500] touch-none" aria-modal="true" role="dialog" aria-label="List details">
            <div
              className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${mobileListSheetVisible && !mobileListSheetClosing ? "opacity-100" : "opacity-0"}`}
              onClick={closeListSheetWithAnimation}
              aria-hidden="true"
            />
            <div
              className={`absolute left-0 right-0 bottom-0 top-[20%] bg-white rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileListSheetVisible && !mobileListSheetClosing ? "translate-y-0" : "translate-y-full"}`}
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300/80 mx-auto mt-3 shrink-0" aria-hidden="true" />
              <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-gray-100">
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-[var(--brand-orange)]/10 flex items-center justify-center text-[var(--brand-orange)]" aria-hidden>
                  <Icon name="list-ul" size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-orange)] mb-0.5">Showing on map</div>
                  <h3 className="text-sm font-semibold text-gray-800 leading-snug break-words">{activeWishlistName ?? "Saved list"}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {wishlistItemsLoading && expandedWishlistId === sidebarFilter.wishlistId ? "Loading…" : `${wishlistItems.length} ${wishlistItems.length === 1 ? "site" : "sites"}`}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { clearSidebarFilter(); closeListSheetWithAnimation(); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-orange)] border border-[var(--brand-orange)] rounded-lg px-3 py-2 hover:bg-orange-50 transition-colors"
                  >
                    <Icon name="times" size={10} />
                    Clear from map
                  </button>
                  <button type="button" onClick={closeListSheetWithAnimation} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700" aria-label="Close list panel">
                    <Icon name="times" size={12} />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-3 py-2">
                {wishlistItemsLoading && expandedWishlistId === sidebarFilter.wishlistId ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                    <Icon name="spinner" size={20} className="animate-spin" />
                    <span className="text-sm">Loading sites…</span>
                  </div>
                ) : wishlistItems.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No sites in this list yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {wishlistItems.map((item) => {
                      const site = item.sites;
                      const title = site?.title ?? "Site";
                      const thumbUrl = site?.cover_photo_thumb_url ?? getThumbOrVariantUrlNoTransform(site?.cover_photo_url, "thumb") ?? null;
                      return (
                        <li key={item.site_id}>
                          <button
                            type="button"
                            onClick={() => {
                              setHighlightFromSavedList(true);
                              setHighlightSiteId(item.site_id);
                            }}
                            className="w-full cursor-pointer flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow-md hover:bg-gray-50/50 transition-all text-left group"
                          >
                            <span className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                              {thumbUrl ? (
                                <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-gray-300">
                                  <Icon name="map-pin" size={20} />
                                </span>
                              )}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-[var(--brand-blue)] truncate group-hover:text-[var(--brand-orange)] transition-colors">{title}</span>
                              <span className="block text-xs text-gray-400 mt-0.5">Tap to locate on map</span>
                            </span>
                            <span className="shrink-0 p-2 -m-2 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors" aria-hidden>
                              <Icon name="chevron-right" size={14} className="text-gray-300 group-hover:text-[var(--brand-orange)] transition-colors" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
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
          onSearch={triggerFitFiltered}
          onOpenNearbyModal={() => setShowNearbyModal(true)}
          onClearNearby={() => showMapToast("Proximity filter cleared")}
          onReset={() => showMapToast("Filters reset")}
          renderToolPanel={(toolId, onClose) => renderToolPanel(toolId, onClose, { autoAdvanceSlideshow: true })}
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
          centerSiteTitle: filters.centerSiteTitle ?? centerSiteTitle,
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
          const rkm = v.radiusKm ?? 5;
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

      {/* Site panel modals: Save (wishlist) and Add to Trip — portaled so they overlay sidebar */}
      {selectedMapSite && showSitePanelWishlistModal &&
        createPortal(
          <AddToWishlistModal
            siteId={selectedMapSite.id}
            onClose={() => setShowSitePanelWishlistModal(false)}
            site={{
              name: selectedMapSite.title,
              imageUrl: getThumbOrVariantUrlNoTransform(selectedMapSite.cover_photo_url, "thumb") || undefined,
              location: selectedMapSite.location_free ?? undefined,
            }}
          />,
          document.body
        )}
      {selectedMapSite && showSitePanelTripModal &&
        createPortal(
          <AddToTripModal
            siteId={selectedMapSite.id}
            onClose={() => setShowSitePanelTripModal(false)}
          />,
          document.body
        )}

      {/* Site panel actions: desktop = dropdown, mobile = full-screen bottom sheet */}
      {selectedMapSite && showSitePanelActionsMenu && createPortal(
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none"
            onClick={() => setShowSitePanelActionsMenu(false)}
            onMouseDown={(e) => e.stopPropagation()}
          />
          {/* Desktop: dropdown */}
          {sitePanelMenuPosition && (
            <div
              ref={sitePanelActionsMenuPortalRef}
              className="hidden lg:block fixed w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-200 origin-top-left"
              style={{
                top: `${sitePanelMenuPosition.top}px`,
                left: `${sitePanelMenuPosition.left}px`,
              }}
            >
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}` : `/heritage/${selectedMapSite.slug}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700">
                <Icon name="external-link-alt" size={14} className="text-[var(--brand-orange)]" /> Open Site
              </a>
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); setShowSitePanelWishlistModal(true); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                <Icon name="heart" size={14} className="text-[var(--brand-orange)]" /> Save
              </button>
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); setShowSitePanelTripModal(true); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                <Icon name="route" size={14} className="text-[var(--brand-orange)]" /> Add to Trip
              </button>
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); handleFilterChange({ centerSiteId: selectedMapSite.id, centerLat: Number(selectedMapSite.latitude), centerLng: Number(selectedMapSite.longitude), radiusKm: 5, centerSiteTitle: selectedMapSite.title }); setSelectedMapSite(null); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                <Icon name="nearby" size={14} className="text-[var(--brand-orange)]" /> Places Nearby
              </button>
              <div className="border-t border-gray-100" />
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}/gallery` : `/heritage/${selectedMapSite.slug}/gallery`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                <Icon name="gallery" size={14} className="text-[var(--brand-orange)]" /> Gallery
              </a>
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}/photo-story` : `/heritage/${selectedMapSite.slug}/photo-story`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                <Icon name="book" size={14} className="text-[var(--brand-orange)]" /> Photo Story
              </a>
              {selectedMapSite.latitude != null && selectedMapSite.longitude != null && !Number.isNaN(Number(selectedMapSite.latitude)) && !Number.isNaN(Number(selectedMapSite.longitude)) && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${selectedMapSite.latitude},${selectedMapSite.longitude}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-sm font-medium text-gray-700 border-t border-gray-100">
                  <Icon name="map-marker-alt" size={14} className="text-[var(--brand-orange)]" /> Open in Google Maps
                </a>
              )}
            </div>
          )}
          {/* Mobile: full-screen panel */}
          <div className="lg:hidden fixed inset-0 z-[9999] bg-[#f2f2f7] flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <p className="text-[15px] font-semibold text-gray-900 truncate flex-1 min-w-0">{selectedMapSite.title}</p>
              <button type="button" onClick={() => setShowSitePanelActionsMenu(false)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 shrink-0" aria-label="Close">
                <Icon name="times" size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto py-4">
            <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden">
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}` : `/heritage/${selectedMapSite.slug}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="external-link-alt" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Open Site</span>
              </a>
              <div className="ml-14 h-px bg-gray-100" />
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); setShowSitePanelWishlistModal(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="heart" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Save</span>
              </button>
              <div className="ml-14 h-px bg-gray-100" />
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); setShowSitePanelTripModal(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="route" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Add to Trip</span>
              </button>
              <div className="ml-14 h-px bg-gray-100" />
              <button type="button" onClick={() => { setShowSitePanelActionsMenu(false); handleFilterChange({ centerSiteId: selectedMapSite.id, centerLat: Number(selectedMapSite.latitude), centerLng: Number(selectedMapSite.longitude), radiusKm: 5, centerSiteTitle: selectedMapSite.title }); setSelectedMapSite(null); }} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="nearby" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Places Nearby</span>
              </button>
            </div>
            <div className="mx-4 mb-3 bg-white rounded-2xl overflow-hidden shrink-0">
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}/gallery` : `/heritage/${selectedMapSite.slug}/gallery`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="gallery" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Gallery</span>
              </a>
              <div className="ml-14 h-px bg-gray-100" />
              <a href={selectedMapSite.province_slug ? `/heritage/${selectedMapSite.province_slug}/${selectedMapSite.slug}/photo-story` : `/heritage/${selectedMapSite.slug}/photo-story`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="book" size={16} className="text-gray-700" /></div>
                <span className="text-[15px] font-medium text-gray-900">Photo Story</span>
              </a>
              {selectedMapSite.latitude != null && selectedMapSite.longitude != null && !Number.isNaN(Number(selectedMapSite.latitude)) && !Number.isNaN(Number(selectedMapSite.longitude)) && (
                <>
                  <div className="ml-14 h-px bg-gray-100" />
                  <a href={`https://www.google.com/maps/search/?api=1&query=${selectedMapSite.latitude},${selectedMapSite.longitude}`} target="_blank" rel="noopener noreferrer" onClick={() => setShowSitePanelActionsMenu(false)} className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Icon name="map-marker-alt" size={16} className="text-gray-700" /></div>
                    <span className="text-[15px] font-medium text-gray-900">Open in Google Maps</span>
                  </a>
                </>
              )}
            </div>
            <button type="button" onClick={() => setShowSitePanelActionsMenu(false)} className="mx-4 mb-4 py-4 rounded-2xl bg-white text-[15px] font-semibold text-[var(--brand-blue)] active:bg-gray-50">
              Cancel
            </button>
            </div>
          </div>
        </>,
        document.body
      )}

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

      {/* ── Mobile: solid panel above bottom nav ── */}
      {!loadError && (
        <div
          className="lg:hidden fixed inset-x-0 z-[2998]"
          style={{ bottom: "calc(52px + var(--safe-bottom, 0px))" }}
        >
          <div
            className="flex flex-col bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center gap-3 px-4 py-4">
            {/* Search + result info — tapping opens search filters sheet */}
            <button
              type="button"
              aria-label="Search & Filters"
              onClick={() => { setMobilePanelMode("search"); setSearchPanelOpen(true); }}
              className="flex-1 min-w-0 flex items-center gap-2.5 bg-gray-100 rounded-full px-4 py-2.5 active:bg-gray-200 transition-colors text-left"
            >
              <Icon name="search" size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-gray-700 font-medium truncate leading-tight">
                  {hasActiveFilter
                    ? (mapTitleText.length > 32 ? mapTitleText.slice(0, 30) + "…" : mapTitleText)
                    : "Search heritage sites…"}
                </div>
                <div className="text-[11px] text-gray-400 truncate leading-tight">{mapDisplayText}</div>
              </div>
              {hasActiveFilter && (
                <button
                  type="button"
                  aria-label="Clear filters"
                  onClick={(e) => { e.stopPropagation(); handleClearAllFilters(); }}
                  className="shrink-0 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center active:bg-gray-300 transition-colors"
                >
                  <Icon name="times" size={9} className="text-gray-600" />
                </button>
              )}
            </button>

            {/* Near Me circular button */}
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <button
                type="button"
                aria-label="Near me"
                onClick={() => { void handleNearMe(); }}
                className={`w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors ${gpsStatus === "loading" ? "opacity-60" : ""}`}
              >
                {gpsStatus === "loading" ? (
                  <svg className="animate-spin w-5 h-5 text-[var(--brand-blue)]" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="16 48" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className={`w-5 h-5 ${gpsStatus === "granted" ? "text-[#00c9a7]" : "text-gray-500"}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <span className="text-[9px] font-medium text-gray-500 leading-tight">Near me</span>
            </div>
          </div>

          {/* Category pills */}
          {Object.keys(categoryMap).length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {Object.entries(categoryMap).map(([id, name]) => {
                const active = filters.categoryIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      void hapticLight();
                      setFilters((prev) => ({
                        ...prev,
                        categoryIds: active
                          ? prev.categoryIds.filter((c) => c !== id)
                          : [...prev.categoryIds, id],
                      }));
                    }}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[var(--brand-blue)] text-white"
                        : "bg-gray-100 text-gray-600 active:bg-gray-200"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
              <div className="shrink-0 w-2" />
            </div>
          )}
          </div>
        </div>
      )}

      {/* NearbyMeSheet — shows sites within 20 km of user */}
      {mounted && (
        <NearbyMeSheet
          isOpen={nearbyMeSheetOpen}
          lat={gpsCoords?.lat ?? null}
          lng={gpsCoords?.lng ?? null}
          onClose={() => setNearbyMeSheetOpen(false)}
          onSiteSelect={(site) => {
            const mapSite = allLocationsById.get(site.id);
            if (mapSite) {
              setNearbyMeSheetOpen(false);
              handleSiteSelect(mapSite as MapSite);
            }
          }}
        />
      )}
    </>
  );
}
