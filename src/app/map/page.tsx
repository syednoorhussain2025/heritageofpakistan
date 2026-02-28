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
import { getWishlists } from "@/lib/wishlists";
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

const searchToolOnly: Tool[] = [mapTools[0]];

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

  const renderToolPanel = useCallback(
    (toolId: string, onClose: () => void) => {
      if (toolId === "bookmarks") {
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
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {bookmarkedSites.map((s) => (
                  <li key={s.id}>
                    <Link href={`/heritage/${(s as any).province_slug ?? "pakistan"}/${s.slug}`} className="text-sm text-[var(--brand-blue)] hover:underline truncate block">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {bookmarkedSites.length > 0 && (
              <button
                type="button"
                onClick={() => { setSidebarFilter("bookmarks"); onClose(); }}
                className="w-full py-2 rounded-xl bg-[var(--brand-orange)] text-white text-sm font-semibold"
              >
                Show on map
              </button>
            )}
          </div>
        );
      }
      if (toolId === "wishlist") {
        return (
          <div className="p-4 space-y-3">
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
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                {wishlists.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{w.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {(w.wishlist_items?.[0] as { count?: number })?.count ?? 0} sites
                    </span>
                    <button
                      type="button"
                      onClick={() => { applyWishlistFilter(w.id); onClose(); }}
                      className="py-1 px-2 rounded-lg bg-[var(--brand-orange)] text-white text-xs font-medium"
                    >
                      Show on map
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }
      if (toolId === "trips") {
        return (
          <div className="p-4 space-y-3">
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
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                {trips.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{t.name}</span>
                    <button
                      type="button"
                      onClick={() => { applyTripFilter(t.id); onClose(); }}
                      className="py-1 px-2 rounded-lg bg-[var(--brand-orange)] text-white text-xs font-medium"
                    >
                      Show on map
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }
      return null;
    },
    [
      allLocations,
      bookmarkedIds,
      bookmarksLoaded,
      sidebarFilter,
      clearSidebarFilter,
      wishlists,
      wishlistsLoading,
      trips,
      tripsLoading,
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

  const tools: Tool[] = isSignedIn ? mapTools : searchToolOnly;

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
    <div className="w-full h-[calc(100dvh-var(--sticky-offset,56px))] lg:h-[calc(100vh-88px)] flex relative">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } } .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }`}</style>

      <aside className="hidden lg:flex flex-shrink-0 h-full">
        <CollapsibleSidebar
          tools={tools}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSearch={() => {}}
          renderToolPanel={renderToolPanel}
        />
      </aside>

      <div className="flex-grow h-full relative pt-14 lg:pt-0">
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
                {isSignedIn && (
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
                              : "text-gray-500"
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
                {mobilePanelContent}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
