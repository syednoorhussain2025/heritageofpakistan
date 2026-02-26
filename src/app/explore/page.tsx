"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import SearchFilters, {
  Filters,
  fetchSitesByFilters,
  hasRadius,
} from "@/components/SearchFilters";
import { clearPlacesNearby } from "@/lib/placesNearby";
import { supabase } from "@/lib/supabase/browser";
import SitePreviewCard from "@/components/SitePreviewCard";
import NearbySearchModal from "@/components/NearbySearchModal";
import Icon from "@/components/Icon";

const PAGE_SIZE = 12;
const QUERY_TIMEOUT_MS = 12000;
const SEARCH_RPC_TIMEOUT_MS = 30000;

function withTimeout<T = any>(
  promise: PromiseLike<T>,
  timeoutMs = QUERY_TIMEOUT_MS,
  label = "Request"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

/* ───────────────────────────── Spinner ───────────────────────────── */
function Spinner({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full animate-spin ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: "3px",
        borderStyle: "solid",
        borderColor: "grey",
        borderTopColor: "transparent",
      }}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ───────────────────────────── Types ───────────────────────────── */
type Site = {
  id: string;
  slug: string;
  province_slug?: string | null;
  province_id?: number | null;

  title: string;

  // Thumbnail URL stored directly in sites table, full URL
  cover_photo_thumb_url?: string | null;

  cover_blur_data_url?: string | null;
  cover_width?: number | null;
  cover_height?: number | null;

  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  distance_km?: number | null;
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

type SearchSitesRpcArgs = {
  nameQuery: string;
  categoryIds: string[];
  regionIds: string[];
  page: number;
  pageSize: number;
  label: string;
};

function isTimeoutError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return /timed out after/i.test(message);
}

async function fetchSearchSitesFallback({
  nameQuery,
  categoryIds,
  regionIds,
  page,
  pageSize,
}: Omit<SearchSitesRpcArgs, "label">) {
  const needCategoryInner = categoryIds.length > 0;
  const needRegionInner = regionIds.length > 0;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const joinSelectParts: string[] = [];
  if (needCategoryInner) joinSelectParts.push("site_categories!inner(category_id)");
  if (needRegionInner) joinSelectParts.push("site_regions!inner(region_id)");

  const selectCols = [
    "id",
    "slug",
    "province_id",
    "title",
    "cover_photo_url",
    "location_free",
    "heritage_type",
    "avg_rating",
    "review_count",
    "created_at",
    ...joinSelectParts,
  ].join(",");

  let q = supabase
    .from("sites")
    .select(selectCols, { count: "planned" })
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (nameQuery.trim()) {
    const qv = nameQuery.trim();
    q = q.or(`title.ilike.%${qv}%,slug.ilike.%${qv}%`);
  }
  if (needCategoryInner) {
    q = q.in("site_categories.category_id", categoryIds as any[]);
  }
  if (needRegionInner) {
    q = q.in("site_regions.region_id", regionIds as any[]);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const rows = ((data as any[]) || []).map((row) => ({
    ...row,
    total_count: count ?? 0,
  }));
  return rows;
}

async function searchSitesRpc({
  nameQuery,
  categoryIds,
  regionIds,
  page,
  pageSize,
  label,
}: SearchSitesRpcArgs) {
  try {
    return await withTimeout(
      supabase.rpc("search_sites", {
        p_name_query: nameQuery.trim() || null,
        p_category_ids: categoryIds.length > 0 ? categoryIds : null,
        p_region_ids: regionIds.length > 0 ? regionIds : null,
        p_order_by: "latest",
        p_page: page,
        p_page_size: pageSize,
      }),
      SEARCH_RPC_TIMEOUT_MS,
      label
    );
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    console.warn(`[Explore] ${label} timed out, using fallback query path.`);
    const fallbackRows = await fetchSearchSitesFallback({
      nameQuery,
      categoryIds,
      regionIds,
      page,
      pageSize,
    });
    return { data: fallbackRows, error: null };
  }
}

/** Read "type" selections from Filters in a tolerant way. */
function getSelectedTypes(f: Filters): string[] {
  const anyF = f as unknown as Record<string, unknown>;
  const arr =
    (anyF["heritageTypes"] as string[] | undefined) ??
    (anyF["types"] as string[] | undefined) ??
    [];
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
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

/** Headline builder, includes categories when radius mode is active. */
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

/** Small thumb helper kept for banner avatar only */
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

/** Canonical cover URL builder used only for radius banner preview */
function buildCoverUrlFromStoragePath(storagePath: string | null) {
  if (!storagePath) return "";

  if (/^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!SUPA_URL) return "";

  const clean = storagePath.replace(/^\/+/, "");
  return `${SUPA_URL}/storage/v1/object/public/site-images/${clean}`;
}

/* ───────────────────────────── Stable banner image ───────────────────────────── */
function StableBannerImage({
  rawCover,
  size = 112,
  alt = "",
  className = "",
}: {
  rawCover?: string | null;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

  const computed = useMemo(() => {
    const t = thumbUrl(rawCover || "", size);
    const absoluteFallback =
      rawCover && /^https?:\/\//i.test(rawCover)
        ? rawCover
        : rawCover && SUPA_URL
        ? `${SUPA_URL}/storage/v1/object/public/${rawCover.replace(/^\/+/, "")}`
        : "";

    return {
      primary: t || absoluteFallback || "",
      fallback: absoluteFallback || "",
    };
  }, [rawCover, size, SUPA_URL]);

  const [src, setSrc] = useState(computed.primary);
  const usedFallback = useRef(false);

  useEffect(() => {
    if (src !== computed.primary && !usedFallback.current) {
      setSrc(computed.primary);
    }
  }, [computed.primary, src]);

  const onError = useCallback(() => {
    if (
      !usedFallback.current &&
      computed.fallback &&
      src !== computed.fallback
    ) {
      usedFallback.current = true;
      setSrc(computed.fallback);
    }
  }, [computed.fallback, src]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  useLayoutEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const done = () => el.classList.add("opacity-100");
    el.classList.remove("opacity-100");
    el.classList.add("opacity-0", "transition-opacity", "duration-500");
    if (el.complete) {
      requestAnimationFrame(done);
    } else {
      el.addEventListener("load", done, { once: true });
      return () => el.removeEventListener("load", done);
    }
  }, [src]);

  if (!src) {
    return
      <div className="w-14 h-14 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40" />;
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      decoding="async"
      loading="lazy"
      className={`w-14 h-14 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40 ${className}`}
      onError={onError}
    />
  );
}

/* ───────────────── Province slug cache (session-level singleton) ───────────────── */
const _provinceSlugCache = new Map<number, string>();
let _provinceSlugCachePromise: Promise<void> | null = null;

function warmProvinceSlugCache(): Promise<void> {
  if (_provinceSlugCachePromise) return _provinceSlugCachePromise;
  _provinceSlugCachePromise = (async () => {
    try {
      const { data } = await supabase.from("provinces").select("id, slug");
      for (const p of (data || []) as { id: number; slug: string | null }[]) {
        if (p.id != null) {
          _provinceSlugCache.set(p.id, String(p.slug ?? "").trim());
        }
      }
    } catch {
      // Cache miss is safe — province slugs will be absent but no crash
    }
  })();
  return _provinceSlugCachePromise;
}

async function ensureProvinceSlugOnSites(sites: Site[]) {
  const missing = sites.filter(
    (s) => !s.province_slug || s.province_slug.trim() === ""
  );
  if (!missing.length) return;

  // Ensure province slug cache is populated (no-op if already loaded)
  await warmProvinceSlugCache();

  // Resolve from cache for sites that already carry province_id
  const needsSiteQuery: Site[] = [];
  for (const s of missing) {
    if (s.province_id != null) {
      const slug = _provinceSlugCache.get(s.province_id as number) ?? null;
      s.province_slug = slug && slug.length > 0 ? slug : null;
    } else {
      needsSiteQuery.push(s);
    }
  }

  // Only hit the DB for the rare case where province_id is absent from the response
  if (!needsSiteQuery.length) return;

  const ids = needsSiteQuery.map((s) => s.id);
  const { data: siteRows, error: siteErr } = await withTimeout(
    supabase.from("sites").select("id, province_id").in("id", ids),
    QUERY_TIMEOUT_MS,
    "explore.ensureProvinceSlug.siteQuery"
  );
  if (siteErr || !siteRows?.length) return;

  for (const row of siteRows as { id: string; province_id: number | null }[]) {
    const site = needsSiteQuery.find((s) => s.id === row.id);
    if (site && row.province_id != null) {
      site.province_slug = _provinceSlugCache.get(row.province_id) ?? null;
    }
  }
}

/* ────────────── Active cover thumbs from sites table ────────────── */
async function attachActiveCovers(sites: Site[]) {
  // Work out what each site is still missing
  const needsThumb = sites.filter((s) => !s.cover_photo_thumb_url);
  const needsBlur = sites.filter((s) => !s.cover_blur_data_url);
  if (!needsThumb.length && !needsBlur.length) return;

  try {
    await Promise.all([
      // ── Thumbnail URL from sites table ───────────────────────────────────
      needsThumb.length
        ? (async () => {
            const ids = Array.from(
              new Set(needsThumb.map((s) => s.id))
            ).filter(Boolean);
            const { data, error } = await withTimeout(
              supabase
                .from("sites")
                .select("id, cover_photo_thumb_url")
                .in("id", ids),
              QUERY_TIMEOUT_MS,
              "explore.attachActiveCovers.thumb"
            );
            if (error) {
              console.error("attachActiveCovers: thumb error", error);
              return;
            }
            type ThumbRow = { id: string; cover_photo_thumb_url: string | null };
            const byId = new Map<string, string | null>(
              (data as ThumbRow[]).map((r) => [r.id, r.cover_photo_thumb_url ?? null])
            );
            for (const s of needsThumb) {
              s.cover_photo_thumb_url = byId.get(s.id) ?? null;
            }
          })()
        : Promise.resolve(),

      // ── Blur placeholder: sites.cover_image_id → site_images ────────
      needsBlur.length
        ? (async () => {
            const ids = Array.from(
              new Set(needsBlur.map((s) => s.id))
            ).filter(Boolean);

            // Step 1: get cover_image_id for each site
            const { data: siteRows, error: siteErr } = await withTimeout(
              supabase
                .from("sites")
                .select("id, cover_image_id")
                .in("id", ids)
                .not("cover_image_id", "is", null),
              QUERY_TIMEOUT_MS,
              "explore.attachActiveCovers.coverImageIds"
            );
            if (siteErr) {
              console.error("attachActiveCovers: coverImageIds error", siteErr);
              return;
            }

            type SiteRow = { id: string; cover_image_id: string };
            const siteToImageId = new Map<string, string>(
              ((siteRows ?? []) as SiteRow[]).map((r) => [r.id, r.cover_image_id])
            );
            const imageIds = Array.from(new Set(siteToImageId.values()));
            if (!imageIds.length) return;

            // Step 2: fetch blur data from site_images by cover_image_id
            const { data: imgRows, error: imgErr } = await withTimeout(
              supabase
                .from("site_images")
                .select("id, blur_data_url, width, height")
                .in("id", imageIds),
              QUERY_TIMEOUT_MS,
              "explore.attachActiveCovers.blurData"
            );
            if (imgErr) {
              console.error("attachActiveCovers: blurData error", imgErr);
              return;
            }

            type ImgRow = {
              id: string;
              blur_data_url: string | null;
              width: number | null;
              height: number | null;
            };
            const byImageId = new Map<string, ImgRow>(
              ((imgRows ?? []) as ImgRow[]).map((r) => [r.id, r])
            );

            for (const s of needsBlur) {
              const imgId = siteToImageId.get(s.id);
              if (!imgId) continue;
              const img = byImageId.get(imgId);
              if (!img?.blur_data_url) continue;
              s.cover_blur_data_url = img.blur_data_url;
              s.cover_width = img.width ?? null;
              s.cover_height = img.height ?? null;
            }
          })()
        : Promise.resolve(),
    ]);
  } catch (e) {
    console.error("attachActiveCovers: unexpected error", e);
  }
}

/* ───────────────────────────── Page ───────────────────────────── */
function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const filtersRef = useRef<Filters>(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const isHydratingRef = useRef(false);
  // Monotonically-increasing counter: each search invocation stamps its own
  // generation. Async callbacks check gen === searchGenRef.current before
  // committing state, so stale responses from earlier searches are discarded.
  const searchGenRef = useRef(0);

  const [showNearbyModal, setShowNearbyModal] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelVisible, setSearchPanelVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ sites: Site[]; total: number }>({
    sites: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* For radius mode, keep full ordered list client side for infinite scroll */
  const [radiusAllRows, setRadiusAllRows] = useState<any[] | null>(null);

  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [regionMap, setRegionMap] = useState<Record<string, string>>({});

  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);
  const [centerSitePreview, setCenterSitePreview] = useState<{
    id: string;
    title: string;
    subtitle?: string | null;
    cover?: string | null;
  } | null>(null);

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...newFilters };
      filtersRef.current = next;
      return next;
    });
  };

  /* Deep link canonicalization for Places Nearby */
  useEffect(() => {
    const centerSiteId = searchParams.get("centerSiteId");
    const lat = searchParams.get("centerLat");
    const lng = searchParams.get("centerLng");
    const rkm = searchParams.get("radiusKm");

    if (centerSiteId && lat && lng && rkm) {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);
      const parsedRkm = Number(rkm);

      const next = {
        ...filtersRef.current,
        centerSiteId,
        centerLat: !Number.isNaN(parsedLat) ? parsedLat : null,
        centerLng: !Number.isNaN(parsedLng) ? parsedLng : null,
        radiusKm: !Number.isNaN(parsedRkm) ? parsedRkm : 25,
      } satisfies Filters;

      isHydratingRef.current = true;
      setFilters(next);
      filtersRef.current = next;

      const canonical = new URLSearchParams();
      canonical.set("center", centerSiteId);
      canonical.set("clat", String(parsedLat));
      canonical.set("clng", String(parsedLng));
      canonical.set("rkm", String(parsedRkm));
      if (searchParams.toString() !== canonical.toString()) {
        router.replace(`/explore?${canonical.toString()}`);
      }
      setTimeout(() => {
        isHydratingRef.current = false;
      }, 0);
    }
  }, [searchParams, router]);

  /* Load name maps once + pre-warm province slug cache in parallel */
  useEffect(() => {
    // Start province slug cache loading immediately — it will be ready
    // by the time the first search completes, making ensureProvinceSlugOnSites a cache hit.
    warmProvinceSlugCache();

    (async () => {
      try {
        const [{ data: cats }, { data: regs }] = await withTimeout(
          Promise.all([
            supabase.from("categories").select("id,name").order("name"),
            supabase.from("regions").select("id,name").order("name"),
          ]),
          QUERY_TIMEOUT_MS,
          "explore.loadFilterMaps"
        );
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
      } catch (error) {
        console.warn("[Explore] failed to load category/region maps", error);
      }
    })();
  }, []);

  /* Helper to build URL params from filters, page is now internal only */
  const buildParamsFrom = useCallback((f: Filters) => {
    const params = new URLSearchParams();
    if (f.name) params.set("q", f.name);
    if (f.categoryIds.length > 0) params.set("cats", f.categoryIds.join(","));
    if (f.regionIds.length > 0) params.set("regs", f.regionIds.join(","));
    if (hasRadius(f)) {
      if (f.centerSiteId) params.set("center", f.centerSiteId);
      if (typeof f.centerLat === "number")
        params.set("clat", String(f.centerLat));
      if (typeof f.centerLng === "number")
        params.set("clng", String(f.centerLng));
      if (typeof f.radiusKm === "number")
        params.set("rkm", String(f.radiusKm));
    }
    return params;
  }, []);

  /* Debounced auto search when filters change, not during URL hydration */
  const debounceIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (isHydratingRef.current) return;
    if (debounceIdRef.current) window.clearTimeout(debounceIdRef.current);
    debounceIdRef.current = window.setTimeout(() => {
      const f = filtersRef.current;
      const params = buildParamsFrom(f);
      if (searchParams.toString() !== params.toString()) {
        router.push(`/explore?${params.toString()}`);
      }
    }, 300);
    return () => {
      if (debounceIdRef.current) window.clearTimeout(debounceIdRef.current);
    };
  }, [filters, buildParamsFrom, router, searchParams]);

  /* Read URL → fetch first page + banner info */
  useEffect(() => {
    setLoading(true);
    setIsLoadingMore(false);
    setPage(1);

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

    isHydratingRef.current = true;
    setFilters(nextFilters);
    filtersRef.current = nextFilters;

    (async () => {
      setError(null);
      const gen = ++searchGenRef.current;
      try {
        /* ───── Radius mode, first page ───── */
        if (hasRadius(nextFilters)) {
          // Run banner fetch and the radius RPC in parallel — the RPC is the
          // slow leg, so overlapping it with the banner saves a full round-trip.
          const [bannerResult, radiusRows] = await Promise.all([
            nextFilters.centerSiteId
              ? (async () => {
                  const { data: row, error: err } = await withTimeout(
                    supabase
                      .from("sites")
                      .select("id,title,location_free,cover_photo_url")
                      .eq("id", nextFilters.centerSiteId!)
                      .maybeSingle(),
                    QUERY_TIMEOUT_MS,
                    "explore.loadCenterSite"
                  );
                  if (err || !row) return null;

                  const { data: coverRow } = await withTimeout(
                    supabase
                      .from("site_covers")
                      .select("storage_path")
                      .eq("site_id", row.id)
                      .eq("is_active", true)
                      .maybeSingle(),
                    QUERY_TIMEOUT_MS,
                    "explore.loadCenterCover"
                  );

                  const cover: string | null = coverRow?.storage_path
                    ? buildCoverUrlFromStoragePath(coverRow.storage_path)
                    : ((row as any).cover_photo_url as string | null) ?? null;

                  return { row, cover };
                })()
              : Promise.resolve(null),
            withTimeout(
              fetchSitesByFilters(nextFilters),
              QUERY_TIMEOUT_MS,
              "explore.fetchSitesByFilters"
            ),
          ]);

          if (gen !== searchGenRef.current) return;

          if (bannerResult?.row) {
            const { row, cover } = bannerResult;
            setCenterSiteTitle(row.title ?? null);
            setCenterSitePreview({
              id: row.id,
              title: row.title,
              subtitle: row.location_free ?? null,
              cover,
            });
          } else {
            setCenterSiteTitle(null);
            setCenterSitePreview(null);
          }

          let distanceOrdered = [...radiusRows].sort(
            (a: any, b: any) =>
              (a.distance_km ?? Number.POSITIVE_INFINITY) -
              (b.distance_km ?? Number.POSITIVE_INFINITY)
          );

          const allIds = distanceOrdered.map((r: any) => r.id);

          /* Category filter + heritage type filter run in parallel */
          const selectedTypes = new Set(getSelectedTypes(nextFilters));
          const [pairsResult, attrsResult] = await Promise.all([
            allIds.length && nextFilters.categoryIds?.length
              ? withTimeout(
                  supabase
                    .from("site_categories")
                    .select("site_id,category_id")
                    .in("site_id", allIds)
                    .in("category_id", nextFilters.categoryIds as string[]),
                  QUERY_TIMEOUT_MS,
                  "explore.filterByCategories"
                )
              : Promise.resolve({ data: null, error: null }),
            allIds.length && selectedTypes.size > 0
              ? withTimeout(
                  supabase
                    .from("sites")
                    .select("id,heritage_type")
                    .in("id", allIds),
                  QUERY_TIMEOUT_MS,
                  "explore.filterByTypes"
                )
              : Promise.resolve({ data: null, error: null }),
          ]);

          if (pairsResult.error) throw pairsResult.error;
          if (pairsResult.data) {
            const allowed = new Set(
              (pairsResult.data as any[]).map((p: any) => p.site_id)
            );
            distanceOrdered = distanceOrdered.filter((r: any) =>
              allowed.has(r.id)
            );
          }
          if (attrsResult.data && selectedTypes.size > 0) {
            const typeById = new Map(
              (attrsResult.data as any[]).map((s: any) => [
                s.id,
                s.heritage_type ?? null,
              ])
            );
            distanceOrdered = distanceOrdered.filter((r: any) => {
              const ht = typeById.get(r.id);
              return ht && selectedTypes.has(ht);
            });
          }

          const total = distanceOrdered.length;
          setRadiusAllRows(distanceOrdered);

          const pageRows = distanceOrdered.slice(0, PAGE_SIZE);
          const ids = pageRows.map((r: any) => r.id);
          if (!ids.length) {
            setResults({ sites: [], total });
            return;
          }

          // Include cover_photo_thumb_url so attachActiveCovers is a no-op
          const { data: details, error: detailsErr } = await withTimeout(
            supabase
              .from("sites")
              .select(
                "id,slug,province_id,title,cover_photo_url,cover_photo_thumb_url,location_free,heritage_type,avg_rating,review_count"
              )
              .in("id", ids),
            QUERY_TIMEOUT_MS,
            "explore.loadRadiusPageDetails"
          );
          if (detailsErr) throw detailsErr;
          if (gen !== searchGenRef.current) return;

          // Province slug resolution + cover thumb fallback in parallel
          await Promise.all([
            ensureProvinceSlugOnSites(details as Site[]),
            attachActiveCovers(details as Site[]),
          ]);
          if (gen !== searchGenRef.current) return;

          const distanceById = new Map<string, number | null>(
            pageRows.map((r: any) => [r.id, r.distance_km ?? null])
          );
          const byId = new Map<string, Site>(
            (details as Site[]).map((d) => [d.id, d])
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

        /* ───── Non radius mode, first page ───── */
        setCenterSiteTitle(null);
        setCenterSitePreview(null);
        setRadiusAllRows(null);

        const { data, error: rpcError } = await searchSitesRpc({
          nameQuery,
          categoryIds: catsQuery,
          regionIds: regsQuery,
          page: 1,
          pageSize: PAGE_SIZE,
          label: "explore.searchSitesPage1",
        });
        if (rpcError) throw rpcError;
        if (gen !== searchGenRef.current) return;

        const sites = ((data as any[]) || []) as Site[];
        const total = (data as any[])?.[0]?.total_count || 0;

        // Province slug resolution + cover thumb fetch in parallel
        await Promise.all([
          ensureProvinceSlugOnSites(sites),
          attachActiveCovers(sites),
        ]);
        if (gen !== searchGenRef.current) return;

        setResults({ sites, total });
      } catch (e: any) {
        if (gen !== searchGenRef.current) return;
        setError(e?.message || "Failed to load results");
        setResults({ sites: [], total: 0 });
        setRadiusAllRows(null);
      } finally {
        if (gen === searchGenRef.current) {
          setLoading(false);
          isHydratingRef.current = false;
        }
      }
    })();
  }, [searchParams]);

  const [categoryMapState, regionMapState] = [categoryMap, regionMap];

  const selectedCategoryNames = useMemo(
    () => filters.categoryIds.map((id) => categoryMapState[id]).filter(Boolean),
    [filters.categoryIds, categoryMapState]
  );
  const selectedRegionNames = useMemo(
    () => filters.regionIds.map((id) => regionMapState[id]).filter(Boolean),
    [filters.regionIds, regionMapState]
  );

  const headline = useMemo(
    () =>
      buildHeadline({
        query: filters.name || "",
        categoryNames: selectedCategoryNames,
        regionNames: selectedRegionNames,
        radiusActive: Boolean(hasRadius(filters)),
        radiusKm:
          typeof filters.radiusKm === "number" ? filters.radiusKm : null,
        centerSiteTitle,
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

  const cardsRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const executeSearch = useCallback(() => {
    const f = filtersRef.current;
    const params = buildParamsFrom(f);
    if (searchParams.toString() !== params.toString()) {
      router.push(`/explore?${params.toString()}`);
    }
  }, [router, buildParamsFrom, searchParams]);

  const hasMore = results.sites.length < results.total;

  /* Load next page when sentinel is visible */
  const loadMore = useCallback(async () => {
    if (loading || isLoadingMore) return;
    if (!hasMore) return;

    const currentFilters = filtersRef.current;
    setIsLoadingMore(true);

    try {
      /* Radius mode, use in memory distance ordered list */
      if (hasRadius(currentFilters)) {
        if (!radiusAllRows || radiusAllRows.length === 0) {
          setIsLoadingMore(false);
          return;
        }

        const nextPage = page + 1;
        const start = (nextPage - 1) * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const pageRows = radiusAllRows.slice(start, end);
        if (!pageRows.length) {
          setIsLoadingMore(false);
          return;
        }

        const ids = pageRows.map((r: any) => r.id);
        const { data: details, error: detailsErr } = await withTimeout(
          supabase
            .from("sites")
            .select(
              "id,slug,province_id,title,cover_photo_url,cover_photo_thumb_url,location_free,heritage_type,avg_rating,review_count"
            )
            .in("id", ids),
          QUERY_TIMEOUT_MS,
          "explore.loadMoreRadiusDetails"
        );
        if (detailsErr) throw detailsErr;

        await Promise.all([
          ensureProvinceSlugOnSites(details as Site[]),
          attachActiveCovers(details as Site[]),
        ]);

        const distanceById = new Map<string, number | null>(
          pageRows.map((r: any) => [r.id, r.distance_km ?? null])
        );
        const byId = new Map<string, Site>(
          (details as Site[]).map((d) => [d.id, d])
        );

        const ordered: Site[] = ids
          .map((id) => {
            const base = byId.get(id);
            if (!base) return null;
            return { ...base, distance_km: distanceById.get(id) ?? null };
          })
          .filter(Boolean) as Site[];

        setResults((prev) => ({
          sites: [...prev.sites, ...ordered],
          total: prev.total,
        }));
        setPage(nextPage);
        setIsLoadingMore(false);
        return;
      }

      /* Non radius mode, ask RPC for next page */
      const nextPage = page + 1;

      const nameQuery = searchParams.get("q") || "";
      const catsQuery = parseMulti(searchParams.get("cats"));
      const regsQuery = parseMulti(searchParams.get("regs"));

      const { data, error: rpcError } = await searchSitesRpc({
        nameQuery,
        categoryIds: catsQuery,
        regionIds: regsQuery,
        page: nextPage,
        pageSize: PAGE_SIZE,
        label: "explore.searchSitesLoadMore",
      });
      if (rpcError) throw rpcError;

      const newSites = ((data as any[]) || []) as Site[];
      const newTotal =
        (data as any[])?.[0]?.total_count || results.total || 0;

      if (!newSites.length) {
        setResults((prev) => ({ ...prev, total: newTotal }));
        setIsLoadingMore(false);
        return;
      }

      await Promise.all([
        ensureProvinceSlugOnSites(newSites),
        attachActiveCovers(newSites),
      ]);

      setResults((prev) => ({
        sites: [...prev.sites, ...newSites],
        total: newTotal || prev.total,
      }));
      setPage(nextPage);
    } catch (e: any) {
      setError(e?.message || "Failed to load results");
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    loading,
    isLoadingMore,
    hasMore,
    radiusAllRows,
    page,
    searchParams,
    results.total,
  ]);

  /* IntersectionObserver for infinite scroll */
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  /* Locked radius banner — clicking opens the NearbySearchModal */
  const CenterBanner = () =>
    hasRadius(filters) && centerSitePreview ? (
      <div
        className="hidden xl:flex items-center gap-3 absolute right-2 top-1"
        aria-label="Locked radius location"
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNearbyModal(true)}
            className="group/edit rounded-2xl bg-white/90 backdrop-blur-sm shadow-lg ring-1 ring-[var(--taupe-grey)]/60 px-3 py-2 pr-4 flex items-center max-w-[360px] hover:ring-[var(--brand-orange)] hover:shadow-xl transition-all cursor-pointer"
          >
            <div className="relative w-14 h-14 flex-shrink-0">
              <StableBannerImage
                rawCover={centerSitePreview.cover}
                size={112}
                alt=""
              />
            </div>
            <div className="min-w-0 pl-2 text-left">
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
            {/* "Click to edit" tooltip on main button hover */}
            <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-gray-900 text-white text-[0.7rem] rounded-lg whitespace-nowrap opacity-0 group-hover/edit:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
              Click to edit
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
            </span>
          </button>
          {/* X to clear proximity search — with its own "Clear" tooltip */}
          <div className="absolute -top-2 -right-2 group/clearx">
            <button
              type="button"
              onClick={() => {
                handleFilterChange(clearPlacesNearby());
                executeSearch();
              }}
              className="w-5 h-5 rounded-full bg-white shadow ring-1 ring-gray-300 flex items-center justify-center text-gray-400 hover:text-[var(--brand-orange)] hover:ring-[var(--brand-orange)]/50 transition-colors"
            >
              <Icon name="times" size={8} />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[0.65rem] rounded-md whitespace-nowrap opacity-0 group-hover/clearx:opacity-100 transition-opacity duration-150 z-50">
              Clear
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-900" />
            </span>
          </div>
        </div>
      </div>
    ) : null;

  // Mount guard for portals
  useEffect(() => { setMounted(true); }, []);

  // Search panel slide animation
  useEffect(() => {
    if (!searchPanelOpen) { setSearchPanelVisible(false); return; }
    let id2: number;
    const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setSearchPanelVisible(true)); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
  }, [searchPanelOpen]);

  const closeSearchPanel = useCallback(() => {
    setSearchPanelVisible(false);
    setTimeout(() => setSearchPanelOpen(false), 300);
  }, []);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (searchPanelOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [searchPanelOpen]);

  const panelSwipeRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="relative min-h-screen bg-[var(--ivory-cream)]">
      <style jsx global>{`
        :root {
          --navy-deep: #1c1f4c;
          --sand-gold: #c7a76b;
          --espresso-brown: #4b2e05;
          --ivory-cream: #f8f8f8;
          --taupe-grey: #d8cfc4;
          --terracotta-red: #a9502a;
          --mustard-accent: #e2b65c;
          --olive-green: #7b6e3f;
          --dark-grey: #2b2b2b;
        }
        @keyframes cardIn {
          from {
            transform: translateY(18px);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="relative z-10">
        <div className="lg:flex">
          <aside className="hidden lg:block w-[360px] fixed left-4 top-[88px] bottom-4 z-20">
            <div className="h-full rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 overflow-hidden flex flex-col">
              <SearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onSearch={executeSearch}
                onOpenNearbyModal={() => setShowNearbyModal(true)}
              />
              {hasRadius(filters) && centerSitePreview?.subtitle ? (
                <div className="px-4 pb-3 pt-1 text-xs text-[var(--espresso-brown)]/80 border-t border-[var(--taupe-grey)]/30">
                  {centerSitePreview.subtitle}
                </div>
              ) : null}
            </div>
          </aside>

          <main className="lg:ml-[380px] px-4 pb-4 pt-6 lg:pt-4 w-full">
            <div className="hidden lg:block px-3 sm:px-4 pt-0 lg:pt-5 pb-0 mb-0 lg:mb-10 relative xl:pr-[260px]">
              {/* Desktop-only headline + count; shown in mobile header instead */}
              <div className="hidden lg:block">
                <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--dark-grey)] tracking-tight">
                  {headline}
                </h1>
                <div className="mt-2 text-sm text-[var(--espresso-brown)]/80 font-explore-results-count">
                  Showing{" "}
                  <strong>
                    {loading && results.sites.length === 0
                      ? 0
                      : results.sites.length}
                  </strong>{" "}
                  of <strong>{results.total}</strong> results
                </div>
                <div className="mt-2 h-[3px] w-20 bg-[var(--mustard-accent)] rounded" />
              </div>

              <CenterBanner />
            </div>

            {/* Grid + centered spinner overlay for first load only */}
            <div className="relative">
              {loading && results.sites.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                  <Spinner size={40} />
                </div>
              )}

              <div
                ref={cardsRef}
                className="grid grid-cols-2 xl:grid-cols-3 gap-5"
                style={{ opacity: loading && results.sites.length > 0 ? 0.4 : 1 }}
              >
                {loading && results.sites.length === 0 ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <PreviewCardSkeleton key={i} />
                  ))
                ) : error ? (
                  <div className="p-6 text:[var(--terracotta-red)] sm:col-span-3">
                    {error}
                  </div>
                ) : results.sites.length === 0 ? (
                  <div className="p-6 text-[var(--espresso-brown)]/80 sm:col-span-3">
                    No sites match your filters.
                  </div>
                ) : (
                  results.sites.map((s, index) => (
                    <div
                      key={s.id}
                      style={{
                        animation: "cardIn 0.4s ease both",
                        animationDelay: `${Math.min(index, 8) * 55}ms`,
                      }}
                    >
                      <SitePreviewCard site={s} index={index} />
                    </div>
                  ))
                )}
              </div>

              {/* Infinite scroll sentinel and bottom spinner */}
              {results.sites.length > 0 && (
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center py-6"
                >
                  {hasMore && isLoadingMore && <Spinner size={32} />}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Nearby search modal */}
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
          handleFilterChange(v);
          executeSearch();
        }}
      />

      {/* ── Mobile Explore Header ── */}
      {mounted && createPortal(
        <div className="lg:hidden fixed top-0 inset-x-0 z-[1200] bg-white border-b border-gray-200 shadow-sm h-14 flex items-center px-3 gap-2">
          {/* Burger → opens global nav drawer */}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => document.dispatchEvent(new CustomEvent("open-mobile-menu"))}
            className="p-2 -ml-1 shrink-0 flex items-center justify-center text-[#004f32]"
          >
            <Icon name="navigator" size={20} />
          </button>

          {/* Headline + search icon — entire area opens search panel */}
          <button
            type="button"
            aria-label="Search & Filters"
            onClick={() => setSearchPanelOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--dark-grey)] truncate leading-tight">
                {headline}
              </div>
              <div className="text-[10px] text-[var(--espresso-brown)]/70 leading-tight">
                {loading && results.sites.length === 0 ? 0 : results.sites.length} of {results.total} results
              </div>
            </div>
            <Icon name="search" size={20} className="text-[var(--brand-orange)] shrink-0" />
          </button>
        </div>,
        document.body
      )}

      {/* ── Mobile Search Panel ── */}
      {mounted && searchPanelOpen && createPortal(
        <div className="lg:hidden fixed inset-0 z-[3200]">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${searchPanelVisible ? "opacity-100" : "opacity-0"}`}
            onClick={closeSearchPanel}
          />
          {/* Panel slides from right — uses `right` not transform to avoid stacking context issues */}
          <div
            className="absolute top-0 bottom-0 w-full bg-[var(--ivory-cream)] flex flex-col overflow-hidden transition-[right] duration-300 ease-out"
            style={{ right: searchPanelVisible ? 0 : "-100%" }}
          >
            {/* Panel header — fixed, not sticky — same pattern as HeritageTypeModal */}
            <div
              className="shrink-0 bg-white border-b border-gray-100 shadow-sm select-none"
              onTouchStart={(e) => { panelSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                if (!panelSwipeRef.current) return;
                const dx = e.changedTouches[0].clientX - panelSwipeRef.current.x;
                const dy = e.changedTouches[0].clientY - panelSwipeRef.current.y;
                panelSwipeRef.current = null;
                if ((Math.abs(dx) > Math.abs(dy) && dx > 60) || (Math.abs(dy) > Math.abs(dx) && dy > 60)) {
                  closeSearchPanel();
                }
              }}
            >
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
                <span className="text-base font-bold text-[var(--dark-grey)]">Search & Filters</span>
              </div>
            </div>

            {/* Scrollable content — flex-1 min-h-0 keeps it within screen bounds */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onSearch={() => { executeSearch(); closeSearchPanel(); }}
                onOpenNearbyModal={() => { closeSearchPanel(); setShowNearbyModal(true); }}
              />
              {hasRadius(filters) && centerSitePreview?.subtitle ? (
                <div className="px-4 pb-3 text-xs text-[var(--espresso-brown)]/80">
                  {centerSitePreview.subtitle}
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* Force dynamic rendering so cookies usage in the tree does not break static generation */
export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--ivory-cream)] flex items-center justify-center">
          <Spinner size={40} />
        </div>
      }
    >
      <ExplorePageContent />
    </Suspense>
  );
}
