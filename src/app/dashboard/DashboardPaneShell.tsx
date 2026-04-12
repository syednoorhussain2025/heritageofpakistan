// src/app/dashboard/DashboardPaneShell.tsx
"use client";

import { useEffect, useRef } from "react";
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
  const paneRefs = useRef<Partial<Record<PaneRoute, HTMLDivElement | null>>>({});
  const onClosedRef = useRef(onClosed);
  useEffect(() => { onClosedRef.current = onClosed; });

  // Slide-in
  useEffect(() => {
    if (!activeRoute) return;
    const el = paneRefs.current[activeRoute];
    if (!el) return;
    // Restore in-flow positioning for slide-in
    el.style.position = "relative";
    el.style.top = "";
    el.style.left = "";
    el.style.right = "";
    el.style.bottom = "";
    el.style.width = "";
    el.style.zIndex = "";
    el.style.transform = "";
    el.style.transition = "";
    el.style.visibility = "visible";
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    el.className = "animate-side-sheet-in";
  }, [activeRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slide-out
  useEffect(() => {
    if (!closingRoute) return;
    const el = paneRefs.current[closingRoute];
    if (!el) { onClosedRef.current?.(); return; }

    // Snap to fixed full-screen so it floats above everything during slide-out.
    // We capture the current scroll offset so it appears visually identical
    // to where it was, then the keyframe slides it right off screen.
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.right = "0";
    el.style.bottom = "0";
    el.style.width = "";
    el.style.zIndex = "9999";
    el.style.transform = "";
    el.style.transition = "";
    el.style.visibility = "visible";
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    el.className = "animate-side-sheet-out";

    const handleEnd = () => {
      el.className = "";
      el.style.visibility = "hidden";
      el.style.transform = "translateX(100%)";
      el.style.position = "absolute";
      el.style.top = "0";
      el.style.left = "0";
      el.style.right = "0";
      el.style.bottom = "";
      el.style.zIndex = "";
      onClosedRef.current?.();
    };
    el.addEventListener("animationend", handleEnd, { once: true });
  }, [closingRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      {PANE_ROUTES.map((route) => {
        const Page = PANE_COMPONENTS[route];
        return (
          <div
            key={route}
            ref={(el) => {
              if (!el) return;
              if (!paneRefs.current[route]) {
                el.style.willChange = "transform";
                el.style.visibility = "hidden";
                el.style.transform = "translateX(100%)";
                el.style.position = "absolute";
                el.style.top = "0";
                el.style.left = "0";
                el.style.right = "0";
              }
              paneRefs.current[route] = el;
            }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
