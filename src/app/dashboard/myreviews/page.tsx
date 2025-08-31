"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { hardDeleteReview } from "@/lib/db/hardDelete";
import { Lightbox } from "@/components/ui/Lightbox"; // ✅ import universal lightbox
import type { LightboxPhoto } from "@/types/lightbox";

/* ---------- types ---------- */

type ReviewWithProfile = {
  id: string;
  user_id: string;
  site_id: string;
  rating: number;
  review_text: string | null;
  visited_year: number | null;
  visited_month: number | null;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  badge: string | null;
};

type ReviewPhoto = {
  id: string;
  review_id: string;
  storage_path: string;
  caption: string | null;
};

type SiteRow = {
  id: string;
  title: string;
};

type RegionRow = { id: string; name: string };
type CategoryRow = { id: string; name: string };

/* ---------- tiny skeleton utility ---------- */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

/* ---------- helpers ---------- */

function getPublicUrl(bucket: string, path: string) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function listUserReviews(userId: string): Promise<ReviewWithProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews_with_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReviewWithProfile[];
}

async function listReviewPhotos(reviewId: string): Promise<ReviewPhoto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("review_photos")
    .select("id, review_id, storage_path, caption")
    .eq("review_id", reviewId);
  if (error) throw error;
  return (data ?? []) as ReviewPhoto[];
}

async function fetchSitesByIds(ids: string[]): Promise<SiteRow[]> {
  if (!ids.length) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, title")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as SiteRow[];
}

async function countHelpfulFlexible(reviewId: string): Promise<number> {
  const supabase = createClient();
  try {
    const { count } = await supabase
      .from("review_helpful")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    if (typeof count === "number") return count;
  } catch {}
  try {
    const { count } = await supabase
      .from("review_likes")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    if (typeof count === "number") return count;
  } catch {}
  return 0;
}

async function fetchRegionLinks(siteIds: string[]) {
  if (!siteIds.length) return { siteToRegions: {}, distinctRegionIds: [] };
  const supabase = createClient();
  const { data } = await supabase
    .from("site_regions")
    .select("site_id, region_id")
    .in("site_id", siteIds);
  const siteToRegions: { [key: string]: string[] } = {};
  const set = new Set<string>();
  for (const row of data ?? []) {
    const s = row.site_id as string;
    const r = row.region_id as string;
    if (!siteToRegions[s]) siteToRegions[s] = [];
    siteToRegions[s].push(r);
    set.add(r);
  }
  return { siteToRegions, distinctRegionIds: Array.from(set) };
}

async function fetchCategoryLinks(siteIds: string[]) {
  if (!siteIds.length) return { siteToCategories: {}, distinctCategoryIds: [] };
  const supabase = createClient();
  const { data } = await supabase
    .from("site_categories")
    .select("site_id, category_id")
    .in("site_id", siteIds);
  const siteToCategories: { [key: string]: string[] } = {};
  const set = new Set<string>();
  for (const row of data ?? []) {
    const s = row.site_id as string;
    const c = row.category_id as string;
    if (!siteToCategories[s]) siteToCategories[s] = [];
    siteToCategories[s].push(c);
    set.add(c);
  }
  return { siteToCategories, distinctCategoryIds: Array.from(set) };
}

async function fetchRegionsByIds(ids: string[]): Promise<RegionRow[]> {
  if (!ids.length) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("regions")
    .select("id, name")
    .in("id", ids);
  return (data ?? []) as RegionRow[];
}

async function fetchCategoriesByIds(ids: string[]): Promise<CategoryRow[]> {
  if (!ids.length) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", ids);
  return (data ?? []) as CategoryRow[];
}

/* ---------- page-level skeletons ---------- */

function ReviewCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-28" />
      </div>

      <div className="mt-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="aspect-[4/3] w-full hidden sm:block" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-4 w-6" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-5xl mx-auto">
        <Skeleton className="h-7 w-44 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-4">
          <ReviewCardSkeleton />
          <ReviewCardSkeleton />
          <ReviewCardSkeleton />
        </div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function MyReviewsPage() {
  const { userId, authLoading, authError } = useAuthUserId();

  const [reviews, setReviews] = useState<ReviewWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [siteMap, setSiteMap] = useState<{ [key: string]: SiteRow }>({});
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [siteToRegions, setSiteToRegions] = useState<{
    [key: string]: string[];
  }>({});
  const [siteToCategories, setSiteToCategories] = useState<{
    [key: string]: string[];
  }>({});

  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setPageError(null);

        const rows = await listUserReviews(userId);
        setReviews(rows);
        const siteIds = Array.from(new Set(rows.map((r) => r.site_id)));

        const sites = await fetchSitesByIds(siteIds);
        const siteById: { [key: string]: SiteRow } = {};
        for (const s of sites) siteById[s.id] = s;
        setSiteMap(siteById);

        const [
          { siteToRegions, distinctRegionIds },
          { siteToCategories, distinctCategoryIds },
        ] = await Promise.all([
          fetchRegionLinks(siteIds),
          fetchCategoryLinks(siteIds),
        ]);
        setSiteToRegions(siteToRegions);
        setSiteToCategories(siteToCategories);

        const [regionRows, categoryRows] = await Promise.all([
          fetchRegionsByIds(distinctRegionIds),
          fetchCategoriesByIds(distinctCategoryIds),
        ]);
        setRegions(regionRows.sort((a, b) => a.name.localeCompare(b.name)));
        setCategories(
          categoryRows.sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch (e: any) {
        setPageError(e?.message ?? "Error loading reviews");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, userId]);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      const site = siteMap[r.site_id];
      const matchesQuery =
        !query ||
        (r.review_text ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (site?.title ?? "").toLowerCase().includes(query.toLowerCase());
      const siteRegions = siteToRegions[r.site_id] ?? [];
      const siteCategories = siteToCategories[r.site_id] ?? [];
      const matchesRegion = !regionFilter || siteRegions.includes(regionFilter);
      const matchesCategory =
        !categoryFilter || siteCategories.includes(categoryFilter);
      return matchesQuery && matchesRegion && matchesCategory;
    });
  }, [
    reviews,
    siteMap,
    query,
    regionFilter,
    categoryFilter,
    siteToRegions,
    siteToCategories,
  ]);

  async function handleDeletePermanently(id: string) {
    if (!userId) return;
    if (
      !confirm(
        "This will permanently delete your review AND its photos from storage. Continue?"
      )
    )
      return;
    try {
      setDeleting(id);
      await hardDeleteReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  // ✅ Page-level skeletons while auth or page data loads
  if (authLoading || loading) return <PageSkeleton />;

  if (authError) return <div className="p-6">Auth error: {authError}</div>;
  if (!userId)
    return <div className="p-6">Please sign in to view your reviews.</div>;
  if (pageError)
    return <div className="p-6 text-red-700">Error: {pageError}</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">My Reviews</h1>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reviews or site name…"
            className="border rounded-lg px-3 py-2 w-full"
          />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full"
          >
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 && (
          <p className="text-gray-600">No reviews found.</p>
        )}

        <div className="space-y-4">
          {filtered.map((r) => (
            <ReviewRowCard
              key={r.id}
              review={r}
              site={siteMap[r.site_id]}
              onDelete={() => handleDeletePermanently(r.id)}
              deleting={deleting === r.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- stars ---------- */
function Stars({ value }: { value: number }) {
  return (
    <div className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = value >= i + 1;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className={`h-5 w-5 ${filled ? "text-amber-500" : "text-gray-300"}`}
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        );
      })}
      <span className="ml-1 text-sm text-gray-700">{value.toFixed(1)}</span>
    </div>
  );
}

/* ---------- card ---------- */
function ReviewRowCard({
  review,
  site,
  onDelete,
  deleting,
}: {
  review: ReviewWithProfile;
  site?: SiteRow;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);
  const [helpful, setHelpful] = useState<number>(0);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(true);

  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setDetailsLoading(true);
      try {
        const [ph, hcount] = await Promise.all([
          listReviewPhotos(review.id),
          countHelpfulFlexible(review.id),
        ]);

        if (!isMounted) return;

        setHelpful(hcount);
        setPhotos(
          ph.map((p) => ({
            id: p.id,
            url: getPublicUrl("user-photos", p.storage_path),
            caption: p.caption,
            author: { name: review.full_name || "Traveler" },
            site: {
              id: site?.id || "",
              name: site?.title || "Unknown site",
              location: "",
              latitude: null,
              longitude: null,
              region: "",
              categories: [],
            },
            storagePath: p.storage_path,
          }))
        );
      } catch {
        if (!isMounted) return;
        setPhotos([]);
        setHelpful(0);
      } finally {
        if (isMounted) setDetailsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [review.id, review.full_name, site]);

  const visitedStr =
    review.visited_month && review.visited_year
      ? `${String(review.visited_month).padStart(2, "0")}/${
          review.visited_year
        }`
      : "Date not specified";
  const avatarSrc = review.avatar_url
    ? getPublicUrl("avatars", review.avatar_url)
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full overflow-hidden ring-2 ring-amber-400/60 bg-gray-100">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <Skeleton className="h-full w-full rounded-full" />
            )}
          </div>
          <div>
            <div className="font-semibold">
              {review.full_name || "Traveler"}
            </div>
            {review.badge ? (
              <div className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs">
                {review.badge}
              </div>
            ) : (
              <div className="mt-0.5">
                <Skeleton className="h-4 w-20" />
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={deleting}
          className={`text-sm px-3 py-1.5 rounded border ${
            deleting
              ? "opacity-60 cursor-not-allowed"
              : "text-red-600 border-red-200 hover:bg-red-50"
          }`}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      {/* Site + rating */}
      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-base font-bold">
            {site?.title ?? "Unknown site"}
          </div>
          <div className="text-xs text-gray-500">{visitedStr}</div>
        </div>
        <Stars value={review.rating} />
      </div>

      {/* Review text */}
      {review.review_text ? (
        <p className="mt-2 whitespace-pre-wrap text-gray-800">
          {review.review_text}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}

      {/* Photos (with per-card skeletons) */}
      {detailsLoading ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="aspect-[4/3] w-full hidden sm:block" />
        </div>
      ) : photos.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setLbIndex(idx);
                setLbOpen(true);
              }}
              className="relative aspect-[4/3] rounded-lg overflow-hidden group cursor-pointer"
            >
              <Image
                src={p.url}
                alt={p.caption ?? "photo"}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width:640px) 50vw, 33vw"
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* Helpful (with per-card skeleton) */}
      {detailsLoading ? (
        <div className="mt-3 flex items-center gap-2">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-48" />
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <span className="text-emerald-600">👍</span>
          <span>{helpful}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">people found this helpful</span>
        </div>
      )}

      {/* ✅ Universal Lightbox */}
      {lbOpen && (
        <Lightbox
          photos={photos}
          startIndex={lbIndex}
          onClose={() => setLbOpen(false)}
        />
      )}
    </div>
  );
}
