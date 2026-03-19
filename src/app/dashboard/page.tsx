"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
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

  if (authLoading || loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
      {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
    </div>
  );
  if (authError) return <p className="text-red-600">Auth error: {authError}</p>;
  if (!userId) return <p>Please sign in to view your dashboard.</p>;
  if (pageError) return <p className="text-red-600">Error: {pageError}</p>;

  const avatarSrc = resolveAvatarSrc(profile?.avatar_url ?? null);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      {profile && (
        <div className="flex items-center gap-4">
          {avatarSrc ? (
            <NextImage
              src={avatarSrc}
              alt="avatar"
              width={64}
              height={64}
              className="rounded-full shrink-0 ring-2 ring-gray-100"
              unoptimized
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">
              {profile.full_name ?? "Traveler"}
            </h2>
            {profile.badge && (
              <span className="inline-block mt-0.5 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                {profile.badge}
              </span>
            )}
            {profile.username && (
              <Link
                href={`/profile/${profile.username}`}
                className="block mt-1 text-xs text-[#F78300] font-medium active:opacity-70"
              >
                View Public Profile →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Places Visited card ── */}
      <Link href="/dashboard/placesvisited" className="block active:opacity-80">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-gray-800">Places Visited</p>
            <span className="text-xs text-[#F78300] font-medium">View all →</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{visitedCount}</p>
          <p className="text-sm text-gray-500 mt-0.5">{badgeInfo.current} Badge</p>
          {badgeInfo.next && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Progress to {badgeInfo.next}</span>
                <span>{badgeInfo.remaining} more</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((visitedCount / (visitedCount + badgeInfo.remaining)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Link>

      {/* ── Recent Reviews card ── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <Link href="/dashboard/myreviews" className="flex items-center justify-between px-4 py-3 border-b border-gray-50 active:bg-gray-50">
          <p className="font-semibold text-gray-800">My Recent Reviews</p>
          <span className="text-xs text-[#F78300] font-medium">View all →</span>
        </Link>
        {recentReviews.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-5 text-center">No reviews yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentReviews.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-sm ${s <= r.rating ? "text-yellow-400" : "text-gray-200"}`}>★</span>
                  ))}
                </div>
                {r.review_text && (
                  <p className="text-sm text-gray-600 line-clamp-2">{r.review_text}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Portfolio thumbnails card ── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <Link href="/dashboard/portfolio" className="flex items-center justify-between px-4 py-3 border-b border-gray-50 active:bg-gray-50">
          <p className="font-semibold text-gray-800">My Portfolio</p>
          <span className="text-xs text-[#F78300] font-medium">View all →</span>
        </Link>
        {portfolioPhotos.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-5 text-center">No photos added yet.</p>
        ) : (
          <div className="flex gap-2 p-4">
            {portfolioPhotos.map((p) => (
              <div key={p.id} className="relative flex-1 aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={p.publicUrl} alt="portfolio" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
