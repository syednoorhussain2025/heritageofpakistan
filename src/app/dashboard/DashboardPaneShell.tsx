// src/app/dashboard/DashboardPaneShell.tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { SearchContext } from "./SearchContext";
import ProfilePaneClient from "./profile/ProfilePaneClient";
import MyWishlistsPage from "./mywishlists/page";
import MyCollectionsPage from "./mycollections/page";
import DashboardMyTripsPage from "./mytrips/page";
import MyReviewsPage from "./myreviews/page";
import PlacesVisitedPage from "./placesvisited/page";
import PortfolioPage from "./portfolio/page";
import NotebookPage from "./notebook/page";
import AccountDetailsPaneClient from "./account-details/AccountDetailsPaneClient";

export const PANE_ROUTES = [
  "/dashboard/profile",
  "/dashboard/mywishlists",
  "/dashboard/mycollections",
  "/dashboard/mytrips",
  "/dashboard/myreviews",
  "/dashboard/placesvisited",
  "/dashboard/portfolio",
  "/dashboard/notebook",
  "/dashboard/account-details",
] as const;

export type PaneRoute = (typeof PANE_ROUTES)[number];

export function isPaneRoute(pathname: string): pathname is PaneRoute {
  return PANE_ROUTES.includes(pathname as PaneRoute);
}

const PANE_COMPONENTS: Record<PaneRoute, React.ComponentType> = {
  "/dashboard/profile": ProfilePaneClient,
  "/dashboard/mywishlists": MyWishlistsPage,
  "/dashboard/mycollections": MyCollectionsPage,
  "/dashboard/mytrips": DashboardMyTripsPage,
  "/dashboard/myreviews": MyReviewsPage,
  "/dashboard/placesvisited": PlacesVisitedPage,
  "/dashboard/portfolio": PortfolioPage,
  "/dashboard/notebook": NotebookPage,
  "/dashboard/account-details": AccountDetailsPaneClient,
};

const PAGE_TITLES: Record<PaneRoute, string> = {
  "/dashboard/profile": "Profile",
  "/dashboard/mywishlists": "Saved Lists",
  "/dashboard/mycollections": "Collections",
  "/dashboard/mytrips": "My Trips",
  "/dashboard/myreviews": "My Reviews",
  "/dashboard/placesvisited": "Places Visited",
  "/dashboard/portfolio": "My Portfolio",
  "/dashboard/notebook": "My Notes",
  "/dashboard/account-details": "Account Details",
};

const PAGE_ICONS: Record<PaneRoute, string> = {
  "/dashboard/profile": "user-round",
  "/dashboard/mywishlists": "layout-list",
  "/dashboard/mycollections": "cards",
  "/dashboard/mytrips": "line-segments-light",
  "/dashboard/myreviews": "star-light",
  "/dashboard/placesvisited": "person-simple-hike-light",
  "/dashboard/portfolio": "layout-grid",
  "/dashboard/notebook": "book-open-text-light",
  "/dashboard/account-details": "square-user-round",
};

const SEARCH_ROUTES: PaneRoute[] = ["/dashboard/mywishlists", "/dashboard/mycollections", "/dashboard/mytrips"];
const FULL_BLEED_ROUTES: PaneRoute[] = ["/dashboard/notebook"];

// Mirrors SlidePanel in TravelGuideSheet exactly:
// - owns its own header with back button
// - closing state drives the animation class
// - onAnimationEnd fires onClose — parent never re-renders during the animation
function DashboardPane({
  route,
  searchQ,
  onSearchChange,
  onClose,
}: {
  route: PaneRoute;
  searchQ: string;
  onSearchChange: (q: string) => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const Page = PANE_COMPONENTS[route];
  const isFullBleed = FULL_BLEED_ROUTES.includes(route);
  const isSearch = SEARCH_ROUTES.includes(route);
  const title = PAGE_TITLES[route];
  const icon = PAGE_ICONS[route];

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <div
      className={`fixed inset-0 bg-white flex flex-col ${closing ? "animate-side-sheet-out" : "animate-side-sheet-in"}`}
      style={{ zIndex: 1200, willChange: "transform" }}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header — same structure as DashboardShellClient's mobile headers */}
      <div
        className="shrink-0 bg-[var(--brand-green)] lg:hidden"
        style={{ paddingTop: "var(--sat, 44px)" }}
      >
        {isSearch ? (
          <div className="flex flex-col px-2 pb-3">
            <div className="flex items-end pb-0.5">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Back"
                className="w-[46px] h-[46px] ml-2 flex items-center justify-center rounded-full bg-white/20 text-white shrink-0 transition-transform active:scale-90"
              >
                <svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor">
                  <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
                </svg>
              </button>
              <span className="flex-1 flex items-center justify-center gap-1.5 text-white text-[17px] font-semibold tracking-wide pr-9">
                <Icon name={icon} size={22} className="text-white/90 shrink-0" />
                {title}
              </span>
            </div>
            <div className="px-5 pt-2">
              <input
                type="search"
                value={searchQ}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}…`}
                className="w-full rounded-full bg-white px-4 py-2 text-[15px] text-gray-800 placeholder-gray-400 outline-none"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-end px-2 pb-2.5">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Back"
              className="w-[46px] h-[46px] ml-2 flex items-center justify-center rounded-full bg-white/20 text-white shrink-0 transition-transform active:scale-90"
            >
              <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor">
                <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
              </svg>
            </button>
            <span className="flex-1 flex items-center justify-center gap-1.5 text-white text-[17px] font-semibold tracking-wide pr-9">
              <Icon name={icon} size={22} className="text-white/90 shrink-0" />
              {title}
            </span>
          </div>
        )}
      </div>

      {/* Content — search panes get their q from local state via context */}
      <SearchContext.Provider value={{ q: searchQ }}>
        <div className={`flex-1 min-h-0 ${isFullBleed ? "" : "overflow-y-auto"}`}>
          <Page />
        </div>
      </SearchContext.Provider>
    </div>,
    document.body
  );
}

export default function DashboardPaneShell({
  activeRoute,
  onClosed,
}: {
  activeRoute: PaneRoute | null;
  onClosed?: () => void;
}) {
  const [searchQ, setSearchQ] = useState("");

  if (typeof document === "undefined" || !activeRoute) return null;

  return (
    <DashboardPane
      key={activeRoute}
      route={activeRoute}
      searchQ={searchQ}
      onSearchChange={setSearchQ}
      onClose={() => {
        setSearchQ("");
        onClosed?.();
      }}
    />
  );
}
