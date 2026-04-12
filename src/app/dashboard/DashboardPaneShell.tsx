// src/app/dashboard/DashboardPaneShell.tsx
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

const SEARCH_ROUTES = ["/dashboard/mywishlists", "/dashboard/mycollections", "/dashboard/mytrips"];
const FULL_BLEED_ROUTES = ["/dashboard/notebook"];

// A single pane — mirrors SlidePanel in TravelGuideSheet exactly.
// Mounted when open, unmounted after slide-out completes.
function DashboardPane({
  route,
  closing,
  onClosed,
}: {
  route: PaneRoute;
  closing: boolean;
  onClosed: () => void;
}) {
  const Page = PANE_COMPONENTS[route];
  const isFullBleed = FULL_BLEED_ROUTES.includes(route);
  const isSearch = SEARCH_ROUTES.includes(route);

  // Header spacer height mirrors DashboardShellClient's spacer logic
  const spacerHeight = isSearch
    ? "calc(var(--sat, 44px) + 100px)"
    : "calc(var(--sat, 44px) + 48px)";

  return createPortal(
    <div
      className={`fixed inset-0 z-[1000] bg-white overflow-y-auto ${
        closing ? "animate-side-sheet-out" : "animate-side-sheet-in"
      }`}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClosed();
      }}
    >
      {/* Spacer so content clears the fixed green header above */}
      {!isFullBleed && <div style={{ height: spacerHeight }} />}
      <Page />
    </div>,
    document.body
  );
}

export default function DashboardPaneShell({
  activeRoute,
  closingRoute,
  onClosed,
}: {
  activeRoute: PaneRoute | null;
  closingRoute: PaneRoute | null;
  onClosed?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  // The active pane is mounted and animating in (closing=false).
  // When back is pressed, activeRoute becomes null and closingRoute is set —
  // we keep rendering the pane with closing=true until animationend unmounts it.
  const route = activeRoute ?? closingRoute;
  if (!route) return null;

  return (
    <DashboardPane
      key={route}
      route={route}
      closing={!!closingRoute}
      onClosed={() => onClosed?.()}
    />
  );
}
