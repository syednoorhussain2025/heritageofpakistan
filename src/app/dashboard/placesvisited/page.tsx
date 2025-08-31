// src/app/dashboard/placesvisited/page.tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { countUserVisits } from "@/lib/db/visited";
import { listUserReviews, ReviewRow } from "@/lib/db/reviews";
import { progressToNextBadge, BADGE_TIERS } from "@/lib/db/badges";
import { createClient } from "@/lib/supabaseClient";
import Image from "next/image";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import Icon from "@/components/Icon";
import { useProfile } from "@/components/ProfileProvider"; // ✅ Global profile
import type { UserSite } from "@/components/UserVisitedMap";

/* --------------------------- Skeleton utilities --------------------------- */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

function AvatarSkeleton() {
  return <Skeleton className="relative w-20 h-20 rounded-full" />;
}

function StatSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="w-16 h-16 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-64" />
      <Skeleton className="h-3 w-full rounded-full" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="text-center">
      <Skeleton className="relative w-40 h-40 mx-auto rounded-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-32 mx-auto" />
        <div className="flex items-center justify-center gap-1">
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-3 w-28 mx-auto" />
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <Skeleton className="h-8 w-56 mb-4" />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <AvatarSkeleton />
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex items-center justify-between mb-6">
        <StatSkeleton />
        <div className="text-right space-y-2">
          <Skeleton className="h-4 w-28 ml-auto" />
          <Skeleton className="h-3 w-40 ml-auto" />
          <Skeleton className="h-4 w-28 ml-auto" />
        </div>
      </div>
      <Skeleton className="h-3 w-full rounded-full mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

/* ------------------ Fast spinner (for map loading only) ------------------ */
function Spinner() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="h-12 w-12 border-4 border-[#F78300] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/* --------------------------- Dynamic map import --------------------------- */
/* Replaces the map skeleton with a tiny spinner while the chunk loads */
const UserVisitedMap = dynamic(() => import("@/components/UserVisitedMap"), {
  ssr: false,
  loading: () => <Spinner />,
});

/* --------------------------------- Utils --------------------------------- */

function avatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const supabase = createClient();
  const { data } = supabase.storage.from("avatars").getPublicUrl(avatar_url);
  return data.publicUrl;
}

type SiteRow = {
  id: string;
  title: string;
  slug: string;
  cover_photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  location_free?: string | null;
  heritage_type?: string | null;
  site_categories: { categories: { icon_key: string | null }[] }[];
};

type ReviewWithSite = ReviewRow & { site?: SiteRow };

const monthNames = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* --------------------------------- Page ---------------------------------- */

export default function PlacesVisitedPage() {
  const supabase = createClient();
  const { userId, authLoading } = useAuthUserId();
  const { profile, loading: profileLoading } = useProfile(); // ✅ from context

  const [visitedCount, setVisitedCount] = useState(0);
  const [progress, setProgress] = useState({
    current: "Beginner",
    next: null as string | null,
    remaining: 0,
  });
  const [reviews, setReviews] = useState<ReviewWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [showMap, setShowMap] = useState(false);

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

        // ✅ Fetch count and reviews (profile via context)
        const [count, userReviews] = await Promise.all([
          countUserVisits(userId),
          listUserReviews(userId),
        ]);

        setVisitedCount(count);
        setProgress(progressToNextBadge(count));

        const siteIds = Array.from(new Set(userReviews.map((r) => r.site_id)));

        let sites: SiteRow[] = [];
        if (siteIds.length) {
          const { data, error } = await supabase
            .from("sites")
            .select(
              "id, title, slug, cover_photo_url, latitude, longitude, location_free, heritage_type, site_categories!inner(categories(icon_key))"
            )
            .in("id", siteIds as string[]);
          if (error) throw error;
          sites = data ?? [];
        }

        setReviews(
          userReviews.map((r) => ({
            ...r,
            site: sites.find((s) => s.id === r.site_id),
          }))
        );
      } catch (e: any) {
        setPageError(e?.message ?? "Error loading visited places");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, userId, supabase]);

  const sitesForMap: UserSite[] = reviews
    .map((r) => {
      const s = r.site;
      if (!s || !s.latitude || !s.longitude) return null;

      const normalizedCategories =
        s.site_categories?.map((sc) => ({
          categories:
            Array.isArray(sc.categories) && sc.categories.length > 0
              ? sc.categories[0]
              : null,
        })) ?? [];

      const normalized: UserSite = {
        id: s.id,
        title: s.title,
        slug: s.slug,
        cover_photo_url: s.cover_photo_url,
        latitude: s.latitude,
        longitude: s.longitude,
        location_free: s.location_free ?? null,
        heritage_type: s.heritage_type ?? null,
        site_categories: normalizedCategories,
        visited_year: r.visited_year,
        visited_month: r.visited_month,
        rating: r.rating ?? 0,
      };

      return normalized;
    })
    .filter((x): x is UserSite => x !== null);

  // ✅ Full page skeleton during auth/profile/data load
  if (authLoading || loading || profileLoading) return <PageSkeleton />;
  if (!userId) return <p className="p-6">Please sign in to view this page.</p>;
  if (pageError) return <p className="p-6 text-red-600">Error: {pageError}</p>;

  if (showMap) {
    return (
      <UserVisitedMap
        locations={sitesForMap}
        onClose={() => setShowMap(false)}
        profile={profile}
        visitedCount={visitedCount}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-4">My Visited Places</h1>

      {/* Header: avatar + map button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {profile ? (
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-orange-400">
                <Image
                  src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                  alt="User avatar"
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className="font-semibold text-xl">{profile.full_name}</div>
                <div className="text-md text-green-600">{profile.badge}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <AvatarSkeleton />
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          )}
        </div>

        {sitesForMap.length > 0 && (
          <button
            onClick={() => setShowMap(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Icon name="map-marker-alt" />
            Show on Map
          </button>
        )}
      </div>

      {/* Stats + badge summary */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg border-4 border-white">
            {visitedCount}
          </div>
          <div>
            <p className="text-xl font-bold">Heritage Sites</p>
            <p className="text-sm text-gray-500">Reviewed by you</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-medium text-green-600">{progress.current} Badge</p>
          {progress.next && (
            <p className="text-xs text-gray-500">
              {progress.remaining} more sites → {progress.next}
            </p>
          )}
          <button
            onClick={() => setShowBadgeModal(true)}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            Learn about Badges
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress.next && visitedCount > 0 ? (
        <div className="w-full bg-gray-200 h-3 rounded-full mb-8">
          <div
            className="bg-green-600 h-3 rounded-full"
            style={{
              width: `${Math.min(
                (visitedCount / (visitedCount + progress.remaining)) * 100,
                100
              )}%`,
            }}
          />
        </div>
      ) : (
        <div className="mb-8">
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
      )}

      {/* Grid of visited sites */}
      {reviews.length === 0 && <p>You haven’t reviewed any places yet.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {reviews.length > 0
          ? reviews.map((r) => (
              <div key={r.id} className="text-center group">
                <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden shadow-lg border-4 border-white transition-all duration-300">
                  {r.site?.cover_photo_url ? (
                    <Image
                      src={r.site.cover_photo_url}
                      alt={r.site.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="bg-gray-300 w-full h-full" />
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-medium">
                    {r.site?.title ?? "Unknown Site"}
                  </h3>
                  {r.rating && (
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <div className="text-amber-500 text-sm leading-none">
                        {"★".repeat(Math.round(r.rating))}
                      </div>
                      <div className="text-gray-300 text-sm leading-none">
                        {"★".repeat(5 - Math.round(r.rating))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Visited in{" "}
                    {r.visited_month && r.visited_year
                      ? `${monthNames[r.visited_month]} ${r.visited_year}`
                      : new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          : [1, 2, 3, 4].map((k) => <CardSkeleton key={k} />)}
      </div>

      {/* Badge modal */}
      {showBadgeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowBadgeModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full border-t-4 border-[#f78300]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                Badge Tiers
              </h2>
              <button
                onClick={() => setShowBadgeModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <Icon name="times" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {BADGE_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className="flex justify-between items-center border-b pb-2"
                >
                  <span className="font-semibold text-[#f78300]">
                    {tier.name}
                  </span>
                  <span className="text-blue-600 font-medium">
                    {tier.min}
                    {tier.max ? `–${tier.max}` : "+"} reviews
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowBadgeModal(false)}
              className="mt-6 w-full bg-[#f78300] hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
