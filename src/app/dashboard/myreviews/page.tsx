"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabaseClient";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { hardDeleteReview } from "@/lib/db/hardDelete";

/* ---------- types ---------- */

type ReviewRow = {
  id: string;
  user_id: string;
  site_id: string;
  rating: number;
  review_text: string | null;
  visited_year: number | null;
  visited_month: number | null;
  created_at: string;
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

type ProfileRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  badge: string | null;
};

/* ---------- helpers ---------- */

function getPublicUrl(bucket: string, path: string) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function listUserReviews(userId: string): Promise<ReviewRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, user_id, site_id, rating, review_text, visited_year, visited_month, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
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

async function fetchMyProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, badge")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow) || null;
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

async function fetchRegionLinks(siteIds: string[]): Promise<{
  siteToRegions: Record<string, string[]>;
  distinctRegionIds: string[];
}> {
  if (!siteIds.length) return { siteToRegions: {}, distinctRegionIds: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_regions")
    .select("site_id, region_id")
    .in("site_id", siteIds);
  if (error) throw error;
  const siteToRegions: Record<string, string[]> = {};
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

async function fetchCategoryLinks(siteIds: string[]): Promise<{
  siteToCategories: Record<string, string[]>;
  distinctCategoryIds: string[];
}> {
  if (!siteIds.length) return { siteToCategories: {}, distinctCategoryIds: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_categories")
    .select("site_id, category_id")
    .in("site_id", siteIds);
  if (error) throw error;
  const siteToCategories: Record<string, string[]> = {};
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
  const { data, error } = await supabase
    .from("regions")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as RegionRow[];
}

async function fetchCategoriesByIds(ids: string[]): Promise<CategoryRow[]> {
  if (!ids.length) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

/* ---------- page ---------- */

export default function MyReviewsPage() {
  const { userId, authLoading, authError } = useAuthUserId();

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [siteMap, setSiteMap] = useState<Record<string, SiteRow>>({});
  const [siteToRegions, setSiteToRegions] = useState<Record<string, string[]>>(
    {}
  );
  const [siteToCategories, setSiteToCategories] = useState<
    Record<string, string[]>
  >({});

  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

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

        const [rows, me] = await Promise.all([
          listUserReviews(userId),
          fetchMyProfile(userId),
        ]);
        setReviews(rows);
        setProfile(me);

        const siteIds = Array.from(new Set(rows.map((r) => r.site_id)));

        const sites = await fetchSitesByIds(siteIds);
        const siteById: Record<string, SiteRow> = {};
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

  // Keep hooks above early returns
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
    const confirmDelete = confirm(
      "This will permanently delete your review AND its photos from storage. Continue?"
    );
    if (!confirmDelete) return;

    try {
      setDeleting(id);
      await hardDeleteReview(id, userId);
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      const msg =
        e?.message || e?.details || e?.hint || "Failed to delete review.";
      alert(msg);
      console.error("hardDeleteReview failed:", e);
    } finally {
      setDeleting(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="h-7 w-40 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="flex gap-3 mb-5">
            <div className="h-10 flex-1 rounded bg-gray-200 animate-pulse" />
            <div className="h-10 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="h-10 w-48 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 bg-white shadow-lg shadow-gray-200/60 backdrop-blur-sm p-4"
              >
                <div className="flex gap-3">
                  <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 w-56 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((__, j) => (
                    <div
                      key={j}
                      className="h-24 bg-gray-200 rounded animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (authError)
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 max-w-5xl mx-auto">
          <p className="text-red-600">Auth error: {authError}</p>
        </div>
      </div>
    );
  if (!userId)
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 max-w-5xl mx-auto">
          <p>Please sign in to view your reviews.</p>
        </div>
      </div>
    );
  if (pageError)
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6 max-w-5xl mx-auto">
          <p className="text-red-600">Error: {pageError}</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">My Reviews</h1>

        {/* Top controls: search + filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reviews or site name…"
            className="border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-300"
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
            className="border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-300"
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
              profile={profile}
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
  profile,
}: {
  review: ReviewRow;
  site?: SiteRow;
  onDelete: () => void;
  deleting: boolean;
  profile: ProfileRow | null;
}) {
  const [photos, setPhotos] = useState<
    { url: string; caption: string | null }[]
  >([]);
  const [helpful, setHelpful] = useState<number>(0);

  // lightbox
  const [lbOpen, setLbOpen] = useState(false);
  const [lbIndex, setLbIndex] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [ph, hcount] = await Promise.all([
          listReviewPhotos(review.id),
          countHelpfulFlexible(review.id),
        ]);
        setHelpful(hcount);
        setPhotos(
          ph.map((p) => ({
            url: getPublicUrl("user-photos", p.storage_path),
            caption: p.caption,
          }))
        );
      } catch {
        setPhotos([]);
        setHelpful(0);
      }
    })();
  }, [review.id]);

  const visitedStr =
    review.visited_month && review.visited_year
      ? `${String(review.visited_month).padStart(2, "0")}/${
          review.visited_year
        }`
      : "Date not specified";

  const displayName = profile?.full_name || profile?.username || "Traveler";

  const avatarSrc = profile?.avatar_url
    ? /^https?:\/\//i.test(profile.avatar_url)
      ? profile.avatar_url
      : getPublicUrl("avatars", profile.avatar_url)
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg shadow-gray-200/60 backdrop-blur-[2px] p-4">
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
              <div className="h-full w-full" />
            )}
          </div>
          <div>
            <div className="font-semibold leading-5">{displayName}</div>
            {profile?.badge && (
              <div className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs">
                {profile.badge}
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
          title="Delete permanently"
        >
          {deleting ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              Deleting…
            </span>
          ) : (
            "Delete"
          )}
        </button>
      </div>

      {/* Site + rating + meta */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-bold truncate">
            {site?.title ?? "Unknown site"}
          </div>
          <div className="text-xs text-gray-500">{visitedStr}</div>
        </div>
        <Stars value={review.rating} />
      </div>

      {/* Review text */}
      {review.review_text && (
        <p className="mt-2 whitespace-pre-wrap text-gray-800">
          {review.review_text}
        </p>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setLbIndex(idx);
                setLbOpen(true);
              }}
              className="relative aspect-[4/3] rounded-lg overflow-hidden group cursor-pointer"
              aria-label="Open photo"
            >
              <Image
                src={p.url}
                alt={p.caption ?? "photo"}
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                sizes="(max-width:640px) 50vw, 33vw"
              />
              <div className="absolute inset-0 ring-1 ring-black/5 group-hover:ring-black/10" />
            </button>
          ))}
        </div>
      )}

      {/* Helpful */}
      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 text-emerald-600"
          fill="currentColor"
        >
          <path d="M9 21h6a2 2 0 0 0 2-2v-7h3l-1.34-5.36A2 2 0 0 0 16.72 5H13l.34-2.36A2 2 0 0 0 11.36 0L6 8v11a2 2 0 0 0 2 2z" />
        </svg>
        <span>{helpful}</span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-500">people found this helpful</span>
      </div>

      {/* Full-screen Lightbox */}
      {lbOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => setLbOpen(false)}
        >
          <div
            className="relative w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[lbIndex].url}
              alt={photos[lbIndex].caption ?? "photo"}
              className="max-h-screen max-w-screen object-contain mx-auto"
            />
            {/* Close */}
            <button
              className="absolute top-4 right-4 text-white/90 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-3"
              onClick={() => setLbOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
            {/* Prev/Next */}
            {photos.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-3"
                  onClick={() =>
                    setLbIndex((i) => (i - 1 + photos.length) % photos.length)
                  }
                  aria-label="Prev"
                >
                  ‹
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-3"
                  onClick={() => setLbIndex((i) => (i + 1) % photos.length)}
                  aria-label="Next"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
