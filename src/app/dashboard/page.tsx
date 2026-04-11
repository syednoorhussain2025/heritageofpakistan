"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight, hapticHeavy } from "@/lib/haptics";
import { countUserVisits } from "@/lib/db/visited";
import { progressToNextBadge } from "@/lib/db/badges";
import { listUserReviews, ReviewRow } from "@/lib/db/reviews";
import { listPortfolio } from "@/lib/db/portfolio";
import { useAuthUserId } from "@/hooks/useAuthUserId";

function storagePublicUrl(bucket: string, path: string) {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

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
  avatar_url: string | null;
};

const mobileNavItems = [
  { href: "/dashboard/profile", label: "Profile", icon: "user-round" },
  { href: "/dashboard/mywishlists", label: "Saved Lists", icon: "layout-list" },
  { href: "/dashboard/mycollections", label: "Collections", icon: "cards" },
  { href: "/dashboard/mytrips", label: "My Trips", icon: "line-segments-light" },
  { href: "/dashboard/myreviews", label: "My Reviews", icon: "star-light" },
  { href: "/dashboard/placesvisited", label: "Places Visited", icon: "person-simple-hike-light" },
  { href: "/dashboard/portfolio", label: "My Portfolio", icon: "layout-grid" },
  { href: "/dashboard/notebook", label: "My Notes", icon: "book-open-text-light" },
  { href: "/dashboard/account-details", label: "Account Details", icon: "square-user-round" },
];

export default function DashboardHome() {
  const supabase = createClient();
  const router = useRouter();
  const { userId, authLoading, authError } = useAuthUserId();
  function navigateTo(href: string) {
    void hapticLight();
    router.push(href);
  }

  async function handleSignOut() {
    void hapticHeavy();
    await supabase.auth.signOut();
    router.push("/");
  }

  const [profile, setProfile] = useState<Profile | null>(null);
  const [visitedCount, setVisitedCount] = useState(0);
  const [badgeInfo, setBadgeInfo] = useState({
    current: "Beginner",
    next: null as string | null,
    remaining: 0,
  });
  const [recentReviews, setRecentReviews] = useState<ReviewRow[]>([]);
  const [portfolioPhotos, setPortfolioPhotos] = useState<{ id: string; publicUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        setPageError(null);

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

        const portfolio = await listPortfolio(userId);
        const publicItems = portfolio.filter((p) => p.is_public).slice(0, 3);
        if (publicItems.length) {
          const { data: photoRows, error: photoErr } = await supabase
            .from("review_photos")
            .select("id, storage_path")
            .in("id", publicItems.map((p) => p.photo_id));
          if (photoErr) throw photoErr;
          setPortfolioPhotos(
            (photoRows ?? []).map((p) => ({
              id: p.id,
              publicUrl: storagePublicUrl("user-photos", p.storage_path),
            }))
          );
        } else {
          setPortfolioPhotos([]);
        }
      } catch (e: any) {
        setPageError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, userId]);

  if (authLoading || loading) return (
    <div className="animate-pulse">
      {/* Mobile: exact match of nav card */}
      <div className="lg:hidden fixed inset-0 z-0" style={{ backgroundColor: "var(--brand-light-grey)" }} />
      <div className="lg:hidden relative z-10 -mx-4 -mt-4 -mb-4 px-5 pt-5 pb-24" style={{ minHeight: "calc(100vh - 80px)" }}>
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
          {mobileNavItems.map((item, i) => (
            <div key={item.href} className="flex items-center gap-3.5 px-4 py-[15px] relative">
              {i > 0 && <span className="absolute top-0 right-0 left-[20px] h-px bg-gray-100" />}
              <div className="w-[30px] h-[30px] rounded-md bg-gray-200 shrink-0" />
              <div className="flex-1 h-4 bg-gray-100 rounded w-2/5" />
              <div className="w-3 h-3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
        <div className="mt-2.5 h-[54px] rounded-2xl bg-white border border-gray-200" />
      </div>
      {/* Desktop: full skeleton */}
      <div className="hidden lg:block space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-1/3" />
          </div>
        </div>
        {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
      </div>
    </div>
  );
  if (authError) return <p className="text-red-600">Auth error: {authError}</p>;
  if (!userId) return <p>Please sign in to view your dashboard.</p>;
  if (pageError) return <p className="text-red-600">Error: {pageError}</p>;

  const avatarSrc = resolveAvatarSrc(profile?.avatar_url ?? null);

  return (
    <div className="space-y-5">

      {/* ── MOBILE: grey full-screen backdrop ── */}
      <div className="lg:hidden fixed inset-0 z-0" style={{ backgroundColor: "var(--brand-light-grey)" }} />

      {/* ── MOBILE: nav list only (profile info is in the teal header) ── */}
      <div className="lg:hidden relative z-10 -mx-4 -mt-4 -mb-4 px-5 pt-5 pb-24" style={{ minHeight: "calc(100vh - 80px)" }}>
        {/* Nav list card */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-200">
          {mobileNavItems.map((item, i) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigateTo(item.href)}
              className="w-full flex items-center gap-3.5 px-4 py-[15px] active:bg-gray-50 transition-colors relative select-none text-left"
              style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
            >
              {i > 0 && <span className="absolute top-0 right-0 left-[20px] h-px bg-gray-100" />}
              <Icon name={item.icon} size={30} className="text-black shrink-0" />
              <span className="flex-1 text-[15px] font-normal text-[var(--brand-dark-grey)]">{item.label}</span>
              <Icon name="chevron-right" size={13} className="text-[var(--brand-light-grey)]" />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={() => { void hapticHeavy(); void handleSignOut(); }}
          className="mt-2.5 w-full flex items-center gap-3.5 px-4 py-[15px] rounded-2xl bg-white border border-gray-200 active:bg-red-50 transition-colors select-none"
          style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        >
          <Icon name="sign-out" size={19} className="text-red-500 shrink-0" />
          <span className="flex-1 text-[15px] font-normal text-red-500 text-left">Sign Out</span>
        </button>
      </div>

      {/* ── DESKTOP: full dashboard with profile header + cards ── */}
      <div className="hidden lg:block space-y-5">
        {/* Profile header */}
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
              {profile.username && (
                <Link
                  href={`/profile/${profile.username}`}
                  className="block mt-1 text-xs text-[var(--brand-orange)] font-medium hover:opacity-70"
                >
                  View Public Profile →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Places Visited card */}
        <Link href="/dashboard/placesvisited" className="block hover:opacity-80">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-800">Places Visited</p>
              <span className="text-xs text-[var(--brand-orange)] font-medium">View all →</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{visitedCount}</p>
            <p className="text-sm text-gray-500 mt-0.5">places visited</p>
            {profile?.badge && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                <Icon name="plus-solid-full" size={10} />
                {profile.badge}
              </span>
            )}
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

        {/* Recent Reviews card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <Link href="/dashboard/myreviews" className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
            <p className="font-semibold text-gray-800">My Recent Reviews</p>
            <span className="text-xs text-[var(--brand-orange)] font-medium">View all →</span>
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

        {/* Portfolio thumbnails card */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <Link href="/dashboard/portfolio" className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50">
            <p className="font-semibold text-gray-800">My Portfolio</p>
            <span className="text-xs text-[var(--brand-orange)] font-medium">View all →</span>
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
    </div>
  );
}
