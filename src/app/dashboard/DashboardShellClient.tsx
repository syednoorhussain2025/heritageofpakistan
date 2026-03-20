// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight } from "@/lib/haptics";
import { countUserVisits } from "@/lib/db/visited";
import { progressToNextBadge } from "@/lib/db/badges";

type ProfileSnap = {
  full_name: string | null;
  username: string | null;
  badge: string | null;
  avatar_url: string | null;
};

function avatarUrl(input: string | null | undefined): string {
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/storage/v1/object/public/avatars/${input.replace(/^\/+/, "")}`;
}

export default function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAuthUserId();

  const isHome = pathname === "/dashboard";

  // Profile data for the tall home header — only fetched on /dashboard
  const [profile, setProfile] = useState<ProfileSnap | null>(null);
  const [visitedCount, setVisitedCount] = useState(0);
  const [badgeInfo, setBadgeInfo] = useState({ current: "Beginner", next: null as string | null, remaining: 0 });

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username, badge, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (data) setProfile(data as ProfileSnap);

      const count = await countUserVisits(userId);
      setVisitedCount(count);
      setBadgeInfo(progressToNextBadge(count));
    })();
  }, [userId]);

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/profile", label: "Profile", icon: "user" },
    { href: "/dashboard/mywishlists", label: "Saved Lists", icon: "list-ul" },
    { href: "/dashboard/mycollections", label: "Collections", icon: "retro" },
    { href: "/dashboard/mytrips", label: "My Trips", icon: "route" },
    { href: "/dashboard/notebook", label: "Notebook", icon: "book" },
    { href: "/dashboard/placesvisited", label: "Places Visited", icon: "map-marker-alt" },
    { href: "/dashboard/myreviews", label: "My Reviews", icon: "star" },
    { href: "/dashboard/portfolio", label: "My Portfolio", icon: "image" },
    { href: "/dashboard/account-details", label: "Account Details", icon: "lightbulb" },
  ];

  const fullBleed =
    typeof pathname === "string" && pathname.startsWith("/dashboard/notebook");

  const pageTitleMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/profile": "Profile",
    "/dashboard/mywishlists": "Saved Lists",
    "/dashboard/mycollections": "Collections",
    "/dashboard/mycollections/photos": "Collected Photos",
    "/dashboard/mytrips": "My Trips",
    "/dashboard/notebook": "Notebook",
    "/dashboard/placesvisited": "Places Visited",
    "/dashboard/myreviews": "My Reviews",
    "/dashboard/portfolio": "My Portfolio",
    "/dashboard/account-details": "Account Details",
  };

  const pageTitle =
    pageTitleMap[pathname ?? ""] ??
    (pathname?.startsWith("/dashboard/mywishlists/") ? "Saved List" :
    pathname?.startsWith("/dashboard/mycollections/") ? "Collection" : "Dashboard");

  // Smart back: nested routes go to their parent, not all the way to /dashboard
  function handleBack() {
    void hapticLight();
    if (pathname?.startsWith("/dashboard/mywishlists/")) {
      router.push("/dashboard/mywishlists");
    } else if (pathname === "/dashboard/mycollections/photos" || (pathname?.startsWith("/dashboard/mycollections/") && pathname !== "/dashboard/mycollections")) {
      router.push("/dashboard/mycollections");
    } else if (isHome) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  }

  const thumb = avatarUrl(profile?.avatar_url);
  const initials = (profile?.full_name ?? "?").charAt(0).toUpperCase();
  const progressPct = badgeInfo.next
    ? Math.min((visitedCount / (visitedCount + badgeInfo.remaining)) * 100, 100)
    : 100;

  // Swipe left-to-right to go back
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dx > 60 && dy < 80) {
      handleBack();
    }
  }

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
      </aside>

      {/* Spacer — desktop only */}
      <div className="hidden lg:block w-64" />

      {/* ── Mobile header ── */}
      {isHome ? (
        /* Tall profile header for /dashboard home */
        <MobilePageHeader backgroundColor="#00b78b" minHeight="0px" className="flex flex-col px-5 pb-5">
          {/* Top row: back + title */}
          <div className="flex items-center pt-1">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20 shrink-0"
            >
              <Icon name="arrow-left" size={20} className="text-white" />
            </button>
            <span className="flex-1 text-center text-white text-[17px] font-semibold tracking-wide pr-9">
              My Dashboard
            </span>
          </div>

          {/* Profile row */}
          <div className="flex items-center gap-4 mt-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full border-2 border-white/60 overflow-hidden bg-white/20 shrink-0 flex items-center justify-center">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">{initials}</span>
              )}
            </div>

            {/* Name + badge */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-[18px] font-bold leading-tight truncate">
                {profile?.full_name ?? "Traveler"}
              </p>
              {profile?.badge && (
                <span className="inline-block mt-1 text-[11px] font-semibold text-[#00b78b] bg-white px-2 py-0.5 rounded-full">
                  {profile.badge}
                </span>
              )}
            </div>

            {/* Places visited count */}
            <div className="shrink-0 text-right">
              <p className="text-white text-[26px] font-bold leading-none">{visitedCount}</p>
              <p className="text-white/70 text-[11px] mt-0.5">places visited</p>
            </div>
          </div>

          {/* Progress bar */}
          {badgeInfo.next && (
            <div className="mt-4">
              <div className="flex justify-between text-[11px] text-white/70 mb-1.5">
                <span>{badgeInfo.current} Badge</span>
                <span>{badgeInfo.remaining} more to {badgeInfo.next}</span>
              </div>
              <div className="w-full bg-white/25 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-white h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </MobilePageHeader>
      ) : (
        /* Compact header for sub-pages */
        <MobilePageHeader backgroundColor="#00b78b" minHeight="0px" className="flex items-end px-2 pb-2.5">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20 shrink-0"
          >
            <Icon name="arrow-left" size={20} className="text-white" />
          </button>
          <span className="flex-1 text-center text-white text-[17px] font-semibold tracking-wide pr-9">
            {pageTitle}
          </span>
        </MobilePageHeader>
      )}

      {/* Main Content */}
      <main
        className={`flex-1 bg-white lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-sm ${fullBleed ? "" : "p-4 lg:p-8"}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile spacer — tall for home, compact for sub-pages */}
        {!fullBleed && (
          <div
            className="lg:hidden"
            style={{
              height: isHome
                ? "calc(var(--sat, 44px) + 196px)"
                : "calc(var(--sat, 44px) + 48px)",
            }}
          />
        )}
        {children}
        {/* Mobile bottom nav clearance */}
        <div className="lg:hidden" style={{ height: "calc(52px + var(--safe-bottom, 0px) + 8px)" }} />
      </main>
    </div>
  );
}
