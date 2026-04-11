// src/app/dashboard/placesvisited/page.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { NoVisited } from "@/components/illustrations/NoVisited";
import { progressToNextBadge, BADGE_TIERS } from "@/lib/db/badges";
import { createClient } from "@/lib/supabase/browser";
import Image from "next/image";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import Icon from "@/components/Icon";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { useProfile } from "@/components/ProfileProvider";
import type { UserSite } from "@/components/UserVisitedMap";
import { usePlacesVisited } from "@/hooks/useDashboardQueries";
import type { ReviewRow } from "@/lib/db/reviews";

/* ---------- Skeleton utilities ---------- */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}
function AvatarSkeleton() {
  return <Skeleton className="relative w-14 h-14 rounded-full" />;
}
function CardSkeleton() {
  return (
    <div className="text-center">
      <Skeleton className="relative w-28 h-28 mx-auto rounded-full" />
      <div className="p-2 space-y-1">
        <Skeleton className="h-3 w-24 mx-auto" />
        <Skeleton className="h-3 w-16 mx-auto" />
      </div>
    </div>
  );
}
function PageSkeleton() {
  return (
    <div className="pb-4 space-y-4">
      {/* Header row: avatar + name + buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full border-2 border-gray-100" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-9 h-9 rounded-full" />
          <Skeleton className="w-20 h-9 rounded-full" />
        </div>
      </div>
      {/* Stats card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="space-y-1 text-right">
            <Skeleton className="h-4 w-20 ml-auto" />
            <Skeleton className="h-3 w-28 ml-auto" />
          </div>
        </div>
        <Skeleton className="mt-3 h-2 w-full rounded-full" />
      </div>
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((k) => <CardSkeleton key={k} />)}
      </div>
    </div>
  );
}

/* ---------- Dynamic OSM map ---------- */
const UserVisitedMap = dynamic(() => import("@/components/UserVisitedMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="h-10 w-10 border-4 border-[var(--brand-green)] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

/* ---------- Utils ---------- */
function avatarSrcFn(avatar_url?: string | null) {
  if (!avatar_url) return null;
  if (/^https?:\/\//i.test(avatar_url)) return avatar_url;
  const supabase = createClient();
  return supabase.storage.from("avatars").getPublicUrl(avatar_url).data.publicUrl;
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
const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ---------- Info bottom sheet ---------- */
function InfoBottomSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[3600] bg-black/40" onClick={() => { void hapticLight(); onClose(); }} />
      <div className="fixed inset-x-0 bottom-0 z-[3700] bg-white rounded-t-3xl shadow-2xl" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}>
        <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">How it works</h2>
            <button onClick={() => { void hapticLight(); onClose(); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200">
              <Icon name="times" size={16} />
            </button>
          </div>

          {/* Animated stars illustration */}
          <div className="flex items-center justify-center gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className="h-8 w-8 text-amber-400 animate-bounce"
                style={{ animationDelay: `${i * 0.1}s`, animationDuration: "1.2s" }}
                fill="currentColor"
              >
                <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            ))}
          </div>

          <p className="text-sm text-gray-600 text-center leading-relaxed mb-4">
            <span className="font-semibold text-gray-900">Review a heritage site</span> to mark it as visited and earn badges. The more places you review, the higher your badge tier!
          </p>

          <div className="space-y-2 bg-gray-50 rounded-2xl p-3 mb-5">
            {BADGE_TIERS.map((tier) => (
              <div key={tier.name} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm">★</span>
                  <span className="font-semibold text-sm text-gray-800">{tier.name}</span>
                </div>
                <span className="text-xs text-gray-500 font-medium">{tier.min}{tier.max ? `–${tier.max}` : "+"} reviews</span>
              </div>
            ))}
          </div>

          <button onClick={() => { void hapticMedium(); onClose(); }} className="w-full bg-[var(--brand-green)] text-white font-bold py-3.5 rounded-full active:opacity-80 transition">
            Got it!
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- Page ---------- */
export default function PlacesVisitedPage() {
  const { userId, authLoading } = useAuthUserId();
  const { profile, loading: profileLoading } = useProfile();

  const { data, isLoading, error: placesError } = usePlacesVisited(userId);

  const visitedCount = data?.count ?? 0;
  const progress = progressToNextBadge(visitedCount);
  const reviews = (data?.reviews ?? []) as ReviewWithSite[];
  const loading = authLoading || isLoading;
  const pageError = placesError ? (placesError as any)?.message ?? "Error loading visited places" : null;

  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  const sitesForMap: UserSite[] = reviews
    .map((r) => {
      const s = r.site;
      if (!s || !s.latitude || !s.longitude) return null;
      const normalizedCategories = s.site_categories?.map((sc: any) => ({
        categories: Array.isArray(sc.categories) && sc.categories.length > 0 ? sc.categories[0] : null,
      })) ?? [];
      return {
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
      } as UserSite;
    })
    .filter((x): x is UserSite => x !== null);

  if (authLoading || loading || profileLoading) return <PageSkeleton />;
  if (!userId) return <p className="p-6">Please sign in to view this page.</p>;
  if (pageError) return <p className="p-6 text-red-600">Error: {pageError}</p>;

  /* ── Map full-screen view ── */
  if (showMap) {
    return (
      <div className="fixed inset-0 z-[400] flex flex-col bg-white">
        {/* Map header */}
        <div
          className="flex items-center gap-3 px-4 bg-[var(--brand-green)] text-white shrink-0"
          style={{ paddingTop: "calc(var(--sat, 44px) + 8px)", paddingBottom: "12px" }}
        >
          <button
            type="button"
            onClick={() => setShowMap(false)}
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20"
            aria-label="Back"
          >
            <Icon name="circle-arrow-left" size={30} />
          </button>
          <span className="flex-1 text-base font-bold">Places Visited Map</span>
          <span className="text-sm opacity-80">{sitesForMap.length} sites</span>
        </div>

        {/* Map fills remaining space — no padding, no white border */}
        <div className="flex-1 relative">
          <UserVisitedMap
            locations={sitesForMap}
            onClose={() => setShowMap(false)}
            profile={profile}
            visitedCount={visitedCount}
          />
        </div>

        {/* Stats bottom sheet overlay */}
        <div className="absolute bottom-0 left-0 right-0 z-[10] pointer-events-none" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
          <div className="mx-3 mb-2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-3 pointer-events-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {profile?.avatar_url && (
                <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-[var(--brand-green)] shrink-0">
                  <Image src={avatarSrcFn(profile.avatar_url) || "/default-avatar.png"} alt="avatar" fill className="object-cover" />
                </div>
              )}
              <div>
                <div className="font-semibold text-sm text-gray-900">{profile?.full_name ?? "You"}</div>
                <div className="text-xs text-[var(--brand-green)] font-medium">{profile?.badge ?? progress.current}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-[var(--brand-green)]">{visitedCount}</div>
              <div className="text-[10px] text-gray-500">Heritage Sites<br />Reviewed</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main list view ── */
  return (
    <div className="pb-4">
      {/* Header row: avatar + map button (no heading — it's in shell header) */}
      <div className="flex items-center justify-between mb-4">
        {profile ? (
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[var(--brand-green)] shrink-0">
              <Image src={avatarSrcFn(profile.avatar_url) || "/default-avatar.png"} alt="avatar" fill className="object-cover" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900">{profile.full_name}</div>
              <div className="text-xs text-[var(--brand-green)] font-medium">{profile.badge}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <AvatarSkeleton />
            <div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-16" /></div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void hapticLight(); setShowInfoSheet(true); }}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition"
            aria-label="Info"
          >
            <Icon name="info" size={16} />
          </button>
          {sitesForMap.length > 0 && (
            <button
              onClick={() => { void hapticMedium(); setShowMap(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-semibold active:opacity-80 transition"
              style={{ backgroundColor: "var(--brand-green)" }}
            >
              <Icon name="map-marker-alt" size={14} />
              Map
            </button>
          )}
        </div>
      </div>

      {/* Stats card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[var(--brand-green)] rounded-full flex items-center justify-center text-white text-2xl font-bold shadow border-4 border-white shrink-0">
              {visitedCount}
            </div>
            <div>
              <p className="font-bold text-gray-900">Heritage Sites</p>
              <p className="text-xs text-gray-500">Reviewed by you</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-[var(--brand-green)]">{progress.current}</p>
            {progress.next && <p className="text-xs text-gray-400">{progress.remaining} more → {progress.next}</p>}
            <button
              onClick={() => { void hapticLight(); setShowBadgeModal(true); }}
              className="mt-1 text-xs text-[var(--brand-green)] font-medium active:opacity-70"
            >
              About Badges →
            </button>
          </div>
        </div>
        {progress.next && visitedCount > 0 && (
          <div className="mt-3 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[var(--brand-green)] h-2 rounded-full transition-all"
              style={{ width: `${Math.min((visitedCount / (visitedCount + progress.remaining)) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Grid of visited sites */}
      {reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-[17px] font-semibold text-gray-800 mb-6">No Places Visited Yet</p>
          <NoVisited className="w-full max-w-[260px] mb-8" />
          <p className="text-sm text-gray-400">Review a heritage site to mark it as visited.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
          {reviews.map((r) => (
            <div key={r.id} className="text-center">
              <div className="relative w-28 h-28 mx-auto rounded-full overflow-hidden shadow border-4 border-white ring-2 ring-gray-100">
                {r.site?.cover_photo_url ? (
                  <Image src={r.site.cover_photo_url} alt={r.site.title} fill className="object-cover" />
                ) : (
                  <div className="bg-gray-200 w-full h-full flex items-center justify-center text-gray-300">
                    <Icon name="image" size={24} />
                  </div>
                )}
              </div>
              <div className="pt-2 pb-1">
                <h3 className="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">{r.site?.title ?? "Unknown Site"}</h3>
                {r.rating ? (
                  <div className="mt-1 flex items-center justify-center gap-0.5">
                    <span className="text-amber-400 text-xs">{"★".repeat(Math.round(r.rating))}</span>
                    <span className="text-gray-200 text-xs">{"★".repeat(5 - Math.round(r.rating))}</span>
                  </div>
                ) : null}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {r.visited_month && r.visited_year ? `${monthNames[r.visited_month]} ${r.visited_year}` : new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info bottom sheet (shown on first load + info button) */}
      {showInfoSheet && <InfoBottomSheet onClose={() => setShowInfoSheet(false)} />}

      {/* Badge tiers bottom sheet */}
      {showBadgeModal && (
        <>
          <div className="fixed inset-0 z-[3600] bg-black/40" onClick={() => { void hapticLight(); setShowBadgeModal(false); }} />
          <div className="fixed inset-x-0 bottom-0 z-[3700] bg-white rounded-t-3xl shadow-2xl" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}>
            <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
            <div className="px-5 pb-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">Badge Tiers</h2>
                <button onClick={() => { void hapticLight(); setShowBadgeModal(false); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200">
                  <Icon name="times" size={16} />
                </button>
              </div>
              <div className="space-y-2 mb-5">
                {BADGE_TIERS.map((tier) => (
                  <div key={tier.name} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span className="font-semibold text-[var(--brand-green)]">{tier.name}</span>
                    <span className="text-sm text-gray-500 font-medium">{tier.min}{tier.max ? `–${tier.max}` : "+"} reviews</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { void hapticMedium(); setShowBadgeModal(false); }} className="w-full bg-[var(--brand-green)] text-white font-bold py-3.5 rounded-full active:opacity-80 transition">
                Got it
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
