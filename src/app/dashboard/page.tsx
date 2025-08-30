"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { countUserVisits } from "@/lib/db/visited";
import { progressToNextBadge } from "@/lib/db/badges";
import { listUserReviews, ReviewRow } from "@/lib/db/reviews";
import { listPortfolio } from "@/lib/db/portfolio";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/** Build a direct public URL for a storage object (no transforms) */
function storagePublicUrl(bucket: string, path: string) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Resolve avatar src: full URL stays; otherwise treat as path in "avatars" */
function resolveAvatarSrc(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  return storagePublicUrl("avatars", avatar_url);
}

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  badge: string | null;
  avatar_url: string | null; // ✅ your real column
};

export default function DashboardHome() {
  const supabase = createClient();
  const { userId, authLoading, authError } = useAuthUserId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [visitedCount, setVisitedCount] = useState(0);
  const [badgeInfo, setBadgeInfo] = useState({
    current: "Beginner",
    next: null as string | null,
    remaining: 0,
  });
  const [recentReviews, setRecentReviews] = useState<ReviewRow[]>([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState<
    { id: string; publicUrl: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

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

        // Profile (use avatar_url)
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, username, badge, avatar_url")
          .eq("id", userId)
          .maybeSingle();
        if (profErr) throw profErr;
        setProfile(prof as Profile);

        const count = await countUserVisits(userId);
        setVisitedCount(count);
        setBadgeInfo(progressToNextBadge(count));

        const reviews = await listUserReviews(userId);
        setRecentReviews(reviews.slice(0, 3));

        // Portfolio thumbnails — only public items
        const portfolio = await listPortfolio(userId);
        const publicItems = portfolio.filter((p) => p.is_public).slice(0, 3);
        if (publicItems.length) {
          // get photo storage paths
          const { data: photoRows, error: photoErr } = await supabase
            .from("review_photos")
            .select("id, storage_path")
            .in(
              "id",
              publicItems.map((p) => p.photo_id)
            );
          if (photoErr) throw photoErr;

          setPortfolioPhotos(
            (photoRows ?? []).map((p) => ({
              id: p.id,
              publicUrl: storagePublicUrl("user-photos", p.storage_path), // ✅ direct, reliable URL
            }))
          );
        } else {
          setPortfolioPhotos([]);
        }
      } catch (e: any) {
        setPageError(e?.message ?? "Something went wrong");
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, userId]);

  if (authLoading || loading) return <p>Loading dashboard...</p>;
  if (authError) return <p className="text-red-600">Auth error: {authError}</p>;
  if (!userId) return <p>Please sign in to view your dashboard.</p>;
  if (pageError) return <p className="text-red-600">Error: {pageError}</p>;

  const avatarSrc = resolveAvatarSrc(profile?.avatar_url ?? null);

  return (
    <div className="space-y-8">
      {/* Header */}
      {profile && (
        <div className="flex items-center space-x-4">
          {avatarSrc ? (
            <NextImage
              src={avatarSrc}
              alt="avatar"
              width={60}
              height={60}
              className="rounded-full"
              unoptimized
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-300" />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {profile.full_name ?? "Traveler"}
            </h2>
            {profile.badge && (
              <p className="text-green-600 font-medium">{profile.badge}</p>
            )}
            {profile.username && (
              <Link
                href={`/profile/${profile.username}`}
                className="text-sm text-blue-600 underline"
              >
                View Public Profile
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Places visited */}
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium">Places Visited</p>
          <Link
            href="/dashboard/placesvisited"
            className="text-sm text-blue-600 underline"
          >
            View all
          </Link>
        </div>
        <p className="text-2xl font-bold">{visitedCount}</p>
        <p className="text-sm text-gray-500 mb-2">{badgeInfo.current} Badge</p>
        {badgeInfo.next && (
          <div className="w-full bg-gray-200 h-3 rounded-full">
            <div
              className="bg-green-600 h-3 rounded-full"
              style={{
                width: `${Math.min(
                  (visitedCount / (visitedCount + badgeInfo.remaining)) * 100,
                  100
                )}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Recent reviews */}
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium">My Recent Reviews</p>
          <Link
            href="/dashboard/myreviews"
            className="text-sm text-blue-600 underline"
          >
            View all
          </Link>
        </div>
        {recentReviews.length === 0 && <p>No reviews yet.</p>}
        <div className="space-y-2">
          {recentReviews.map((r) => (
            <div key={r.id} className="border-b pb-2">
              <p className="text-sm">
                <span className="font-medium">Rating:</span> {r.rating} ★
              </p>
              {r.review_text && (
                <p className="text-sm text-gray-700 line-clamp-2">
                  {r.review_text}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Portfolio thumbnails */}
      <div className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium">My Portfolio</p>
          <Link
            href="/dashboard/portfolio"
            className="text-sm text-blue-600 underline"
          >
            View all
          </Link>
        </div>
        {portfolioPhotos.length === 0 && <p>No photos added yet.</p>}
        <div className="flex space-x-3">
          {portfolioPhotos.map((p) => (
            <div
              key={p.id}
              className="relative w-24 h-24 rounded overflow-hidden border"
            >
              {/* Use plain img to completely bypass Next/Image constraints */}
              <img
                src={p.publicUrl}
                alt="portfolio"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
