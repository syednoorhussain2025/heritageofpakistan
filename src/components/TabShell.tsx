"use client";

/**
 * TabShell — persistent tab mount for mobile.
 *
 * Home and Explore are always mounted. Switching between them is a
 * CSS display toggle — zero re-mount cost.
 *
 * Map is intentionally excluded — it has its own server bootstrap
 * pipeline (map/layout.tsx + MapBootstrapProvider) that requires it
 * to be a normal routed page. Map still loads fast via its own cache.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import HomeClient from "@/app/HomeClient";
import ExploreClient from "@/app/explore/ExploreClient";
import DiscoverClient from "@/app/discover/DiscoverClient";

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/discover")
  );
}

function TabPane({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const prevActive = useRef(active);
  const justActivated = active && !prevActive.current;
  prevActive.current = active;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    if (!active) {
      el.dispatchEvent(new CustomEvent("tab-hidden", { bubbles: true }));
      return;
    }

    if (justActivated) {
      // Reset scroll on all scrollable descendants before revealing
      el.querySelectorAll<HTMLElement>("*").forEach(child => {
        if (child.scrollTop > 0) child.scrollTop = 0;
      });
      window.dispatchEvent(new CustomEvent("tab-shown"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      ref={divRef}
      aria-hidden={!active}
      style={{ display: active ? "block" : "none" }}
    >
      {children}
    </div>
  );
}

export default function TabShell() {
  const pathname = usePathname() || "/";

  const isHome     = pathname === "/";
  const isExplore  = pathname.startsWith("/explore");
  const isDiscover = pathname.startsWith("/discover");

  return (
    <>
      <TabPane active={isHome}><HomeClient /></TabPane>
      <TabPane active={isExplore}><ExploreClient /></TabPane>
      <TabPane active={isDiscover}><DiscoverClient initialPhotos={[]} /></TabPane>
    </>
  );
}
