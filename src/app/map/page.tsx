// src/app/map/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/Icon";
import CollapsibleSidebar, { Tool } from "@/components/CollapsibleSidebar";
import { Filters } from "@/components/SearchFilters";
import { supabase } from "@/lib/supabaseClient";
import { Site } from "@/components/ClientOnlyMap";

// Custom hook to delay search requests while typing
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

// The updated list of tools for the sidebar
const mapTools: Tool[] = [
  { id: "search", name: "Search", icon: "search" },
  { id: "bookmarks", name: "Bookmarks", icon: "heart" },
  { id: "wishlist", name: "Wishlist", icon: "list-ul" },
  { id: "trips", name: "My Trips", icon: "route" },
];

export default function MapPage() {
  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
  });
  const [allLocations, setAllLocations] = useState<Site[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<Site[]>([]);
  const [mapSettings, setMapSettings] = useState(null);
  const [allIcons, setAllIcons] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      ...newFilters,
    }));
  };

  const debouncedName = useDebounce(filters.name, 500);

  useEffect(() => {
    const fetchInitialData = async () => {
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
            `*, site_categories!inner(category_id, categories(icon_key)), site_regions!inner(region_id)`
          )
          .not("latitude", "is", null)
          .not("longitude", "is", null),
      ]);

      if (settingsRes.data) setMapSettings(settingsRes.data.value as any);

      if (iconsRes.data) {
        const iconMap = new Map<string, string>();
        (iconsRes.data as any[]).forEach((icon) =>
          iconMap.set(icon.name, icon.svg_content)
        );
        setAllIcons(iconMap);
      }

      if (locationsRes.data) {
        const validLocations = (locationsRes.data as any[])
          .map((site) => ({
            ...site,
            latitude: parseFloat(site.latitude),
            longitude: parseFloat(site.longitude),
          }))
          .filter((site) => !isNaN(site.latitude) && !isNaN(site.longitude));
        setAllLocations(validLocations);
        setFilteredLocations(validLocations);
      }
      setLoading(false);
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (loading) return;

    let results = [...allLocations];

    if (filters.name.trim()) {
      results = results.filter((site) =>
        site.title.toLowerCase().includes(filters.name.trim().toLowerCase())
      );
    }
    if (filters.categoryIds.length > 0) {
      results = results.filter((site) =>
        (site as any).site_categories.some((sc: any) =>
          filters.categoryIds.includes(sc.category_id)
        )
      );
    }
    if (filters.regionIds.length > 0) {
      results = results.filter((site) =>
        (site as any).site_regions.some((sr: any) =>
          filters.regionIds.includes(sr.region_id)
        )
      );
    }

    setFilteredLocations(results);
  }, [filters, allLocations, loading]);

  const ClientOnlyMap = dynamic(() => import("@/components/ClientOnlyMap"), {
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
  });

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
        <ClientOnlyMap
          locations={filteredLocations}
          settings={mapSettings}
          icons={allIcons}
        />
      </div>
    </div>
  );
}
