// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight } from "@/lib/haptics";
import { countUserVisits } from "@/lib/db/visited";
import { progressToNextBadge } from "@/lib/db/badges";
import { SearchContext } from "./SearchContext";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";
import { useProfile } from "@/components/ProfileProvider";

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

export default function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useAuthUserId();
  const { startNavigation } = useLoaderEngine();

  const isHome = pathname === "/dashboard";

  const searchRoutes = ["/dashboard/mywishlists", "/dashboard/mycollections", "/dashboard/mytrips"];
  const showSearch = typeof pathname === "string" && searchRoutes.includes(pathname);
  const [headerSearchQ, setHeaderSearchQ] = useState("");

  // Reset search when navigating away from a search route
  useEffect(() => {
    if (!showSearch) setHeaderSearchQ("");
  }, [pathname, showSearch]);

  // Profile from global provider — already fetched, never null after first load
  const { profile, loading: profileLoading } = useProfile();

  // visitedCount — use module cache so it survives navigation without re-fetching
  const [visitedCount, setVisitedCount] = useState<number>(
    cachedVisitedUserId === userId && cachedVisitedCount !== null ? cachedVisitedCount : 0
  );
  const [badgeInfo, setBadgeInfo] = useState({ current: "Beginner", next: null as string | null, remaining: 0 });
  const [visitedLoaded, setVisitedLoaded] = useState(
    cachedVisitedUserId === userId && cachedVisitedCount !== null
  );

  useEffect(() => {
    if (!userId) return;
    // Already cached for this user — no fetch needed
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

  const fullBleed =
    typeof pathname === "string" && pathname.startsWith("/dashboard/notebook");

  const pageTitleMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/profile": "Profile",
    "/dashboard/mywishlists": "Saved Lists",
    "/dashboard/mycollections": "Collections",
    "/dashboard/mycollections/photos": "Collected Photos",
    "/dashboard/mytrips": "My Trips",
    "/dashboard/notebook": "My Notes",
    "/dashboard/placesvisited": "Places Visited",
    "/dashboard/myreviews": "My Reviews",
    "/dashboard/portfolio": "My Portfolio",
    "/dashboard/account-details": "Account Details",
  };

  const pageIconMap: Record<string, string> = {
    "/dashboard/profile": "user-round",
    "/dashboard/mywishlists": "layout-list",
    "/dashboard/mycollections": "cards",
    "/dashboard/mycollections/photos": "cards",
    "/dashboard/mytrips": "line-segments-light",
    "/dashboard/notebook": "book-open-text-light",
    "/dashboard/placesvisited": "person-simple-hike-light",
    "/dashboard/myreviews": "star-light",
    "/dashboard/portfolio": "layout-grid",
    "/dashboard/account-details": "square-user-round",
  };

  const pageTitle =
    pageTitleMap[pathname ?? ""] ??
    (pathname?.startsWith("/dashboard/mywishlists/") ? "Saved List" :
    pathname?.startsWith("/dashboard/mycollections/") ? "Collection" :
    pathname?.startsWith("/dashboard/mytrips/") ? "Trip Details" :
    pathname?.startsWith("/dashboard/myreviews/") ? "Review" :
    pathname?.startsWith("/dashboard/notebook/") ? "Note" : "Dashboard");

  const pageIcon =
    pageIconMap[pathname ?? ""] ??
    (pathname?.startsWith("/dashboard/mywishlists/") ? "layout-list" :
    pathname?.startsWith("/dashboard/mycollections/") ? "cards" :
    pathname?.startsWith("/dashboard/mytrips/") ? "line-segments-light" :
    pathname?.startsWith("/dashboard/myreviews/") ? "star-light" :
    pathname?.startsWith("/dashboard/notebook/") ? "book-open-text-light" : undefined);

  // Smart back: nested routes go to their parent, not all the way to /dashboard
  function handleBack() {
    void hapticLight();
    if (pathname?.startsWith("/dashboard/mywishlists/")) {
      startNavigation("/dashboard/mywishlists", { overlay: "white-silent-back" });
    } else if (pathname === "/dashboard/mycollections/photos" || (pathname?.startsWith("/dashboard/mycollections/") && pathname !== "/dashboard/mycollections")) {
      startNavigation("/dashboard/mycollections", { overlay: "white-silent-back" });
    } else if (pathname?.startsWith("/dashboard/mytrips/")) {
      startNavigation("/dashboard/mytrips", { overlay: "white-silent-back" });
    } else if (pathname?.startsWith("/dashboard/myreviews/")) {
      startNavigation("/dashboard/myreviews", { overlay: "white-silent-back" });
    } else if (pathname?.startsWith("/dashboard/notebook/")) {
      startNavigation("/dashboard/notebook", { overlay: "white-silent-back" });
    } else if (isHome) {
      startNavigation("/", { overlay: "white-silent-back" });
    } else {
      startNavigation("/dashboard", { overlay: "white-silent-back" });
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
    // Require horizontal swipe > 60px, vertical drift < 50px, and must start from left 40px edge
    if (dx > 60 && dy < 50 && touchStartX.current < 40) {
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
        {/* Sign out — bottom of sidebar */}
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

      {/* Spacer — desktop only */}
      <div className="hidden lg:block w-64" />

      {/* ── Mobile header ── */}
      {isHome ? (
        /* Tall profile header for /dashboard home */
        <MobilePageHeader backgroundColor="var(--brand-green)" minHeight="0px" className="flex flex-col px-5 pb-5">
          {/* Top row: back + title */}
          <div className="flex items-center pt-1">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20 shrink-0"
            >
              <Icon name="circle-arrow-left" size={30} className="text-white" />
            </button>
            <span className="flex-1 flex items-center justify-center gap-1.5 text-center text-white text-[17px] font-semibold tracking-wide pr-9">
              <Icon name="layout-board-split" size={24} className="text-white/90 shrink-0" />
              My Dashboard
            </span>
          </div>

          {/* Profile row — always same height whether loading or loaded */}
          <div className="flex items-center gap-4 mt-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full border-2 border-white/60 overflow-hidden bg-white/20 shrink-0 flex items-center justify-center">
              {!profileLoading && (thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">{initials}</span>
              ))}
            </div>

            {/* Name + badge — skeleton holds space, real content fades in */}
            <div className="flex-1 min-w-0 relative" style={{ minHeight: "46px" }}>
              {/* Skeleton — visible only while loading */}
              <div
                className="animate-pulse space-y-2 absolute inset-0"
                style={{
                  opacity: profileLoading ? 1 : 0,
                  transition: "opacity 0.3s ease",
                  pointerEvents: "none",
                }}
              >
                <div className="h-5 bg-white/25 rounded-full w-36" />
                <div className="h-4 bg-white/20 rounded-full w-20" />
              </div>
              {/* Real content — fades in on load */}
              <div
                style={{
                  opacity: profileLoading ? 0 : 1,
                  transition: "opacity 0.5s ease",
                }}
              >
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

            {/* Places visited count — fades in when data arrives, placeholder holds space */}
            <div className="shrink-0 text-right" style={{ minWidth: "56px" }}>
              <div
                style={{
                  opacity: visitedLoaded ? 1 : 0,
                  transition: "opacity 0.5s ease",
                }}
              >
                <p className="text-white text-[26px] font-bold leading-none">{visitedCount}</p>
                <p className="text-white/70 text-[11px] mt-0.5">places visited</p>
              </div>
            </div>
          </div>

          {/* Progress bar — always rendered to lock height, fades in when data arrives */}
          <div className="mt-4" style={{ minHeight: "28px" }}>
            <div
              style={{
                opacity: visitedLoaded ? 1 : 0,
                transition: "opacity 0.5s ease 0.1s",
              }}
            >
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
      ) : showSearch ? (
        /* Compact header with search bar for wishlists / collections / trips */
        <MobilePageHeader backgroundColor="var(--brand-green)" minHeight="0px" className="flex flex-col px-2 pb-3">
          <div className="flex items-end pb-0.5">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20 shrink-0"
            >
              <Icon name="circle-arrow-left" size={30} className="text-white" />
            </button>
            <span className="flex-1 relative flex items-center justify-center pr-9" style={{ minHeight: "28px" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={pathname}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-1.5 text-white text-[17px] font-semibold tracking-wide"
                >
                  {pageIcon && <Icon name={pageIcon} size={22} className="text-white/90 shrink-0" />}
                  {pageTitle}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          <div className="px-5 pt-2">
            <input
              type="search"
              value={headerSearchQ}
              onChange={(e) => setHeaderSearchQ(e.target.value)}
              placeholder={`Search ${pageTitle.toLowerCase()}…`}
              className="w-full rounded-full bg-white px-4 py-2 text-[15px] text-gray-800 placeholder-gray-400 outline-none"
              style={{ fontSize: "16px" }}
            />
          </div>
        </MobilePageHeader>
      ) : (
        /* Compact header for sub-pages */
        <MobilePageHeader backgroundColor="var(--brand-green)" minHeight="0px" className="flex items-end px-2 pb-2.5">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/20 shrink-0"
          >
            <Icon name="circle-arrow-left" size={30} className="text-white" />
          </button>
          <span className="flex-1 relative flex items-center justify-center pr-9" style={{ minHeight: "28px" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1.5 text-white text-[17px] font-semibold tracking-wide"
              >
                {pageIcon && <Icon name={pageIcon} size={22} className="text-white/90 shrink-0" />}
                {pageTitle}
              </motion.span>
            </AnimatePresence>
          </span>
        </MobilePageHeader>
      )}

      {/* Main Content */}
      <main
        className={`flex-1 bg-white lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-sm dashboard-no-longpress ${fullBleed ? "" : "p-4 lg:p-8"}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile spacer — tall for home, taller for search routes, compact for sub-pages */}
        {!fullBleed && (
          <div
            className="lg:hidden"
            style={{
              height: isHome
                ? "calc(var(--sat, 44px) + 196px)"
                : showSearch
                ? "calc(var(--sat, 44px) + 100px)"
                : "calc(var(--sat, 44px) + 48px)",
            }}
          />
        )}
        <SearchContext.Provider value={{ q: headerSearchQ }}>
          {children}
        </SearchContext.Provider>
        {/* Mobile bottom nav clearance */}
        <div className="lg:hidden" style={{ height: "calc(52px + var(--safe-bottom, 0px) + 8px)" }} />
      </main>
    </div>
  );
}
