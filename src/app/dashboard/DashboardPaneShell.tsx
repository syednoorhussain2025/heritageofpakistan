// src/app/dashboard/DashboardPaneShell.tsx
// Keeps the 5 prefetched dashboard pages always mounted.
// Switching between them uses a CSS translateX slide — identical to the
// heritage side-sheet animation — so content is instant, never re-fetches.
"use client";

import { useEffect, useRef, useState } from "react";
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

interface Props {
  activeRoute: PaneRoute;
}

export default function DashboardPaneShell({ activeRoute }: Props) {
  const prevRoute = useRef<PaneRoute | null>(null);
  const paneRefs = useRef<Partial<Record<PaneRoute, HTMLDivElement | null>>>({});

  useEffect(() => {
    const prev = prevRoute.current;
    const next = activeRoute;

    if (prev === next) return;

    const prevEl = prev ? paneRefs.current[prev] : null;
    const nextEl = paneRefs.current[next];

    if (prevEl) {
      // Slide old pane out to the left
      prevEl.style.transition = "none";
      prevEl.style.transform = "translateX(0)";
      prevEl.style.display = "block";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          prevEl.style.transition = "transform 0.52s cubic-bezier(0.16,1,0.3,1)";
          prevEl.style.transform = "translateX(-30%)";
          // Hide after animation
          setTimeout(() => {
            prevEl.style.display = "none";
            prevEl.style.transform = "translateX(0)";
            prevEl.style.transition = "none";
          }, 540);
        });
      });
    }

    if (nextEl) {
      // Slide new pane in from the right
      nextEl.style.transition = "none";
      nextEl.style.transform = "translateX(100%)";
      nextEl.style.display = "block";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nextEl.style.transition = "transform 0.52s cubic-bezier(0.16,1,0.3,1)";
          nextEl.style.transform = "translateX(0)";
        });
      });
    }

    prevRoute.current = next;
  }, [activeRoute]);

  // On first mount — show active pane instantly, hide others
  useEffect(() => {
    PANE_ROUTES.forEach((route) => {
      const el = paneRefs.current[route];
      if (!el) return;
      if (route === activeRoute) {
        el.style.display = "block";
        el.style.transform = "translateX(0)";
        prevRoute.current = activeRoute;
      } else {
        el.style.display = "none";
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative overflow-hidden">
      {PANE_ROUTES.map((route) => {
        const Page = PANE_COMPONENTS[route];
        return (
          <div
            key={route}
            ref={(el) => { paneRefs.current[route] = el; }}
            style={{ display: "none", willChange: "transform" }}
          >
            <Page />
          </div>
        );
      })}
    </div>
  );
}
