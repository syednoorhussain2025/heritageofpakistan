"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
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
import { getPublicClient } from "@/lib/supabase/browser";
import SitePreviewCard from "@/components/SitePreviewCard";
import SiteBottomSheet from "@/components/SiteBottomSheet";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import NearbySearchModal from "@/components/NearbySearchModal";
import Icon from "@/components/Icon";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { useQuery } from "@tanstack/react-query";
import { Spinner as LottieSpinner } from "@/components/ui/Spinner";

const PAGE_SIZE = 12;
const QUERY_TIMEOUT_MS = 12000;
const SEARCH_RPC_TIMEOUT_MS = 30000;
const SEARCH_FALLBACK_TIMEOUT_MS = 12000;

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
  tagline?: string | null;
  cover_slideshow_image_ids?: string[] | null;
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
  forceFallback?: boolean;
  signal?: AbortSignal;
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
  signal,
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
    "tagline",
    "cover_slideshow_image_ids",
    "created_at",
    ...joinSelectParts,
  ].join(",");

  const sb = getPublicClient();
  let q = sb
    .from("sites")
    .select(selectCols, { count: "planned" })
    .eq("is_published", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);
  if (signal) q = q.abortSignal(signal);

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
  forceFallback = false,
  signal,
}: SearchSitesRpcArgs) {
  if (forceFallback) {
    const fallbackRows = await withTimeout(
      fetchSearchSitesFallback({
        nameQuery,
        categoryIds,
        regionIds,
        page,
        pageSize,
        signal,
      }),
      SEARCH_FALLBACK_TIMEOUT_MS,
      `${label}.fallback`
    );
    return { data: fallbackRows, error: null };
  }
  try {
    /* .abortSignal() propagates the AbortSignal into the underlying fetch() call.
     * When the signal fires (our 5-second tab-restore timeout OR React Query cancel),
     * the browser actually closes the TCP connection — not just rejects the Promise.
     * This means a retry will always use a fresh TCP connection, not the stale one. */
    let rpcQuery = getPublicClient().rpc("search_sites", {
      p_name_query: nameQuery.trim() || null,
      p_category_ids: categoryIds.length > 0 ? categoryIds : null,
      p_region_ids: regionIds.length > 0 ? regionIds : null,
      p_order_by: "latest",
      p_page: page,
      p_page_size: pageSize,
    });
    if (signal) rpcQuery = rpcQuery.abortSignal(signal);
    return await withTimeout(rpcQuery, SEARCH_RPC_TIMEOUT_MS, label);
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    console.warn(`[Explore] ${label} timed out, using fallback query path.`);
    const fallbackRows = await withTimeout(
      fetchSearchSitesFallback({
        nameQuery,
        categoryIds,
        regionIds,
        page,
        pageSize,
        signal,
      }),
      SEARCH_FALLBACK_TIMEOUT_MS,
      `${label}.fallbackAfterTimeout`
    );
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

export type ExploreFirstPageResult = {
  sites: Site[];
  total: number;
  radiusAllRows: any[] | null;
  centerSiteTitle: string | null;
  centerSitePreview: { id: string; title: string; subtitle?: string | null; cover?: string | null } | null;
};

/** Pure async fetch for first page – used by React Query for cache + refetch-on-focus. */
async function fetchExploreFirstPage(
  searchParams: URLSearchParams,
  isSignedIn: boolean,
  signal?: AbortSignal
): Promise<ExploreFirstPageResult> {
  const nameQuery = searchParams.get("q") || "";
  const catsQuery = parseMulti(searchParams.get("cats"));
  const regsQuery = parseMulti(searchParams.get("regs"));
  const centerSiteId = searchParams.get("center") || null;
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
    centerSiteId,
    centerLat: typeof parsedCenterLat === "number" && !Number.isNaN(parsedCenterLat) ? parsedCenterLat : null,
    centerLng: typeof parsedCenterLng === "number" && !Number.isNaN(parsedCenterLng) ? parsedCenterLng : null,
    radiusKm: typeof parsedRadiusKm === "number" && !Number.isNaN(parsedRadiusKm) ? parsedRadiusKm : null,
  };

  if (hasRadius(nextFilters)) {
    const [bannerResult, radiusRows] = await Promise.all([
      nextFilters.centerSiteId
        ? (async () => {
            const { data: row, error: err } = await withTimeout(
              getPublicClient()
                .from("sites")
                .select("id,title,location_free,cover_photo_url")
                .eq("id", nextFilters.centerSiteId!)
                .eq("is_published", true)
                .is("deleted_at", null)
                .maybeSingle(),
              QUERY_TIMEOUT_MS,
              "explore.loadCenterSite"
            );
            if (err || !row) return null;
            const { data: coverRow } = await withTimeout(
              getPublicClient()
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
      withTimeout(fetchSitesByFilters(nextFilters), QUERY_TIMEOUT_MS, "explore.fetchSitesByFilters"),
    ]);

    let distanceOrdered = [...radiusRows].sort(
      (a: any, b: any) => (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY)
    );
    const allIds = distanceOrdered.map((r: any) => r.id);
    const selectedTypes = new Set(getSelectedTypes(nextFilters));
    const [pairsResult, attrsResult] = await Promise.all([
      allIds.length && nextFilters.categoryIds?.length
        ? withTimeout(
            getPublicClient()
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
            getPublicClient()
              .from("sites")
              .select("id,heritage_type")
              .eq("is_published", true)
              .is("deleted_at", null)
              .in("id", allIds),
            QUERY_TIMEOUT_MS,
            "explore.filterByTypes"
          )
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (pairsResult.error) throw pairsResult.error;
    if (pairsResult.data) {
      const allowed = new Set((pairsResult.data as any[]).map((p: any) => p.site_id));
      distanceOrdered = distanceOrdered.filter((r: any) => allowed.has(r.id));
    }
    if (attrsResult.data && selectedTypes.size > 0) {
      const typeById = new Map((attrsResult.data as any[]).map((s: any) => [s.id, s.heritage_type ?? null]));
      distanceOrdered = distanceOrdered.filter((r: any) => {
        const ht = typeById.get(r.id);
        return ht && selectedTypes.has(ht);
      });
    }
    const total = distanceOrdered.length;
    const pageRows = distanceOrdered.slice(0, PAGE_SIZE);
    const ids = pageRows.map((r: any) => r.id);
    if (!ids.length) {
      return {
        sites: [],
        total,
        radiusAllRows: distanceOrdered,
        centerSiteTitle: bannerResult?.row ? (bannerResult.row.title ?? null) : null,
        centerSitePreview: bannerResult?.row
          ? { id: bannerResult.row.id, title: bannerResult.row.title ?? "", subtitle: bannerResult.row.location_free ?? null, cover: bannerResult.cover ?? null }
          : null,
      };
    }
    const { data: details, error: detailsErr } = await withTimeout(
      getPublicClient()
        .from("sites")
        .select("id,slug,province_id,title,cover_photo_url,cover_photo_thumb_url,location_free,heritage_type,avg_rating,review_count,tagline,cover_slideshow_image_ids")
        .eq("is_published", true)
        .is("deleted_at", null)
        .in("id", ids),
      QUERY_TIMEOUT_MS,
      "explore.loadRadiusPageDetails"
    );
    if (detailsErr) throw detailsErr;
    await Promise.all([
      ensureProvinceSlugOnSites(details as Site[]),
      attachActiveCovers(details as Site[]),
    ]);
    const distanceById = new Map<string, number | null>(pageRows.map((r: any) => [r.id, r.distance_km ?? null]));
    const byId = new Map<string, Site>((details as Site[]).map((d) => [d.id, d]));
    const ordered: Site[] = ids
      .map((id) => {
        const base = byId.get(id);
        if (!base) return null;
        return { ...base, distance_km: distanceById.get(id) ?? null };
      })
      .filter(Boolean) as Site[];
    return {
      sites: ordered,
      total,
      radiusAllRows: distanceOrdered,
      centerSiteTitle: bannerResult?.row ? (bannerResult.row.title ?? null) : null,
      centerSitePreview: bannerResult?.row
        ? { id: bannerResult.row.id, title: bannerResult.row.title ?? "", subtitle: bannerResult.row.location_free ?? null, cover: bannerResult.cover ?? null }
        : null,
    };
  }

  const { data, error: rpcError } = await searchSitesRpc({
    nameQuery,
    categoryIds: catsQuery,
    regionIds: regsQuery,
    page: 1,
    pageSize: PAGE_SIZE,
    label: "explore.searchSitesPage1",
    forceFallback: false,
    signal,
  });
  if (rpcError) throw rpcError;
  const sites = ((data as any[]) || []) as Site[];
  const total = (data as any[])?.[0]?.total_count || 0;
  await Promise.all([ensureProvinceSlugOnSites(sites), attachActiveCovers(sites), attachSlideshowAndTagline(sites)]);
  return {
    sites,
    total,
    radiusAllRows: null,
    centerSiteTitle: null,
    centerSitePreview: null,
  };
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

/** Thumbnail URL without Supabase image transformations (for banner avatar). */
function thumbUrl(input?: string | null, _size = 160) {
  return getThumbOrVariantUrlNoTransform(input ?? "", "md") || "";
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

  if (!src) {
    return
      <div className="w-14 h-14 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40" />;
  }

  return (
    <img
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
      const { data } = await getPublicClient().from("provinces").select("id, slug");
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
    getPublicClient().from("sites").select("id, province_id").in("id", ids),
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

/* ── Attach slideshow IDs + tagline (missing from search_sites RPC) ── */
async function attachSlideshowAndTagline(sites: Site[]) {
  const needsPatch = sites.filter(
    (s) => s.cover_slideshow_image_ids === undefined || s.tagline === undefined
  );
  if (!needsPatch.length) return;
  const ids = Array.from(new Set(needsPatch.map((s) => s.id))).filter(Boolean);
  const { data, error } = await withTimeout(
    getPublicClient()
      .from("sites")
      .select("id, cover_slideshow_image_ids, tagline")
      .in("id", ids),
    QUERY_TIMEOUT_MS,
    "explore.attachSlideshowAndTagline"
  );
  if (error || !data) return;
  type Row = { id: string; cover_slideshow_image_ids: string[] | null; tagline: string | null };
  const byId = new Map<string, Row>((data as Row[]).map((r) => [r.id, r]));
  for (const s of needsPatch) {
    const row = byId.get(s.id);
    if (!row) continue;
    s.cover_slideshow_image_ids = row.cover_slideshow_image_ids ?? null;
    s.tagline = row.tagline ?? null;
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
              getPublicClient()
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
              getPublicClient()
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
              getPublicClient()
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
  // Stable string key — avoids infinite loops when useSearchParams() returns
  // a new object reference with identical content on each render.
  const searchParamsStr = searchParams.toString();
  const { userId: authUserId, authLoading } = useAuthUserId();
  const isSignedIn = !authLoading && authUserId !== null;

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
  // Synchronous ref guard for loadMore — prevents the IntersectionObserver
  // from firing a second fetch before the isLoadingMore state update commits.
  const isLoadingMoreRef = useRef(false);

  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [showNearbyModal, setShowNearbyModal] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchPanelClosing, setSearchPanelClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const safeTop = "var(--sat, 44px)";

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ sites: Site[]; total: number }>({
    sites: [],
    total: 0,
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* When tab becomes visible, unstick load-more if it was in progress (browser may throttle/cancel in background) */
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    loadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (loadingMoreRef.current) {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /* React Query: cache + refetch on window focus (stale-while-revalidate – no stuck spinner).
   *
   * Use a short AbortController timeout so stale TCP connections (which can linger after
   * tab switches) are detected quickly and the retry opens a fresh connection. */
  const ABORT_MS = 8000;
  const query = useQuery({
    queryKey: ["explore", searchParams.toString()],
    queryFn: async ({ signal: rqSignal }) => {
      /* Merge React Query's signal with our own abort timer so we:
       *   - respect React Query cancellations (unmount / key change)
       *   - cut stale TCP connections quickly so the retry opens a fresh one */
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(new Error(`explore.staleConn abort after ${ABORT_MS}ms`)), ABORT_MS);
      // Propagate React Query cancel → our controller
      rqSignal?.addEventListener("abort", () => controller.abort());

      try {
        return await fetchExploreFirstPage(searchParams, isSignedIn, controller.signal);
      } finally {
        clearTimeout(abortTimer);
      }
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
  const loading = query.isLoading || query.isFetching || isFiltering;
  useEffect(() => {
    if (query.error) {
      setError((query.error as Error)?.message ?? "Failed to load results");
      setIsFiltering(false);
    } else if (query.data) {
      setError(null);
      setResults({ sites: query.data.sites, total: query.data.total });
      setCenterSiteTitle(query.data.centerSiteTitle);
      setCenterSitePreview(query.data.centerSitePreview);
      setRadiusAllRows(query.data.radiusAllRows);
      isHydratingRef.current = false;
      setIsFiltering(false);
    }
  }, [query.data, query.error]);

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
        radiusKm: !Number.isNaN(parsedRkm) ? parsedRkm : 5,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsStr, router]);

  /* Load name maps once + pre-warm province slug cache in parallel */
  useEffect(() => {
    // Start province slug cache loading immediately — it will be ready
    // by the time the first search completes, making ensureProvinceSlugOnSites a cache hit.
    warmProvinceSlugCache();

    (async () => {
      try {
        const [{ data: cats }, { data: regs }] = await withTimeout(
          Promise.all([
            getPublicClient().from("categories").select("id,name").order("name"),
            getPublicClient().from("regions").select("id,name").order("name"),
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

  const handleReset = useCallback(() => {
    const reset: Filters = { name: "", categoryIds: [], regionIds: [], orderBy: "latest", centerSiteId: null, centerLat: null, centerLng: null, radiusKm: null };
    setFilters(reset);
    filtersRef.current = reset;
    const params = buildParamsFrom(reset);
    if (searchParams.toString() !== params.toString()) {
      router.push(`/explore?${params.toString()}`);
    }
  }, [buildParamsFrom, router, searchParams]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, buildParamsFrom, router, searchParamsStr]);

  /* Sync URL → filters and reset page when search params change */
  useEffect(() => {
    const nameQuery = searchParams.get("q") || "";
    const catsQuery = parseMulti(searchParams.get("cats"));
    const regsQuery = parseMulti(searchParams.get("regs"));
    const centerSiteId = searchParams.get("center") || null;
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
      centerSiteId,
      centerLat: typeof parsedCenterLat === "number" && !Number.isNaN(parsedCenterLat) ? parsedCenterLat : null,
      centerLng: typeof parsedCenterLng === "number" && !Number.isNaN(parsedCenterLng) ? parsedCenterLng : null,
      radiusKm: typeof parsedRadiusKm === "number" && !Number.isNaN(parsedRadiusKm) ? parsedRadiusKm : null,
    };
    isHydratingRef.current = true;
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    setPage(1);
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    const t = setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsStr]);

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
  const mobileLoadMoreRef = useRef<HTMLDivElement | null>(null);

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
    if (loading || isLoadingMore || isLoadingMoreRef.current) return;
    if (!hasMore) return;

    const currentFilters = filtersRef.current;
    isLoadingMoreRef.current = true;
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
          getPublicClient()
            .from("sites")
            .select(
              "id,slug,province_id,title,cover_photo_url,cover_photo_thumb_url,location_free,heritage_type,avg_rating,review_count,tagline,cover_slideshow_image_ids"
            )
            .eq("is_published", true)
            .is("deleted_at", null)
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
      const controller = new AbortController();
      const abortTimer = window.setTimeout(
        () =>
          controller.abort(
            new Error("explore.searchSitesLoadMore abort after 8000ms")
          ),
        8000
      );

      const nameQuery = searchParams.get("q") || "";
      const catsQuery = parseMulti(searchParams.get("cats"));
      const regsQuery = parseMulti(searchParams.get("regs"));

      const { data, error: rpcError } = await (async () => {
        try {
          return await searchSitesRpc({
            nameQuery,
            categoryIds: catsQuery,
            regionIds: regsQuery,
            page: nextPage,
            pageSize: PAGE_SIZE,
            label: "explore.searchSitesLoadMore",
            forceFallback: false,
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(abortTimer);
        }
      })();
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
        attachSlideshowAndTagline(newSites),
      ]);

      setResults((prev) => ({
        sites: [...prev.sites, ...newSites],
        total: newTotal || prev.total,
      }));
      setPage(nextPage);
    } catch (e: any) {
      setError(e?.message || "Failed to load results");
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [
    loading,
    isLoadingMore,
    hasMore,
    radiusAllRows,
    page,
    searchParams,
    isSignedIn,
    results.total,
  ]);

  /* IntersectionObserver for infinite scroll */
  useEffect(() => {
    if (!hasMore) return;
    const observers: IntersectionObserver[] = [];
    [loadMoreRef.current, mobileLoadMoreRef.current].forEach((el) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) loadMore(); },
        { rootMargin: "200px" }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
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
                handleFilterChange({ ...clearPlacesNearby(), centerSiteTitle: null });
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
  useEffect(() => {
    setMounted(true);
  }, []);


  const setPushTransform = useCallback((value: string | null, animate: boolean) => {
    const el = document.getElementById("explore-mobile-shell");
    if (!el) return;
    el.style.transition = animate ? "transform 0.5s cubic-bezier(0.25,0.1,0.25,1)" : "none";
    el.style.transform = value === null ? "" : value;
  }, []);

  const closeSearchPanel = useCallback(() => {
    setPushTransform("translateX(0)", true);
    setSearchPanelClosing(true);
  }, [setPushTransform]);

  // Push parallax when panel opens.
  // Two-step: (1) synchronously plant translateX(0) with transition:none so the
  // element is at a known starting position regardless of any prior interrupted
  // animation, (2) in the next frame switch to translateX(-173px) with the
  // animated transition. Forces the browser to register a style change and run
  // the transition instead of coalescing both writes into one recalc.
  useEffect(() => {
    if (!searchPanelOpen) return;
    const el = document.getElementById("explore-mobile-shell");
    if (!el) return;
    // Step 1: plant start position with no transition
    el.style.transition = "none";
    el.style.transform = "translateX(0)";
    // Force reflow so the browser commits step 1 before step 2
    void el.offsetWidth;
    // Step 2: animate to pushed position
    el.style.transition = "transform 0.5s cubic-bezier(0.25,0.1,0.25,1)";
    el.style.transform = "translateX(-173px)";
  }, [searchPanelOpen]);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (searchPanelOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [searchPanelOpen]);

  // When TabShell hides this pane, force-close the panel immediately
  useEffect(() => {
    const handler = () => {
      document.body.style.overflow = "";
      setPushTransform(null, false);
      setSearchPanelOpen(false);
      setSearchPanelClosing(false);
      setShowNearbyModal(false);
    };
    document.addEventListener("tab-hidden", handler);
    return () => document.removeEventListener("tab-hidden", handler);
  }, [setPushTransform]);

  return (
    <div id="explore-page-root" className="relative lg:min-h-screen bg-[#f2f2f2] lg:bg-[var(--ivory-cream)] lg:pt-0">
      <div
        id="explore-mobile-shell"
        className="lg:hidden fixed inset-0 z-[1100] pointer-events-none bg-[var(--brand-green)] overflow-hidden"
        style={{ contain: "style" }}
      >
      {/* ── Mobile: teal header (matches Home) ── */}
      <button
        id="explore-mobile-header"
        type="button"
        aria-label="Search & Filters"
        onClick={() => { setSearchPanelClosing(false); setSearchPanelOpen(true); }}
        className="absolute inset-x-0 top-0 bg-[var(--brand-green)] text-left pointer-events-auto"
        style={{ paddingTop: "var(--tab-title-top)", paddingBottom: "16px" }}
      >
        <div className="flex items-center justify-between px-4">
          <div className="w-[58px]" />
          <div className="flex-1 text-center">
            {headline === "All Heritage Sites in Pakistan" ? (
              <span className="tab-header-title">Explore</span>
            ) : (
              <span className="tab-header-title" style={{ fontSize: "15px", fontWeight: 600 }}>{headline}</span>
            )}
          </div>
          <div className="w-[58px] flex justify-end">
            <div className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20">
              <Icon name="search" size={20} className="text-white" />
            </div>
          </div>
        </div>
      </button>

      {/* ── Mobile content card (inside shell, absolutely positioned so scaling
          the shell scales card + header together as one coherent surface) ── */}
      <div
        id="explore-mobile-content"
        className="absolute inset-x-0 bg-[#f2f2f2] rounded-t-[32px] overflow-y-auto px-4 pt-4 pb-8 pointer-events-auto"
        style={{ top: `calc(var(--tab-title-top) + 56px)`, bottom: `calc(52px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="relative">
          {isFiltering && (
            <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-[4000]">
              <LottieSpinner size={80} />
            </div>
          )}
          <div
            className="grid grid-cols-2 gap-4"
            style={{ opacity: 1 }}
          >
            {error && results.sites.length === 0 && !loading ? (
              <div className="p-6 col-span-2">{error}</div>
            ) : results.sites.length === 0 && !loading ? (
              <div className="p-6 col-span-2 text-gray-500">No sites match your filters.</div>
            ) : (
              results.sites.map((s, index) => (
                <SitePreviewCard key={s.id} site={s} index={index} onCardClick={() => setSelectedSite(s)} />
              ))
            )}
          </div>
          {results.sites.length > 0 && (
            <div ref={mobileLoadMoreRef} className="flex items-center justify-center py-6">
              {hasMore && isLoadingMore && <LottieSpinner size={32} />}
            </div>
          )}
        </div>
      </div>
      </div>
      {/* ── /Mobile shell ── */}

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

      <div className="lg:relative lg:z-10">
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

          <main className="lg:ml-[380px] w-full">
            {/* ── Desktop layout ── */}
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

            {/* Grid — desktop only (mobile uses the fixed card above) */}
            <div className="hidden lg:block">
              <div className={`relative${loading && results.sites.length === 0 ? " min-h-[320px]" : ""}`}>
                {loading && results.sites.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                    <LottieSpinner size={40} />
                  </div>
                )}
                <div
                  ref={cardsRef}
                  className="grid grid-cols-2 xl:grid-cols-3 gap-5"
                  style={{ opacity: 1 }}
                >
                  {error && results.sites.length === 0 && !loading ? (
                    <div className="p-6 text:[var(--terracotta-red)] sm:col-span-3">{error}</div>
                  ) : results.sites.length === 0 && !loading ? (
                    <div className="p-6 text-[var(--espresso-brown)]/80 sm:col-span-3">No sites match your filters.</div>
                  ) : (
                    results.sites.map((s, index) => (
                      <SitePreviewCard key={s.id} site={s} index={index} onCardClick={() => setSelectedSite(s)} />
                    ))
                  )}
                </div>
                {results.sites.length > 0 && (
                  <div ref={loadMoreRef} className="flex items-center justify-center py-6">
                    {hasMore && isLoadingMore && <LottieSpinner size={32} />}
                  </div>
                )}
              </div>
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

      {/* ── Mobile Search Panel — full-screen slide-in from right ── */}
      {mounted && searchPanelOpen && createPortal(
        <>
          {/* Backdrop (light, same as TravelGuideSheet) */}
          <div
            className="lg:hidden fixed inset-0 z-[4999]"
            style={{
              backgroundColor: "rgba(0,0,0,0)",
              animation: searchPanelClosing
                ? "sideSheetBackdropOut 0.35s ease-in forwards"
                : "sideSheetBackdropIn 0.72s ease-out forwards",
            }}
          />
          {/* Full-screen panel */}
          <div
            className={`lg:hidden fixed inset-0 z-[5000] bg-[var(--ivory-cream)] flex flex-col ${searchPanelClosing ? "animate-side-sheet-out" : "animate-side-sheet-in"}`}
            onAnimationEnd={() => {
              if (searchPanelClosing) {
                setSearchPanelOpen(false);
                setSearchPanelClosing(false);
                // Fully clear the transform so nothing lingers on the fixed elements
                setPushTransform(null, false);
              }
            }}
          >
            {/* Header — back button left, title center */}
            <div
              className="shrink-0 bg-white border-b border-gray-100 flex items-center px-4 gap-3"
              style={{ paddingTop: "calc(var(--sat, 44px) + 10px)", paddingBottom: "14px" }}
            >
              <button
                type="button"
                onClick={closeSearchPanel}
                aria-label="Back"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-600 shrink-0"
              >
                <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
                  <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
                </svg>
              </button>
              <div className="flex-1 flex flex-col">
                <span className="text-base font-extrabold text-[var(--dark-grey)] leading-tight">Search & Filters</span>
                <span className="text-[0.7rem] text-gray-400 leading-tight">Heritage sites of Pakistan</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-[var(--brand-orange)] font-semibold shrink-0 px-2 py-1 rounded-lg hover:bg-[var(--brand-orange)]/10 transition-colors"
              >
                Reset
              </button>
            </div>

            {/* Scrollable filter content */}
            <div className="flex-1 min-h-0 overflow-y-auto touch-auto overscroll-contain">
              <SearchFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onSearch={() => { setIsFiltering(true); executeSearch(); closeSearchPanel(); }}
                onOpenNearbyModal={() => { closeSearchPanel(); setTimeout(() => setShowNearbyModal(true), 340); }}
                hideFooter
                hideHeading
              />
              {hasRadius(filters) && centerSitePreview?.subtitle ? (
                <div className="px-4 pb-3 text-xs text-[var(--espresso-brown)]/80">
                  {centerSitePreview.subtitle}
                </div>
              ) : null}
            </div>

            {/* Fixed Search button at bottom */}
            <div
              className="shrink-0 bg-white border-t border-gray-100 px-4 pt-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 12px)" }}
            >
              <button
                type="button"
                onClick={() => { setIsFiltering(true); executeSearch(); closeSearchPanel(); }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand-orange)] py-3.5 text-[15px] font-bold text-white shadow-md active:opacity-80 transition-opacity"
              >
                <Icon name="search" size={15} />
                Search Results
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Mobile site bottom sheet */}
      <SiteBottomSheet
        site={selectedSite}
        isOpen={selectedSite !== null}
        onClose={() => setSelectedSite(null)}
      />
    </div>
  );
}

export default function ExploreClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--ivory-cream)] flex items-center justify-center">
          <LottieSpinner size={40} />
        </div>
      }
    >
      <ExplorePageContent />
    </Suspense>
  );
}
