// src/app/explore/page.tsx
"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchFilters, { Filters } from "@/components/SearchFilters";
import { supabase } from "@/lib/supabaseClient";
import SitePreviewCard from "@/components/SitePreviewCard";
import Icon from "@/components/Icon";

const PAGE_SIZE = 12;

type Site = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
};

function parseMulti(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PreviewCardSkeleton = () => (
  <div className="block rounded-xl overflow-hidden bg-white shadow-sm animate-pulse">
    <div className="relative">
      <div className="w-full h-48 sm:h-52 bg-gray-200"></div>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="h-6 bg-gray-300/50 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300/50 rounded w-1/2"></div>
      </div>
    </div>
    <div className="flex items-center justify-between px-4 py-3">
      <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
        <div className="w-8 h-8 rounded-full bg-gray-200"></div>
      </div>
    </div>
  </div>
);

function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
  });

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ sites: Site[]; total: number }>({
    sites: [],
    total: 0,
  });
  const [viewTotals, setViewTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      ...newFilters,
    }));
  };

  const executeSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.name) params.set("q", filters.name);
    if (filters.categoryIds.length > 0)
      params.set("cats", filters.categoryIds.join(","));
    if (filters.regionIds.length > 0)
      params.set("regs", filters.regionIds.join(","));
    if (filters.orderBy !== "latest") params.set("order", filters.orderBy);
    router.push(`/explore?${params.toString()}`);
  }, [filters, router]);

  useEffect(() => {
    if (isInitialMount.current) return;
    executeSearch();
  }, [filters.categoryIds, filters.regionIds, filters.orderBy, executeSearch]);

  useEffect(() => {
    setLoading(true);
    const currentPage = Number(searchParams.get("page") || 1);
    const nameQuery = searchParams.get("q") || "";
    const catsQuery = parseMulti(searchParams.get("cats"));
    const regsQuery = parseMulti(searchParams.get("regs"));
    const orderQuery = searchParams.get("order") || "latest";

    setFilters({
      name: nameQuery,
      categoryIds: catsQuery,
      regionIds: regsQuery,
      orderBy: orderQuery,
    });
    setPage(currentPage);

    (async () => {
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc("search_sites", {
          p_name_query: nameQuery.trim() || null,
          p_category_ids: catsQuery.length > 0 ? catsQuery : null,
          p_region_ids: regsQuery.length > 0 ? regsQuery : null,
          p_order_by: orderQuery,
          p_page: currentPage,
          p_page_size: PAGE_SIZE,
        });
        if (rpcError) throw rpcError;
        const sites = (data as Site[]) || [];
        setResults({ sites, total: data?.[0]?.total_count || 0 });

        const ids = sites.map((r) => r.id);
        if (ids.length) {
          const { data: vt } = await supabase
            .from("site_view_totals")
            .select("site_id,total")
            .in("site_id", ids);
          setViewTotals(
            (vt || []).reduce(
              (acc, r) => ({ ...acc, [r.site_id]: r.total }),
              {}
            )
          );
        } else {
          setViewTotals({});
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load results");
      } finally {
        setLoading(false);
        isInitialMount.current = false;
      }
    })();
  }, [searchParams]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(results.total / PAGE_SIZE)),
    [results.total]
  );

  const navigatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/explore?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      <div className="lg:flex">
        <aside className="hidden lg:block w-[360px] fixed left-4 top-[88px] bottom-4 z-20">
          <div className="h-full rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <SearchFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onSearch={executeSearch}
            />
          </div>
        </aside>
        <main className="lg:ml-[380px] p-4 w-full">
          <div className="px-3 sm:px-4 pt-6">
            <div className="mb-3 text-sm text-gray-600 font-explore-results-count">
              Showing <strong>{loading ? 0 : results.sites.length}</strong> of{" "}
              <strong>{loading ? 0 : results.total}</strong> results
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <PreviewCardSkeleton key={i} />
              ))
            ) : error ? (
              <div className="p-6 text-red-600 sm:col-span-3">{error}</div>
            ) : results.sites.length === 0 ? (
              <div className="p-6 text-gray-700 sm:col-span-3">
                No sites match your filters.
              </div>
            ) : (
              results.sites.map((s) => (
                // UPDATED: Passing the viewCount prop to the card
                <SitePreviewCard
                  key={s.id}
                  site={s}
                  viewCount={viewTotals[s.id]}
                />
              ))
            )}
          </div>
          {results.total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                className="px-3 py-1 rounded border bg-white hover:bg-gray-50 shadow-sm disabled:opacity-50"
                onClick={() => navigatePage(page - 1)}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="text-sm font-explore-pagination">
                Page {page} of {totalPages}
              </span>
              <button
                className="px-3 py-1 rounded border bg-white hover:bg-gray-50 shadow-sm disabled:opacity-50"
                onClick={() => navigatePage(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f4f4]" />}>
      <ExplorePageContent />
    </Suspense>
  );
}
