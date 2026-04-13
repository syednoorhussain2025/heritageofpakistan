"use client";

/**
 * TabShell — persistent tab mount for mobile.
 *
 * Home, Discover, and Explore are always mounted. Tab switching is
 * fully imperative — we write display:block/none directly on DOM refs
 * via tabStore subscribers, bypassing React and the Next.js router.
 * Zero re-mount cost, zero scheduler overhead.
 *
 * Map is intentionally excluded — it has its own server bootstrap
 * pipeline (map/layout.tsx + MapBootstrapProvider) that requires it
 * to be a normal routed page.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import HomeClient from "@/app/HomeClient";
import ExploreClient from "@/app/explore/ExploreClient";
import DiscoverClient from "@/app/discover/DiscoverClient";
import { type TabKey, subscribeTab, syncTabFromPathname, getActiveTab } from "@/lib/tabStore";

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/discover")
  );
}

// Each pane registers its DOM ref and tab key.
// When the store fires, we write display directly — no React render.
function usePaneRef(tab: TabKey) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set initial display from current store state
    const initial = getActiveTab() === tab;
    el.style.display = initial ? "block" : "none";
    el.setAttribute("aria-hidden", initial ? "false" : "true");

    const unsub = subscribeTab((active) => {
      const isActive = active === tab;
      el.style.display = isActive ? "block" : "none";
      el.setAttribute("aria-hidden", isActive ? "false" : "true");

      if (!isActive) {
        el.dispatchEvent(new CustomEvent("tab-hidden", { bubbles: true }));
      } else {
        // Reset scroll on the pane root and tagged children
        el.scrollTop = 0;
        el.querySelectorAll<HTMLElement>("[data-scroll-reset]").forEach((child) => {
          child.scrollTop = 0;
        });
        window.dispatchEvent(new CustomEvent("tab-shown"));
      }
    });

    return unsub;
  // tab is a constant — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

export default function TabShell() {
  const pathname = usePathname() || "/";

  // Sync store when Next.js performs a real navigation (e.g. deep link,
  // browser back/forward, or navigating to/from a non-tab route).
  useEffect(() => {
    syncTabFromPathname(pathname);
  }, [pathname]);

  const homeRef     = usePaneRef("home");
  const exploreRef  = usePaneRef("explore");
  const discoverRef = usePaneRef("discover");

  return (
    <>
      <div ref={homeRef}>
        <HomeClient />
      </div>
      <div ref={exploreRef}>
        <ExploreClient />
      </div>
      <div ref={discoverRef}>
        <DiscoverClient initialPhotos={[]} />
      </div>
    </>
  );
}
