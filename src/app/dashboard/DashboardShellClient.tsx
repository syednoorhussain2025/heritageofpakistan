// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, memo } from "react";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";
import { countUserVisits } from "@/lib/db/visited";
import { progressToNextBadge } from "@/lib/db/badges";
import { useProfile } from "@/components/ProfileProvider";
import { usePrefetchDashboard } from "@/hooks/useDashboardQueries";
import DashboardPaneShell, { isPaneRoute, type PaneRoute } from "./DashboardPaneShell";
import { DashboardNavContext } from "./DashboardNavContext";

// Module-level cache so visitedCount survives navigation without re-fetching
let cachedVisitedCount: number | null = null;
let cachedVisitedUserId: string | null = null;

function avatarUrl(input: string | null | undefined): string {
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/avatars/${input.replace(/^\/+/, "")}`;
}

// ── Memoized header — never re-renders when activePane changes ──
const DashboardHomeHeader = memo(function DashboardHomeHeader({
  thumb,
  initials,
  profileLoading,
  profile,
  visitedCount,
  visitedLoaded,
  badgeInfo,
  progressPct,
}: {
  thumb: string;
  initials: string;
  profileLoading: boolean;
  profile: { full_name?: string | null; badge?: string | null } | null;
  visitedCount: number;
  visitedLoaded: boolean;
  badgeInfo: { current: string; next: string | null; remaining: number };
  progressPct: number;
}) {
  return (
    <MobilePageHeader
      backgroundColor="var(--brand-green)"
      minHeight="0px"
      className="flex flex-col px-5 pb-5"
      style={{ transform: "translateZ(0)" }}
    >
      <div className="flex items-center pt-1 justify-center">
        <span className="flex items-center justify-center gap-1.5 text-center text-white text-[17px] font-semibold tracking-wide">
          <Icon name="layout-board-split" size={24} className="text-white/90 shrink-0" />
          My Dashboard
        </span>
      </div>

      <div className="flex items-center gap-4 mt-4">
        <div className="w-16 h-16 rounded-full border-2 border-white/60 overflow-hidden bg-white/20 shrink-0 flex items-center justify-center relative">
          <span
            className="absolute inset-0 flex items-center justify-center text-white text-2xl font-bold"
            style={{ opacity: (!profileLoading && !thumb) ? 1 : 0, transition: "opacity 0.3s ease" }}
          >{initials}</span>
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt="avatar"
              className="w-full h-full object-cover"
              style={{ opacity: profileLoading ? 0 : 1, transition: "opacity 0.3s ease" }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 relative" style={{ minHeight: "46px" }}>
          <div
            className="animate-pulse space-y-2 absolute inset-0"
            style={{ opacity: profileLoading ? 1 : 0, transition: "opacity 0.3s ease", pointerEvents: "none" }}
          >
            <div className="h-5 bg-white/25 rounded-full w-36" />
            <div className="h-4 bg-white/20 rounded-full w-20" />
          </div>
          <div style={{ opacity: profileLoading ? 0 : 1, transition: "opacity 0.5s ease" }}>
            <p className="text-white text-[18px] font-bold leading-tight truncate">
              {profile?.full_name ?? ""}
            </p>
            {profile?.badge ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Icon name="plus-solid-full" size={18} className="text-white shrink-0" />
                <span className="text-[11px] font-semibold text-[var(--brand-green)] bg-white px-2 py-0.5 rounded-full">
                  {profile.badge}
                </span>
              </div>
            ) : (
              <div className="mt-1 h-[22px]" />
            )}
          </div>
        </div>

        <div className="shrink-0 text-right" style={{ minWidth: "56px" }}>
          <div style={{ opacity: visitedLoaded ? 1 : 0, transition: "opacity 0.5s ease" }}>
            <p className="text-white text-[26px] font-bold leading-none">{visitedCount}</p>
            <p className="text-white/70 text-[11px] mt-0.5">places visited</p>
          </div>
        </div>
      </div>

      <div className="mt-4" style={{ minHeight: "28px" }}>
        <div style={{ opacity: visitedLoaded ? 1 : 0, transition: "opacity 0.5s ease 0.1s" }}>
          {badgeInfo.next ? (
            <>
              <div className="flex justify-between text-[11px] text-white/70 mb-1.5">
                <span>{badgeInfo.current} Badge</span>
                <span>{badgeInfo.remaining} more to {badgeInfo.next}</span>
              </div>
              <div className="w-full bg-white/25 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-white h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <div className="h-[28px]" />
          )}
        </div>
      </div>
    </MobilePageHeader>
  );
});

export default function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAuthUserId();
  const [activePane, setActivePane] = useState<PaneRoute | null>(() =>
    isPaneRoute(pathname ?? "") ? (pathname as PaneRoute) : null
  );

  const { profile, loading: profileLoading } = useProfile();

  const prefetchDashboard = usePrefetchDashboard(userId);
  useEffect(() => {
    if (userId) prefetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [visitedCount, setVisitedCount] = useState<number>(
    cachedVisitedUserId === userId && cachedVisitedCount !== null ? cachedVisitedCount : 0
  );
  const [badgeInfo, setBadgeInfo] = useState({ current: "Beginner", next: null as string | null, remaining: 0 });
  const [visitedLoaded, setVisitedLoaded] = useState(
    cachedVisitedUserId === userId && cachedVisitedCount !== null
  );

  useEffect(() => {
    if (!userId) return;
    if (cachedVisitedUserId === userId && cachedVisitedCount !== null) {
      setVisitedCount(cachedVisitedCount);
      setBadgeInfo(progressToNextBadge(cachedVisitedCount));
      setVisitedLoaded(true);
      return;
    }
    (async () => {
      const count = await countUserVisits(userId);
      cachedVisitedCount = count;
      cachedVisitedUserId = userId;
      setVisitedCount(count);
      setBadgeInfo(progressToNextBadge(count));
      setVisitedLoaded(true);
    })();
  }, [userId]);

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "layout-board-split" },
    { href: "/dashboard/profile", label: "Profile", icon: "user-round" },
    { href: "/dashboard/mywishlists", label: "Saved Lists", icon: "layout-list" },
    { href: "/dashboard/mycollections", label: "Collections", icon: "cards" },
    { href: "/dashboard/mytrips", label: "My Trips", icon: "line-segments-light" },
    { href: "/dashboard/notebook", label: "My Notes", icon: "book-open-text-light" },
    { href: "/dashboard/myreviews", label: "My Reviews", icon: "star-light" },
    { href: "/dashboard/placesvisited", label: "Places Visited", icon: "person-simple-hike-light" },
    { href: "/dashboard/portfolio", label: "My Portfolio", icon: "layout-grid" },
    { href: "/dashboard/account-details", label: "Account Details", icon: "square-user-round" },
  ];

  const thumb = avatarUrl(profile?.avatar_url);
  const initials = (profile?.full_name ?? "?").charAt(0).toUpperCase();
  const progressPct = badgeInfo.next
    ? Math.min((visitedCount / (visitedCount + badgeInfo.remaining)) * 100, 100)
    : 100;

  return (
    <div className="min-h-screen bg-white lg:bg-gray-100 lg:flex lg:p-6 lg:gap-6 lg:items-start">
      {/* Fixed Sidebar — desktop only */}
      <aside className="hidden lg:flex fixed w-64 bg-white border border-gray-200 rounded-2xl shadow-md flex-col h-[calc(100vh-3rem)]">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800">My Dashboard</h2>
        </div>
        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto">
          {nav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? "bg-orange-100 text-orange-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`w-5 h-5 mr-3 ${isActive ? "text-orange-700" : ""}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/");
            }}
            className="flex w-full items-center px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors duration-200"
          >
            <Icon name="sign-out-alt" className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="hidden lg:block w-64" />

      {/* Memoized header — isolated from activePane state changes */}
      <DashboardHomeHeader
        thumb={thumb}
        initials={initials}
        profileLoading={profileLoading}
        profile={profile}
        visitedCount={visitedCount}
        visitedLoaded={visitedLoaded}
        badgeInfo={badgeInfo}
        progressPct={progressPct}
      />

      {/* Main Content */}
      <main className="flex-1 bg-white lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-sm dashboard-no-longpress p-4 lg:p-8">
        <div className="lg:hidden" style={{ height: "calc(var(--sat, 44px) + 196px)" }} />

        <DashboardNavContext.Provider value={{
          activePane,
          openPane: (route) => {
            setActivePane(route);
            window.history.replaceState(null, "", route);
          },
          closePane: () => {
            setActivePane(null);
            window.history.replaceState(null, "", "/dashboard");
          },
        }}>
          {children}
          <DashboardPaneShell
            activeRoute={activePane}
            onClosed={() => {
              setActivePane(null);
              window.history.replaceState(null, "", "/dashboard");
            }}
          />
        </DashboardNavContext.Provider>

        <div className="lg:hidden" style={{ height: "calc(52px + var(--safe-bottom, 0px) + 8px)" }} />
      </main>
    </div>
  );
}
