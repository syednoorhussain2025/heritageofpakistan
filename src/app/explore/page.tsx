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
import SearchFilters, {
  Filters,
  fetchSitesByFilters,
  hasRadius,
} from "@/components/SearchFilters";
import { supabase } from "@/lib/supabaseClient";
import SitePreviewCard from "@/components/SitePreviewCard";

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
  distance_km?: number | null;
  // may or may not exist in your schema; used when present
  category_id?: string | null;
};

type NamedRow = { id: string; name: string };

function parseMulti(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ───────────────────────────── UI Skeleton ───────────────────────────── */
const PreviewCardSkeleton = () => (
  <div className="block rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-[var(--taupe-grey)]/60 animate-pulse">
    <div className="relative">
      <div className="w-full h-48 sm:h-52 bg-[var(--ivory-cream)]" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="h-6 bg-[var(--taupe-grey)]/40 rounded w-3/4 mb-2" />
        <div className="h-4 bg-[var(--taupe-grey)]/30 rounded w-1/2" />
      </div>
    </div>
    <div className="flex items-center justify-between px-4 py-3">
      <div className="h-4 bg-[var(--taupe-grey)]/40 rounded w-1/3" />
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
        <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
        <div className="w-8 h-8 rounded-full bg-[var(--ivory-cream)]" />
      </div>
    </div>
  </div>
);

/* ───────────────────────────── Helpers ───────────────────────────── */
function humanJoin(list: string[]) {
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

function titleForRegions(regions: string[]) {
  if (!regions.length) return "Pakistan";
  return humanJoin(regions);
}

/** Headline builder — includes categories when radius mode is active. */
function buildHeadline({
  query,
  categoryNames,
  regionNames,
  radiusActive,
  centerSiteTitle,
  radiusKm,
}: {
  query: string;
  categoryNames: string[];
  regionNames: string[];
  radiusActive: boolean;
  centerSiteTitle?: string | null;
  radiusKm?: number | null;
}) {
  const q = (query || "").trim();

  if (radiusActive) {
    const siteLabel = centerSiteTitle || "Selected Site";
    const kmLabel = typeof radiusKm === "number" ? `${radiusKm}km` : "Radius";
    const cats = categoryNames.length ? humanJoin(categoryNames) : "Sites";
    return `${cats} around ${siteLabel} within ${kmLabel}${
      q ? ` matching “${q}”` : ""
    }`;
  }

  const hasCats = categoryNames.length > 0;
  const hasRegs = regionNames.length > 0;

  if (q && !hasCats && !hasRegs) return `Search for “${q}”`;
  if (hasCats && !hasRegs) {
    const cats = humanJoin(categoryNames);
    return q ? `${cats} in Pakistan matching “${q}”` : `${cats} in Pakistan`;
  }
  if (!hasCats && hasRegs) {
    const regionTitle = titleForRegions(regionNames);
    return q
      ? `Sites in ${regionTitle} matching “${q}”`
      : `Sites in ${regionTitle}`;
  }
  if (hasCats && hasRegs) {
    const cats = humanJoin(categoryNames);
    const regionTitle = titleForRegions(regionNames);
    return q
      ? `${cats} in ${regionTitle} matching “${q}”`
      : `${cats} in ${regionTitle}`;
  }
  return "All Heritage Sites in Pakistan";
}

/** Build a square-ish thumbnail URL for Supabase images (public/sign). */
function thumbUrl(input?: string | null, size = 160) {
  if (!input) return "";
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  let absolute = input;
  if (!/^https?:\/\//i.test(input)) {
    if (!SUPA_URL) return "";
    absolute = `${SUPA_URL}/storage/v1/object/public/${input.replace(
      /^\/+/,
      ""
    )}`;
  }
  const isSameProject = SUPA_URL && absolute.startsWith(SUPA_URL);
  if (!isSameProject) return absolute;

  const PUBLIC_MARK = "/storage/v1/object/public/";
  const SIGN_MARK = "/storage/v1/object/sign/";
  let renderBase = "";
  let tail = "";

  if (absolute.includes(PUBLIC_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/public/`;
    tail = absolute.split(PUBLIC_MARK)[1];
  } else if (absolute.includes(SIGN_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/sign/`;
    tail = absolute.split(SIGN_MARK)[1];
  } else {
    return absolute;
  }

  const u = new URL(renderBase + tail);
  u.searchParams.set("width", String(size));
  u.searchParams.set("height", String(size));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("quality", "80");
  return u.toString();
}

function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  const [filters, setFilters] = useState<Filters>({
    name: "",
    categoryIds: [],
    regionIds: [],
    orderBy: "latest",
    centerSiteId: null,
    centerLat: null,
    centerLng: null,
    radiusKm: null,
  });

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ sites: Site[]; total: number }>({
    sites: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [regionMap, setRegionMap] = useState<Record<string, string>>({});

  // For headline
  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);
  // For the banner
  const [centerSitePreview, setCenterSitePreview] = useState<{
    id: string;
    title: string;
    subtitle?: string | null;
    cover?: string | null;
  } | null>(null);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  /* Load name maps once */
  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: regs }] = await Promise.all([
        supabase.from("categories").select("id,name").order("name"),
        supabase.from("regions").select("id,name").order("name"),
      ]);
      setCategoryMap(
        (cats || []).reduce(
          (acc: Record<string, string>, r: NamedRow) => (
            (acc[r.id] = r.name), acc
          ),
          {}
        )
      );
      setRegionMap(
        (regs || []).reduce(
          (acc: Record<string, string>, r: NamedRow) => (
            (acc[r.id] = r.name), acc
          ),
          {}
        )
      );
    })();
  }, []);

  /* Stable URL key for router sync (FIXES deps-size error) */
  const urlKey = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.name) params.set("q", filters.name);
    if (filters.categoryIds.length > 0)
      params.set("cats", filters.categoryIds.join(","));
    if (filters.regionIds.length > 0)
      params.set("regs", filters.regionIds.join(","));
    if (hasRadius(filters)) {
      if (filters.centerSiteId) params.set("center", filters.centerSiteId);
      if (typeof filters.centerLat === "number")
        params.set("clat", String(filters.centerLat));
      if (typeof filters.centerLng === "number")
        params.set("clng", String(filters.centerLng));
      if (typeof filters.radiusKm === "number")
        params.set("rkm", String(filters.radiusKm));
    }
    params.set("page", String(page || 1));
    return params.toString();
  }, [
    filters.name,
    filters.categoryIds.join(","), // stable
    filters.regionIds.join(","), // stable
    filters.centerSiteId,
    filters.centerLat,
    filters.centerLng,
    filters.radiusKm,
    page,
  ]);

  /* Execute search button → push urlKey */
  const executeSearch = useCallback(() => {
    router.push(`/explore?${urlKey}`);
  }, [router, urlKey]);

  /* Push URL whenever filters change (skip first mount & avoid infinite loop) */
  useEffect(() => {
    if (isInitialMount.current) return;
    const current = searchParams.toString();
    if (current !== urlKey) {
      router.push(`/explore?${urlKey}`);
    }
  }, [urlKey, router, searchParams]);

  /* Read URL → fetch data + banner info */
  useEffect(() => {
    setLoading(true);

    const currentPage = Number(searchParams.get("page") || 1);
    const nameQuery = searchParams.get("q") || "";
    const catsQuery = parseMulti(searchParams.get("cats"));
    const regsQuery = parseMulti(searchParams.get("regs"));

    const centerSiteId = searchParams.get("center");
    const clat = searchParams.get("clat");
    const clng = searchParams.get("clng");
    const rkm = searchParams.get("rkm");

    const parsedCenterLat = clat != null ? Number(clat) : null;
    const parsedCenterLng = clng != null ? Number(clng) : null;
    const parsedRadiusKm = rkm != null ? Number(rkm) : null;

    const nextFilters: Filters = {
      name: nameQuery,
      categoryIds: catsQuery,
      regionIds: regsQuery,
      orderBy: "latest",
      centerSiteId: centerSiteId || null,
      centerLat:
        typeof parsedCenterLat === "number" && !Number.isNaN(parsedCenterLat)
          ? parsedCenterLat
          : null,
      centerLng:
        typeof parsedCenterLng === "number" && !Number.isNaN(parsedCenterLng)
          ? parsedCenterLng
          : null,
      radiusKm:
        typeof parsedRadiusKm === "number" && !Number.isNaN(parsedRadiusKm)
          ? parsedRadiusKm
          : null,
    };

    setFilters(nextFilters);
    setPage(currentPage);

    (async () => {
      setError(null);
      try {
        // For headline and banner
        if (hasRadius(nextFilters) && nextFilters.centerSiteId) {
          const { data: row, error: err } = await supabase
            .from("sites")
            .select("id,title,cover_photo_url,location_free")
            .eq("id", nextFilters.centerSiteId)
            .maybeSingle();

          if (!err && row) {
            setCenterSiteTitle(row.title ?? null);
            setCenterSitePreview({
              id: row.id,
              title: row.title,
              subtitle: row.location_free ?? null,
              cover: row.cover_photo_url ?? null,
            });
          } else {
            setCenterSiteTitle(null);
            setCenterSitePreview(null);
          }
        } else {
          setCenterSiteTitle(null);
          setCenterSitePreview(null);
        }

        /* ───── Radius mode ───── */
        if (hasRadius(nextFilters)) {
          // 1) Get ALL nearby site ids with distances
          const radiusRows = await fetchSitesByFilters(nextFilters);
          // Optional: order by distance ascending
          let distanceOrdered = [...radiusRows].sort(
            (a: any, b: any) =>
              (a.distance_km ?? Number.POSITIVE_INFINITY) -
              (b.distance_km ?? Number.POSITIVE_INFINITY)
          );

          const allIds = distanceOrdered.map((r: any) => r.id);

          // 2) If category "type" filters are active, filter via the join table public.site_categories
          if (allIds.length && nextFilters.categoryIds?.length) {
            const { data: pairs, error: joinErr } = await supabase
              .from("site_categories")
              .select("site_id,category_id")
              .in("site_id", allIds)
              .in("category_id", nextFilters.categoryIds as string[]);
            if (joinErr) throw joinErr;
            const allowed = new Set((pairs || []).map((p: any) => p.site_id));
            distanceOrdered = distanceOrdered.filter((r: any) =>
              allowed.has(r.id)
            );
          }

          // 3) Now paginate AFTER any filtering
          const total = distanceOrdered.length;
          const start = (currentPage - 1) * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          const pageRows = distanceOrdered.slice(start, end);

          const ids = pageRows.map((r: any) => r.id);
          if (!ids.length) {
            setResults({ sites: [], total });
            return;
          }

          // 4) Fetch display fields and merge the distance back
          //    (keep fallback that retries without category_id if schema lacks it)
          let details: any[] = [];
          let detailsErr: any = null;
          {
            const { data, error } = await supabase
              .from("sites")
              .select(
                "id,slug,title,cover_photo_url,location_free,heritage_type,avg_rating,review_count,category_id"
              )
              .in("id", ids);
            details = (data || []) as any[];
            detailsErr = error;
          }
          if (detailsErr) {
            const { data, error } = await supabase
              .from("sites")
              .select(
                "id,slug,title,cover_photo_url,location_free,heritage_type,avg_rating,review_count"
              )
              .in("id", ids);
            if (error) throw error;
            details = (data || []) as any[];
          }

          const byId = new Map<string, Site>(
            details.map((d) => [d.id, d as Site])
          );
          const distanceById = new Map<string, number | null>(
            pageRows.map((r: any) => [r.id, r.distance_km ?? null])
          );

          const ordered: Site[] = ids
            .map((id) => {
              const base = byId.get(id);
              if (!base) return null;
              return { ...base, distance_km: distanceById.get(id) ?? null };
            })
            .filter(Boolean) as Site[];

          setResults({ sites: ordered, total });
          return;
        }

        /* ───── Non-radius mode ───── */
        const orderQuery = "latest";
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
        const total = data?.[0]?.total_count || 0;
        setResults({ sites, total });
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

  const selectedCategoryNames = useMemo(
    () => filters.categoryIds.map((id) => categoryMap[id]).filter(Boolean),
    [filters.categoryIds, categoryMap]
  );
  const selectedRegionNames = useMemo(
    () => filters.regionIds.map((id) => regionMap[id]).filter(Boolean),
    [filters.regionIds, regionMap]
  );

  const headline = useMemo(
    () =>
      buildHeadline({
        query: filters.name || "",
        categoryNames: selectedCategoryNames,
        regionNames: selectedRegionNames,
        radiusActive: hasRadius(filters),
        centerSiteTitle,
        radiusKm: filters.radiusKm ?? null,
      }),
    [
      filters.name,
      selectedCategoryNames,
      selectedRegionNames,
      filters.radiusKm,
      filters.centerLat,
      filters.centerLng,
      filters.centerSiteId,
      centerSiteTitle,
    ]
  );

  /* ───────── Locked Radius Banner (with KM pill) ───────── */
  const CenterBanner = () =>
    hasRadius(filters) && centerSitePreview ? (
      <div
        className="hidden xl:flex items-center gap-3 absolute right-2 top-1"
        aria-label="Locked radius location"
      >
        <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg ring-1 ring-[var(--taupe-grey)]/60 px-3 py-2 flex items-center max-w-[360px]">
          {/* Circular thumbnail */}
          <div className="relative w-14 h-14 flex-shrink-0">
            {(() => {
              const raw = centerSitePreview.cover || "";
              const t = thumbUrl(raw, 112);
              const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
                /\/+$/,
                ""
              );
              const absoluteFallback = /^https?:\/\//i.test(raw)
                ? raw
                : SUPA_URL
                ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(
                    /^\/+/,
                    ""
                  )}`
                : "";
              return t ? (
                <img
                  src={t}
                  className="w-14 h-14 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40"
                  alt=""
                  decoding="async"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    if (absoluteFallback && img.src !== absoluteFallback) {
                      img.src = absoluteFallback;
                    }
                  }}
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40" />
              );
            })()}
          </div>

          {/* Text with KM pill */}
          <div className="min-w-0 pl-2">
            <div className="text-[11px] uppercase tracking-wider text-[var(--espresso-brown)]/70 flex items-center gap-1">
              <span>Sites within</span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--olive-green)]/10 text-[var(--olive-green)] font-semibold ring-1 ring-[var(--olive-green)]/30 leading-none">
                {typeof filters.radiusKm === "number"
                  ? `${filters.radiusKm} km`
                  : "Radius"}
              </span>
            </div>
            <div className="text-base font-semibold text-[var(--dark-grey)] truncate">
              {centerSitePreview.title}
            </div>
            {centerSitePreview.subtitle && (
              <div className="text-xs text-[var(--espresso-brown)]/80 truncate">
                {centerSitePreview.subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative min-h-screen bg-[var(--ivory-cream)]">
      {/* Global palette */}
      <style jsx global>{`
        :root {
          --navy-deep: #1c1f4c;
          --sand-gold: #c7a76b;
          --espresso-brown: #4b2e05;
          --ivory-cream: #faf7f2;
          --taupe-grey: #d8cfc4;
          --terracotta-red: #a9502a;
          --mustard-accent: #e2b65c;
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
        }
      `}</style>

      {/* Decorative motifs */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none">
        <img
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif%20(2).png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute top-1 left-1/2 -translate-x-20 transform w-[420px] md:w-[300px] opacity-30"
          style={{ transform: "translateX(150%) rotate(-6deg)" }}
        />
        <img
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif.png"
          alt=""
          aria-hidden={true}
          draggable={false}
          className="absolute top-120 -right-20 w-[360px] md:w-[250px] opacity-30"
          style={{ transform: "rotate(8deg)" }}
        />
        <img
          src="https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/chowkandimotif%20(3).png"
          alt=""
          aria-hidden={true}
          draggable={false}
          className="absolute bottom-10 left-50 w-[380px] md:w-[300px] opacity-25"
          style={{ transform: "rotate(-4deg)" }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <div className="lg:flex">
          <aside className="hidden lg:block w-[360px] fixed left-4 top-[88px] bottom-4 z-20">
            <div className="h-full rounded-2xl bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] overflow-hidden flex flex-col">
              <SearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onSearch={executeSearch}
              />
            </div>
          </aside>

          <main className="lg:ml-[380px] p-4 w-full">
            {/* Right padding so H1 never collides with banner */}
            <div className="px-3 sm:px-4 pt-4 sm:pt-5 pb-0 mb-10 sm:mb-4 relative xl:pr-[260px]">
              <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--dark-grey)] tracking-tight">
                {headline}
              </h1>
              <div className="mt-2 text-sm text-[var(--espresso-brown)]/80 font-explore-results-count">
                Showing <strong>{loading ? 0 : results.sites.length}</strong> of{" "}
                <strong>{loading ? 0 : results.total}</strong> results
              </div>
              <div className="mt-2 h-[3px] w-20 bg-[var(--mustard-accent)] rounded" />

              <CenterBanner />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <PreviewCardSkeleton key={i} />
                ))
              ) : error ? (
                <div className="p-6 text:[var(--terracotta-red)] sm:col-span-3">
                  {error}
                </div>
              ) : results.sites.length === 0 ? (
                <div className="p-6 text-[var(--espresso-brown)] sm:col-span-3">
                  No sites match your filters.
                </div>
              ) : (
                results.sites.map((s) => (
                  <SitePreviewCard key={s.id} site={s} />
                ))
              )}
            </div>

            {results.total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  className="px-4 py-2 rounded-lg bg-white text-[var(--dark-grey)] ring-1 ring-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] disabled:opacity-50"
                  onClick={() => navigatePage(page - 1)}
                  disabled={page <= 1}
                >
                  Prev
                </button>

                <span className="text-sm font-explore-pagination text-[var(--espresso-brown)]/80">
                  Page {page} of {totalPages}
                </span>

                <button
                  className="px-4 py-2 rounded-lg bg-white text-[var(--dark-grey)] ring-1 ring-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] disabled:opacity-50"
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
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-[var(--ivory-cream)]" />}
    >
      <ExplorePageContent />
    </Suspense>
  );
}
