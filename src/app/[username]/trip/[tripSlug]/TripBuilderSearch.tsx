// src/components/TripBuilderSearch.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";
import SearchFilters, { Filters } from "@/components/SearchFilters";

interface TripBuilderSearchProps {
  tripId: string;
  existingSiteIds: string[]; // sites already in the trip
  onAdd: (site: Site) => Promise<void> | void; // parent will persist
  onClose: () => void;
  tripName?: string;
  onToast?: (msg: string) => void; // optional global toast hook
}

type Site = {
  id: string;
  title: string;
  slug: string;
  cover_photo_url: string | null;
  province_id: number | null;
  region_names?: string[]; // derived from site_regions->regions
  created_at?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

export default function TripBuilderSearch({
  tripId,
  existingSiteIds,
  onAdd,
  onClose,
  tripName,
  onToast,
}: TripBuilderSearchProps) {
  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
  });

  const [results, setResults] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null); // prevent duplicate clicks

  // Fallback local toast if parent doesn't provide one
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    if (onToast) {
      onToast(msg);
      return;
    }
    setLocalToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setLocalToast(null), 2000);
  };

  useEffect(() => {
    setAddedIds(new Set(existingSiteIds || []));
  }, [existingSiteIds]);

  // Load ALL sites on mount by default
  useEffect(() => {
    void fetchSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-apply filters
  // - Debounced search when name changes
  // - Immediate search when categoryIds/regionIds/orderBy change
  const nameDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (nameDebounceRef.current) window.clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = window.setTimeout(() => {
      void fetchSites();
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.name]);

  useEffect(() => {
    void fetchSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.categoryIds, filters.regionIds, filters.orderBy]);

  const buildSelect = (opts: {
    needCatInner: boolean;
    needRegInner: boolean;
  }) => {
    const { needCatInner, needRegInner } = opts;
    // Relations: make the ones we are filtering on INNER to enforce the filter.
    const sr = needRegInner
      ? "site_regions!inner(regions(id,name),region_id)"
      : "site_regions(regions(id,name))";
    const sc = needCatInner
      ? "site_categories!inner(categories(id,name),category_id)"
      : "site_categories(categories(id,name))";

    return [
      "id",
      "title",
      "slug",
      "cover_photo_url",
      "province_id",
      "created_at",
      "avg_rating",
      "review_count",
      sr,
      sc,
    ].join(",");
  };

  const fetchSites = async () => {
    setLoading(true);
    setErrMsg(null);

    try {
      const hasCatFilter = filters.categoryIds.length > 0;
      const hasRegFilter = filters.regionIds.length > 0;

      let q = supabase
        .from("sites")
        .select(
          buildSelect({
            needCatInner: hasCatFilter,
            needRegInner: hasRegFilter,
          })
        )
        .limit(100);

      // Name search (title OR slug)
      const term = (filters.name || "").trim();
      if (term) {
        // PostgREST .or() expects column filters separated by commas
        q = q.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
      }

      // Category filter via M2M (inner join applied above when active)
      if (hasCatFilter) {
        q = q.in("site_categories.category_id", filters.categoryIds as any[]);
      }

      // Region filter via M2M (inner join applied above when active)
      if (hasRegFilter) {
        q = q.in("site_regions.region_id", filters.regionIds as any[]);
      }

      // Ordering (existing columns on sites)
      if (filters.orderBy === "az") {
        q = q.order("title", { ascending: true });
      } else if (filters.orderBy === "latest") {
        q = q.order("created_at", { ascending: false, nullsFirst: false });
      } else if (filters.orderBy === "top") {
        q = q
          .order("avg_rating", { ascending: false, nullsFirst: false })
          .order("review_count", { ascending: false, nullsFirst: false });
      }

      const { data, error } = await q;
      if (error) throw error;

      const mapped: Site[] =
        (data || []).map((d: any) => {
          const regionNames: string[] =
            (d.site_regions || [])
              .map((sr: any) => sr?.regions?.name)
              .filter(Boolean) ?? [];
          return {
            id: d.id,
            title: d.title,
            slug: d.slug,
            cover_photo_url: d.cover_photo_url,
            province_id: d.province_id,
            region_names: regionNames,
            created_at: d.created_at ?? null,
            avg_rating: d.avg_rating ?? null,
            review_count: d.review_count ?? null,
          };
        }) ?? [];

      setResults(mapped);
    } catch (err: any) {
      console.error("Search error:", err);
      setErrMsg(err?.message || "Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Still expose explicit Search button from SearchFilters
  const handleSearch = () => {
    void fetchSites();
  };

  const handleAdd = async (site: Site) => {
    // Prevent duplicates (client-side guard)
    if (addedIds.has(site.id) || addingId === site.id) return;

    try {
      setAddingId(site.id);

      // Parent persists the row (server may have a unique constraint on (trip_id, site_id))
      await Promise.resolve(onAdd(site));

      // Mark as added locally (defensive in case parent doesn't immediately refresh)
      setAddedIds((prev) => new Set(prev).add(site.id));

      // Toast only; DO NOT close the popup so the user can keep adding
      showToast(`Added to ${tripName ? tripName : "trip"}`);
    } catch (e: any) {
      // Handle duplicate unique constraint gracefully (keep modal open)
      const msg: string =
        e?.message ||
        e?.details ||
        e?.hint ||
        "Could not add this site to the trip.";
      if (
        msg.toLowerCase().includes("duplicate key value") ||
        msg.includes("unique")
      ) {
        showToast("This site is already in the trip.");
        setAddedIds((prev) => new Set(prev).add(site.id)); // reflect true state
        return;
      }
      setErrMsg(msg);
    } finally {
      setAddingId(null);
    }
  };

  const isDisabled = useMemo(
    () => (id: string) => addedIds.has(id) || addingId === id,
    [addedIds, addingId]
  );

  /** Build a sharp src/srcset for card images to avoid aliasing on HiDPI.
   *  - We render the image at ~600px wide; also provide a 2x (1200px) candidate.
   */
  const buildImageProps = (baseUrl: string) => {
    const w1 = 600;
    const w2 = 1200;
    const src = `${baseUrl}?width=${w1}`;
    const srcSet = `${baseUrl}?width=${w1} ${w1}w, ${baseUrl}?width=${w2} ${w2}w`;
    // Card occupies ~50vw on small screens and ~33vw on lg; cap to 640px.
    const sizes = "(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw";
    return { src, srcSet, sizes };
  };

  return (
    <div className="relative bg-white w-full h-[80vh] rounded-2xl shadow-lg flex overflow-hidden">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-gray-200 hover:bg-gray-300 text-gray-700 w-8 h-8 rounded-full flex items-center justify-center"
        aria-label="Close"
      >
        <Icon name="times" size={16} />
      </button>

      {/* Local toast (if no global toast provided) */}
      {localToast && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 z-[60] rounded-md bg-black/85 text-white px-3 py-2 text-sm shadow-md">
          {localToast}
        </div>
      )}

      {/* LEFT: universal filters */}
      <div className="w-1/3 border-r border-gray-200 p-4 flex flex-col">
        <SearchFilters
          filters={filters}
          onFilterChange={(patch) =>
            setFilters((prev) => ({ ...prev, ...patch }))
          }
          onSearch={handleSearch}
        />
      </div>

      {/* RIGHT: results */}
      <div className="w-2/3 p-6 overflow-y-auto bg-gray-50">
        {errMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-lg">
            No results found.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
            {results.map((site) => {
              const disabled = isDisabled(site.id);
              const regionLabel =
                site.region_names && site.region_names.length
                  ? site.region_names.join(", ")
                  : null;

              return (
                <div
                  key={site.id}
                  className="relative bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden border border-gray-200"
                >
                  {site.cover_photo_url ? (
                    // HIGHER-QUALITY PREVIEW (sharp on retina)
                    <img
                      {...buildImageProps(site.cover_photo_url)}
                      alt={site.title}
                      width={600}
                      height={160}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-40 object-cover select-none"
                      style={{
                        imageRendering: "auto",
                        transform: "translateZ(0)", // hint GPU for smoother scaling
                      }}
                    />
                  ) : (
                    <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-gray-500">
                      No image
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-1">
                      {site.title}
                    </h3>
                    {regionLabel && (
                      <p className="text-sm text-gray-500">{regionLabel}</p>
                    )}
                  </div>
                  <button
                    onClick={() => !disabled && handleAdd(site)}
                    disabled={disabled}
                    className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
                      disabled
                        ? "bg-green-600/70 text-white cursor-not-allowed"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                    title={
                      addedIds.has(site.id)
                        ? "Already added"
                        : disabled
                        ? "Adding…"
                        : "Add to trip"
                    }
                  >
                    <Icon
                      name={addedIds.has(site.id) ? "check" : "plus"}
                      size={18}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
