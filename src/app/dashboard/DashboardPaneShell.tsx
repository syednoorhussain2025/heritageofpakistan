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

  // ── Slide-in ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRoute) return;
    const el = paneRefs.current[activeRoute];
    if (!el) return;

    el.style.visibility = "visible";
    el.style.position = "relative";
    // Remove any leftover animation class, reset to off-screen
    el.classList.remove("animate-side-sheet-in", "animate-side-sheet-out");
    // Apply slide-in — browser handles the keyframe natively
    el.classList.add("animate-side-sheet-in");

    const onEnd = () => {
      el.classList.remove("animate-side-sheet-in");
      el.style.transform = "translateX(0)";
    };
    el.addEventListener("animationend", onEnd, { once: true });
    return () => el.removeEventListener("animationend", onEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute]);

  // ── Slide-out ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!closingRoute) return;
    const el = paneRefs.current[closingRoute];
    if (!el) {
      onClosedRef.current?.();
      return;
    }

    el.style.visibility = "visible";
    el.style.position = "relative";
    el.classList.remove("animate-side-sheet-in", "animate-side-sheet-out");
    el.classList.add("animate-side-sheet-out");

    const onEnd = () => {
      el.classList.remove("animate-side-sheet-out");
      el.style.visibility = "hidden";
      el.style.position = "absolute";
      el.style.transform = "translateX(100%)";
      onClosedRef.current?.();
    };
    el.addEventListener("animationend", onEnd, { once: true });
    return () => el.removeEventListener("animationend", onEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closingRoute]);

  return (
    <div className="relative overflow-x-hidden">
      {PANE_ROUTES.map((route) => {
        const Page = PANE_COMPONENTS[route];
        return (
          <div
            key={route}
            ref={(el) => { if (el) paneRefs.current[route] = el; }}
            style={{
              willChange: "transform",
              visibility: "hidden",
              transform: "translateX(100%)",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
            }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
