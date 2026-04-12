// src/app/dashboard/DashboardPaneShell.tsx
"use client";

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

export default function DashboardPaneShell({
  activeRoute,
  closingRoute,
  onClosed,
}: {
  activeRoute: PaneRoute | null;
  closingRoute: PaneRoute | null;
  onClosed?: () => void;
}) {
  return (
    <div className="relative overflow-x-hidden">
      {PANE_ROUTES.map((route) => {
        const Page = PANE_COMPONENTS[route];
        const isActive = activeRoute === route;
        const isClosing = closingRoute === route;
        const isVisible = isActive || isClosing;

        return (
          <div
            key={route}
            className={isClosing ? "animate-side-sheet-out" : isActive ? "animate-side-sheet-in" : ""}
            onAnimationEnd={isClosing ? onClosed : undefined}
            style={{
              willChange: "transform",
              visibility: isVisible ? "visible" : "hidden",
              position: isActive ? "relative" : "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: isVisible ? undefined : "translateX(100%)",
            }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
