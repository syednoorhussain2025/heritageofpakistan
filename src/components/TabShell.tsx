"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import HomeClient from "@/app/HomeClient";
import ExploreClient from "@/app/explore/ExploreClient";

const MapClient = dynamic(() => import("@/app/map/MapClient"), {
  ssr: false,
  loading: () => null,
});

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore") ||
    pathname.startsWith("/map")
  );
}

function TabPane({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const [opacity, setOpacity] = useState(active ? 1 : 0);
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      // Just became active — fade in
      setOpacity(0);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setOpacity(1));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!active) {
      setOpacity(0);
    }
    prevActive.current = active;
  }, [active]);

  return (
    <div
      aria-hidden={!active}
      style={{
        display: active ? "block" : "none",
        opacity,
        transition: active ? "opacity 0.12s cubic-bezier(0.25,0.1,0.25,1)" : "none",
      }}
    >
      {children}
    </div>
  );
}

export default function TabShell() {
  const pathname = usePathname() || "/";

  const isHome    = pathname === "/";
  const isExplore = pathname.startsWith("/explore");
  const isMap     = pathname.startsWith("/map");

  return (
    <>
      <TabPane active={isHome}><HomeClient /></TabPane>
      <TabPane active={isExplore}><ExploreClient /></TabPane>
      <TabPane active={isMap}><MapClient /></TabPane>
    </>
  );
}
