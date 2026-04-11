// src/app/dashboard/DashboardPaneShell.tsx
"use client";

import { useEffect, useRef } from "react";
import MyWishlistsPage from "./mywishlists/page";
import MyCollectionsPage from "./mycollections/page";
import DashboardMyTripsPage from "./mytrips/page";
import MyReviewsPage from "./myreviews/page";
import PlacesVisitedPage from "./placesvisited/page";

export const PANE_ROUTES = [
  "/dashboard/mywishlists",
  "/dashboard/mycollections",
  "/dashboard/mytrips",
  "/dashboard/myreviews",
  "/dashboard/placesvisited",
] as const;

export type PaneRoute = (typeof PANE_ROUTES)[number];

export function isPaneRoute(pathname: string): pathname is PaneRoute {
  return PANE_ROUTES.includes(pathname as PaneRoute);
}

const PANE_COMPONENTS: Record<PaneRoute, React.ComponentType> = {
  "/dashboard/mywishlists": MyWishlistsPage,
  "/dashboard/mycollections": MyCollectionsPage,
  "/dashboard/mytrips": DashboardMyTripsPage,
  "/dashboard/myreviews": MyReviewsPage,
  "/dashboard/placesvisited": PlacesVisitedPage,
};

const CURVE = "cubic-bezier(0.16,1,0.3,1)";
const DURATION = 480; // ms

export default function DashboardPaneShell({ activeRoute }: { activeRoute: PaneRoute }) {
  const paneRefs = useRef<Partial<Record<PaneRoute, HTMLDivElement | null>>>({});
  const prevRouteRef = useRef<PaneRoute | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const refs = paneRefs.current;

    // First paint — show active, hide rest, no animation
    if (!initializedRef.current) {
      initializedRef.current = true;
      PANE_ROUTES.forEach((route) => {
        const el = refs[route];
        if (!el) return;
        if (route === activeRoute) {
          el.style.transform = "translateX(0)";
          el.style.visibility = "visible";
          el.style.position = "relative";
        } else {
          el.style.transform = "translateX(100%)";
          el.style.visibility = "hidden";
          el.style.position = "absolute";
          el.style.top = "0";
          el.style.left = "0";
          el.style.right = "0";
        }
      });
      prevRouteRef.current = activeRoute;
      return;
    }

    const prev = prevRouteRef.current;
    const next = activeRoute;
    if (prev === next) return;

    const prevEl = prev ? refs[prev] : null;
    const nextEl = refs[next];

    // Prev becomes absolute so it doesn't affect layout during animation
    if (prevEl) {
      prevEl.style.position = "absolute";
      prevEl.style.top = "0";
      prevEl.style.left = "0";
      prevEl.style.right = "0";
    }
    // Next becomes relative (owns the layout height) and starts off-screen right
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
            style={{
              willChange: "transform",
              visibility: "hidden",
              transform: "translateX(100%)",
            }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
