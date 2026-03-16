"use client";

/**
 * TabShell — persistent tab mount for mobile.
 *
 * Home, Explore and Map are always mounted once the shell is rendered.
 * Switching tabs is a single CSS display toggle — zero re-mount cost.
 *
 * Only rendered on mobile (lg:hidden equivalent via JS check).
 * Desktop continues to use normal Next.js routing via {children} in AppChrome.
 */

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import HomeClient from "@/app/HomeClient";
import ExploreClient from "@/app/explore/ExploreClient";

// Map is large — code-split so it doesn't bloat the initial bundle
const MapClient = dynamic(() => import("@/app/map/MapClient"), {
  ssr: false,
  loading: () => null,
});

const TAB_ROUTES = ["/", "/explore", "/map"];

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/map")
  );
}

export default function TabShell() {
  const pathname = usePathname() || "/";

  const isHome    = pathname === "/";
  const isExplore = pathname.startsWith("/explore");
  const isMap     = pathname.startsWith("/map");

  return (
    <>
      {/* Home */}
      <div
        aria-hidden={!isHome}
        style={{ display: isHome ? "block" : "none" }}
      >
        <HomeClient />
      </div>

      {/* Explore */}
      <div
        aria-hidden={!isExplore}
        style={{ display: isExplore ? "block" : "none" }}
      >
        <ExploreClient />
      </div>

      {/* Map */}
      <div
        aria-hidden={!isMap}
        style={{ display: isMap ? "block" : "none" }}
      >
        <MapClient />
      </div>
    </>
  );
}
