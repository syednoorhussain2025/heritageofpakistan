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

export default function DashboardPaneShell({
  activeRoute,
  closingRoute,
  onClosed,
}: {
  activeRoute: PaneRoute | null;
  // The route that is currently sliding out (set by parent before clearing activeRoute)
  closingRoute: PaneRoute | null;
  onClosed?: () => void;
}) {
  const paneRefs = useRef<Partial<Record<PaneRoute, HTMLDivElement | null>>>({});
  const prevRouteRef = useRef<PaneRoute | null>(null);

  // ── Slide-out: triggered when closingRoute becomes non-null ──────────────
  useEffect(() => {
    if (!closingRoute) return;
    const el = paneRefs.current[closingRoute];

    if (!el) {
      onClosed?.();
      return;
    }

    // Force into view
    el.style.transition = "none";
    el.style.position = "relative";
    el.style.visibility = "visible";
    el.style.transform = "translateX(0)";

    // Force a style flush so Safari sees the "from" state before we set the transition.
    // getComputedStyle is the most reliable cross-browser way to do this.
    void el.getBoundingClientRect();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${DURATION}ms ${CURVE}`;
        el.style.transform = "translateX(100%)";

        setTimeout(() => {
          el.style.transition = "none";
          el.style.visibility = "hidden";
          el.style.position = "absolute";
          onClosed?.();
        }, DURATION + 20);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closingRoute]);

  // ── Slide-in: triggered when activeRoute becomes non-null ────────────────
  useEffect(() => {
    if (!activeRoute) return;

    const prev = prevRouteRef.current;
    if (prev === activeRoute) return;

    const prevEl = prev ? paneRefs.current[prev] : null;
    const nextEl = paneRefs.current[activeRoute];

    if (prevEl) {
      prevEl.style.position = "absolute";
      prevEl.style.top = "0";
      prevEl.style.left = "0";
      prevEl.style.right = "0";
    }

    if (nextEl) {
      nextEl.style.position = "relative";
      nextEl.style.visibility = "visible";
      nextEl.style.transition = "none";
      nextEl.style.transform = "translateX(100%)";
    }

    // Force style flush before animating (required on Safari)
    if (nextEl) void nextEl.getBoundingClientRect();

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

    prevRouteRef.current = activeRoute;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute]);

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
