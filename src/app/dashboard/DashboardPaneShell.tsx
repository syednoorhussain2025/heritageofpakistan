// src/app/dashboard/DashboardPaneShell.tsx
// All 9 dashboard sub-pages are permanently mounted here.
// Switching is a pure CSS translateX — identical to the heritage side sheets.
// No Next.js navigation, no remounting, no loading gap.
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

const CURVE = "cubic-bezier(0.16,1,0.3,1)";
const DURATION = 480;

export default function DashboardPaneShell({ activeRoute }: { activeRoute: PaneRoute | null }) {
  const paneRefs = useRef<Partial<Record<PaneRoute, HTMLDivElement | null>>>({});
  const prevRouteRef = useRef<PaneRoute | null>(null);

  useEffect(() => {
    const refs = paneRefs.current;
    const prev = prevRouteRef.current;
    const next = activeRoute;

    // Navigating back to dashboard home — slide active pane out to the right
    if (next === null) {
      const prevEl = prev ? refs[prev] : null;
      if (prevEl) {
        prevEl.style.transition = `transform ${DURATION}ms ${CURVE}`;
        prevEl.style.transform = "translateX(100%)";
        setTimeout(() => {
          if (prevEl) prevEl.style.visibility = "hidden";
        }, DURATION + 20);
      }
      prevRouteRef.current = null;
      return;
    }

    if (prev === next) return;

    const prevEl = prev ? refs[prev] : null;
    const nextEl = refs[next];

    // Outgoing pane becomes absolute (layout height driven by incoming)
    if (prevEl) {
      prevEl.style.position = "absolute";
      prevEl.style.top = "0";
      prevEl.style.left = "0";
      prevEl.style.right = "0";
    }

    // Incoming pane: relative (owns height), starts off-screen right
    if (nextEl) {
      nextEl.style.position = "relative";
      nextEl.style.visibility = "visible";
      nextEl.style.transition = "none";
      nextEl.style.transform = "translateX(100%)";
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (nextEl) {
          nextEl.style.transition = `transform ${DURATION}ms ${CURVE}`;
          nextEl.style.transform = "translateX(0)";
        }
        if (prevEl) {
          prevEl.style.transition = `transform ${DURATION}ms ${CURVE}`;
          prevEl.style.transform = "translateX(-25%)";
        }
        setTimeout(() => {
          if (prevEl) {
            prevEl.style.transition = "none";
            prevEl.style.transform = "translateX(100%)";
            prevEl.style.visibility = "hidden";
          }
        }, DURATION + 20);
      });
    });

    prevRouteRef.current = next;
  }, [activeRoute]);

  return (
    <div className="relative overflow-x-hidden">
      {PANE_ROUTES.map((route) => {
        const Page = PANE_COMPONENTS[route];
        return (
          <div
            key={route}
            ref={(el) => { paneRefs.current[route] = el; }}
            style={{ willChange: "transform", visibility: "hidden", transform: "translateX(100%)" }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
