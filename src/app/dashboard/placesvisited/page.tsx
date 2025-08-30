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
import { avatarSrc } from "@/lib/image/avatarSrc";
// Import the type your map wants
import type { UserSite } from "@/components/UserVisitedMap";

// Dynamically import the map (no SSR)
const UserVisitedMap = dynamic(() => import("@/components/UserVisitedMap"), {
  ssr: false,
});

type SiteRow = {
  id: string;
  title: string;
  slug: string;
  cover_photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  location_free?: string | null;
  heritage_type?: string | null;

  // Supabase returns an array of join-rows where each row has `categories`.
  // In practice we've observed `categories` come back as an ARRAY with a single item.
  // We'll normalize it below to the single-object-or-null shape the map expects.
  site_categories: { categories: { icon_key: string | null }[] }[];
};

type ProfileRow = {
  full_name: string | null;
  badge: string | null;
  avatar_url: string | null;
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

export default function PlacesVisitedPage() {
  const supabase = createClient();
  const { userId, authLoading, authError } = useAuthUserId();

  const [visitedCount, setVisitedCount] = useState(0);
  const [progress, setProgress] = useState({
    current: "Beginner",
    next: null as string | null,
    remaining: 0,
  });
  const [reviews, setReviews] = useState<ReviewWithSite[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
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

        // Fetch in parallel
        const [count, userReviews, profileData] = await Promise.all([
          countUserVisits(userId),
          listUserReviews(userId),
          supabase
            .from("profiles")
            .select("full_name, badge, avatar_url")
            .eq("id", userId)
            .single(),
        ]);

        setVisitedCount(count);
        setProgress(progressToNextBadge(count));
        setProfile(profileData.data);

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

  // Normalize each review's site to the exact shape UserVisitedMap expects (UserSite)
  const sitesForMap: UserSite[] = reviews
    .map((r) => {
      const s = r.site;
      if (!s || !s.latitude || !s.longitude) return null;

      const normalizedCategories =
        s.site_categories?.map((sc) => ({
          // Map array -> single object or null (first item if present)
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

  if (authLoading || loading) return <p>Loading places visited...</p>;
  if (authError) return <p className="text-red-600">Auth error: {authError}</p>;
  if (!userId) return <p>Please sign in to view this page.</p>;
  if (pageError) return <p className="text-red-600">Error: {pageError}</p>;

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {profile && (
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

      {progress.next && visitedCount > 0 && (
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
      )}

      {reviews.length === 0 && <p>You haven’t reviewed any places yet.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {reviews.map((r) => (
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
              <h3 className="font-medium">{r.site?.title ?? "Unknown Site"}</h3>
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
        ))}
      </div>

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
