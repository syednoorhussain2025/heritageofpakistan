// src/app/map/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import CollapsibleSidebar, { Tool } from "@/components/CollapsibleSidebar";
import SearchFilters, { Filters } from "@/components/SearchFilters";
import { supabase } from "@/lib/supabase/browser";
import type { Site as ClientMapSite } from "@/components/ClientOnlyMap";
import { useBookmarks } from "@/components/BookmarkProvider";
import { getWishlists, getWishlistItems } from "@/lib/wishlists";
import { listTripsByUsername, getTripWithItems } from "@/lib/trips";
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

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>(null);
  const [wishlistSiteIds, setWishlistSiteIds] = useState<string[]>([]);
  const [tripSiteIds, setTripSiteIds] = useState<string[]>([]);

  const [wishlists, setWishlists] = useState<{ id: string; name: string; wishlist_items: { count: number }[] }[]>([]);
  const [wishlistsLoading, setWishlistsLoading] = useState(false);
  const [trips, setTrips] = useState<{ id: string; name: string; slug?: string | null }[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<"search" | "bookmarks" | "wishlist" | "trips">("search");
  const [highlightSiteId, setHighlightSiteId] = useState<string | null>(null);
  const [expandedWishlistId, setExpandedWishlistId] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<{ site_id: string; sites: { title: string; slug: string; cover_photo_url: string | null } | null }[]>([]);
  const [wishlistItemsLoading, setWishlistItemsLoading] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [tripItems, setTripItems] = useState<{ site_id: string; site?: { id: string; title: string; slug: string; cover_photo_url: string | null } | null }[]>([]);
  const [tripItemsLoading, setTripItemsLoading] = useState(false);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const debouncedName = useDebounce(filters.name, 350);

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

  useEffect(() => {
    if (!expandedTripId || !isSignedIn) {
      setTripItems([]);
      return;
    }
    let cancelled = false;
    setTripItemsLoading(true);
    getTripWithItems(expandedTripId)
      .then(({ items }) => {
        if (!cancelled) setTripItems((items ?? []) as { site_id: string; site?: { id: string; title: string; slug: string; cover_photo_url: string | null } | null }[]);
      })
      .catch(() => { if (!cancelled) setTripItems([]); })
      .finally(() => { if (!cancelled) setTripItemsLoading(false); });
    return () => { cancelled = true; };
  }, [expandedTripId, isSignedIn]);

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

    return res;
  }, [
    loading,
    allLocations,
    debouncedName,
    filters.categoryIds,
    filters.regionIds,
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

  const applyWishlistFilter = useCallback(async (wishlistId: string) => {
    const { data } = await supabase
      .from("wishlist_items")
      .select("site_id")
      .eq("wishlist_id", wishlistId);
    const ids = (data ?? []).map((r: { site_id: string }) => r.site_id);
    setWishlistSiteIds(ids);
    setSidebarFilter({ wishlistId });
  }, []);

  const applyTripFilter = useCallback(async (tripId: string) => {
    try {
      const { items } = await getTripWithItems(tripId);
      const ids = (items ?? []).map((it: { site_id: string }) => it.site_id);
      setTripSiteIds(ids);
      setSidebarFilter({ tripId });
    } catch {
      setTripSiteIds([]);
    }
  }, []);

  const clearSidebarFilter = useCallback(() => {
    setSidebarFilter(null);
    setWishlistSiteIds([]);
    setTripSiteIds([]);
  }, []);

  const signInRedirectUrl = "/auth/sign-in?redirectTo=" + encodeURIComponent("/map");

  const renderToolPanel = useCallback(
    (toolId: string, onClose: () => void) => {
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
                    <a
                      href={`/heritage/${(s as any).province_slug ?? "pakistan"}/${s.slug}`}
                      className="text-xs text-gray-500 hover:text-[var(--brand-orange)] shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </a>
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
        return (
          <div className="p-4 space-y-3 flex flex-col min-h-0">
            {expandedWishlistId ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpandedWishlistId(null)}
                  className="flex items-center gap-2 text-sm text-[var(--brand-blue)] font-medium self-start"
                >
                  <Icon name="arrow-left" size={14} />
                  Back to wishlists
                </button>
                {typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter && sidebarFilter.wishlistId === expandedWishlistId && (
                  <button
                    type="button"
                    onClick={() => { clearSidebarFilter(); onClose(); }}
                    className="text-sm text-[var(--brand-orange)] font-medium"
                  >
                    Clear · Show all on map
                  </button>
                )}
                <h3 className="font-semibold text-[var(--brand-blue)] truncate">{expandedWishlist?.name ?? "Wishlist"}</h3>
                {wishlistItemsLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : wishlistItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No sites in this wishlist.</p>
                ) : (
                  <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 flex-1 min-h-0">
                    {wishlistItems.map((item) => {
                      const site = item.sites;
                      const title = site?.title ?? "Site";
                      const cover = site?.cover_photo_url ?? null;
                      return (
                        <li key={item.site_id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow">
                          <button
                            type="button"
                            onClick={() => { setHighlightSiteId(item.site_id); onClose(); }}
                            className="flex flex-1 min-w-0 items-center gap-3 text-left"
                          >
                            <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                              {cover ? (
                                <img src={cover} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                  <Icon name="map-pin" size={18} />
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { applyWishlistFilter(expandedWishlistId); onClose(); }}
                            className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand-orange)] px-2 py-1.5 text-white text-xs font-medium"
                          >
                            <Icon name="map-pin" size={12} />
                            Show on map
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <>
                {typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter && (
                  <button
                    type="button"
                    onClick={() => { clearSidebarFilter(); onClose(); }}
                    className="text-sm text-[var(--brand-orange)] font-medium"
                  >
                    Clear · Show all on map
                  </button>
                )}
                {wishlistsLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : wishlists.length === 0 ? (
                  <p className="text-sm text-gray-500">No wishlists yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {wishlists.map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-[var(--brand-orange)]/40">
                        <button
                          type="button"
                          onClick={() => setExpandedWishlistId(w.id)}
                          className="flex flex-1 min-w-0 items-center justify-between gap-2 text-left"
                        >
                          <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{w.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {(w.wishlist_items?.[0] as { count?: number })?.count ?? 0} sites
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { applyWishlistFilter(w.id); onClose(); }}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand-orange)] py-1.5 px-2 text-white text-xs font-medium"
                        >
                          <Icon name="map-pin" size={12} />
                          Show on map
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
        const expandedTrip = expandedTripId ? trips.find((t) => t.id === expandedTripId) : null;
        return (
          <div className="p-4 space-y-3 flex flex-col min-h-0">
            {expandedTripId ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpandedTripId(null)}
                  className="flex items-center gap-2 text-sm text-[var(--brand-blue)] font-medium self-start"
                >
                  <Icon name="arrow-left" size={14} />
                  Back to trips
                </button>
                {typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter && sidebarFilter.tripId === expandedTripId && (
                  <button
                    type="button"
                    onClick={() => { clearSidebarFilter(); onClose(); }}
                    className="text-sm text-[var(--brand-orange)] font-medium"
                  >
                    Clear · Show all on map
                  </button>
                )}
                <h3 className="font-semibold text-[var(--brand-blue)] truncate">{expandedTrip?.name ?? "Trip"}</h3>
                {tripItemsLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : tripItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No sites in this trip.</p>
                ) : (
                  <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 flex-1 min-h-0">
                    {tripItems.map((item) => {
                      const site = item.site;
                      const title = site?.title ?? "Site";
                      const cover = site?.cover_photo_url ?? null;
                      return (
                        <li key={item.site_id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm hover:border-[var(--brand-orange)]/40 hover:shadow">
                          <button
                            type="button"
                            onClick={() => { setHighlightSiteId(item.site_id); onClose(); }}
                            className="flex flex-1 min-w-0 items-center gap-3 text-left"
                          >
                            <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
                              {cover ? (
                                <img src={cover} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[var(--brand-orange)]">
                                  <Icon name="map-pin" size={18} />
                                </span>
                              )}
                            </span>
                            <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => { applyTripFilter(expandedTripId); onClose(); }}
                            className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand-orange)] px-2 py-1.5 text-white text-xs font-medium"
                          >
                            <Icon name="map-pin" size={12} />
                            Show on map
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <>
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
                    {trips.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-[var(--brand-orange)]/40">
                        <button
                          type="button"
                          onClick={() => setExpandedTripId(t.id)}
                          className="flex flex-1 min-w-0 text-left"
                        >
                          <span className="text-sm font-medium text-[var(--brand-blue)] truncate">{t.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { applyTripFilter(t.id); onClose(); }}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand-orange)] py-1.5 px-2 text-white text-xs font-medium"
                        >
                          <Icon name="map-pin" size={12} />
                          Show on map
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      }
      return null;
    },
    [
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
      expandedTripId,
      tripItems,
      tripItemsLoading,
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
            <p className="ml-4 text-lg text-gray-600">Initializing Map...</p>
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
    />
  ) : mobilePanelTab === "bookmarks" ? (
    renderToolPanel("bookmarks", closeSearchPanel)
  ) : mobilePanelTab === "wishlist" ? (
    renderToolPanel("wishlist", closeSearchPanel)
  ) : (
    renderToolPanel("trips", closeSearchPanel)
  );

  return (
    <div className="w-full h-[calc(100dvh-var(--sticky-offset,56px))] lg:h-[calc(100vh-88px)] relative">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } } .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }`}</style>

      {/* Map: full size, fixed; sidebar overlays on top */}
      <div className="absolute inset-0 pt-14 lg:pt-0">
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
          highlightSiteId={highlightSiteId}
          onHighlightConsumed={() => setHighlightSiteId(null)}
        />
        {(() => {
          const label =
            sidebarFilter === "bookmarks"
              ? "Bookmarks"
              : typeof sidebarFilter === "object" && sidebarFilter !== null && "wishlistId" in sidebarFilter
                ? wishlists.find((w) => w.id === sidebarFilter.wishlistId)?.name ?? "Wishlist"
                : typeof sidebarFilter === "object" && sidebarFilter !== null && "tripId" in sidebarFilter
                  ? trips.find((t) => t.id === sidebarFilter.tripId)?.name ?? "Trip"
                  : null;
          if (!label) return null;
          return (
            <div
              className="absolute right-2 top-2 z-[1000] rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg ring-1 ring-gray-200 px-3 py-2"
              aria-label="Active filter"
            >
              <span className="text-[11px] uppercase tracking-wider text-gray-500">Viewing</span>
              <div className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">{label}</div>
            </div>
          );
        })()}
      </div>

      {/* Desktop: sidebar overlays the map (does not push it) */}
      <aside className="hidden lg:block absolute left-0 top-0 bottom-0 z-[1000]">
        <CollapsibleSidebar
          tools={tools}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={() => {}}
          renderToolPanel={renderToolPanel}
        />
      </aside>

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
                    onClick={closeSearchPanel}
                    aria-label="Close"
                    className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 shrink-0"
                  >
                    <Icon name="times" size={18} className="text-gray-600" />
                  </button>
                  <span className="text-base font-bold text-gray-800">
                    {mobilePanelTab === "search"
                      ? "Search & Filters"
                      : mobilePanelTab === "bookmarks"
                        ? "Bookmarks"
                        : mobilePanelTab === "wishlist"
                          ? "Wishlist"
                          : "My Trips"}
                  </span>
                </div>
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
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto touch-auto overscroll-contain p-4">
                <div className="min-h-full rounded-xl bg-white shadow-md border border-gray-200 overflow-hidden">
                  {mobilePanelContent}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
