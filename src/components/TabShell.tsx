"use client";

/**
 * TabShell — persistent tab mount for mobile.
 *
 * Home, Discover, Explore, and Map are always mounted. Tab switching is
 * fully imperative — we write display:block/none directly on DOM refs
 * via tabStore subscribers, bypassing React and the Next.js router.
 * Zero re-mount cost, zero scheduler overhead.
 */

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import HomeClient from "@/app/HomeClient";
import ExploreClient from "@/app/explore/ExploreClient";
import DiscoverClient from "@/app/discover/DiscoverClient";
import MapClient from "@/app/map/MapClient";
import { MapBootstrapProvider } from "@/components/MapBootstrapProvider";
import { type TabKey, subscribeTab, syncTabFromPathname, getActiveTab, pathnameToTab } from "@/lib/tabStore";

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/discover") ||
    pathname.startsWith("/map")
  );
}

// Each pane registers its DOM ref and tab key.
// When the store fires, we write display directly — no React render.
function usePaneRef(tab: TabKey) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
  const allPanesRef = useRef<HTMLDivElement>(null);

  // Sync store on real Next.js navigations (deep link, back/forward, map, etc.)
  // If the new pathname is not a tab route (e.g. /map), hide the entire shell
  // so tab panes don't sit on top of the routed page.
  useEffect(() => {
    const wrapper = allPanesRef.current;
    if (!wrapper) return;

    if (isTabRoute(pathname)) {
      wrapper.style.display = "block";
      syncTabFromPathname(pathname);
    } else {
      wrapper.style.display = "none";
    }

    // When setTab() fires while on a non-tab route (e.g. tapping Home while on
    // /map), immediately show the wrapper before usePathname catches up.
    const unsub = subscribeTab(() => {
      wrapper.style.display = "block";
    });
    return unsub;
  }, [pathname]);

  const homeRef     = usePaneRef("home");
  const exploreRef  = usePaneRef("explore");
  const discoverRef = usePaneRef("discover");
  const mapRef      = usePaneRef("map");

  const initialTab = pathnameToTab(pathname) ?? "home";
  const paneStyle = (tab: TabKey): CSSProperties => ({
    display: initialTab === tab ? "block" : "none",
  });

  return (
    <div ref={allPanesRef}>
      <div ref={homeRef} style={paneStyle("home")} aria-hidden={initialTab !== "home"}>
        <HomeClient />
      </div>
      <div ref={exploreRef} style={paneStyle("explore")} aria-hidden={initialTab !== "explore"}>
        <ExploreClient />
      </div>
      <div ref={discoverRef} style={paneStyle("discover")} aria-hidden={initialTab !== "discover"}>
        <DiscoverClient initialPhotos={[]} />
      </div>
      <div ref={mapRef} style={paneStyle("map")} aria-hidden={initialTab !== "map"}>
        <MapBootstrapProvider initialBootstrap={null}>
          <MapClient />
        </MapBootstrapProvider>
      </div>
    </div>
  );
}
