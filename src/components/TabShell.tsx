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

export function isTabRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/explore")
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

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    if (!active && prevActive.current) {
      // Just became hidden — release scroll lock and signal children to close panels
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.paddingRight = "";
      el.dispatchEvent(new CustomEvent("tab-hidden", { bubbles: true }));
    }

    if (active && !prevActive.current) {
      // Just became active — fade in
      el.style.opacity = "0";
      el.style.transition = "none";
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = "opacity 0.12s cubic-bezier(0.25,0.1,0.25,1)";
          el.style.opacity = "1";
        });
      });
      prevActive.current = true;
      return () => cancelAnimationFrame(raf);
    }

    prevActive.current = active;
  }, [active]);

  return (
    <div
      ref={divRef}
      aria-hidden={!active}
      style={{ display: active ? "block" : "none", opacity: active ? 1 : 0 }}
    >
      {children}
    </div>
  );
}

export default function TabShell() {
  const pathname = usePathname() || "/";

  const isHome    = pathname === "/";
  const isExplore = pathname.startsWith("/explore");

  return (
    <>
      <TabPane active={isHome}><HomeClient /></TabPane>
      <TabPane active={isExplore}><ExploreClient /></TabPane>
    </>
  );
}
