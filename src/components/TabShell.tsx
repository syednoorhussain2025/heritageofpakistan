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
  // When this flips true→false→true, we want opacity:0 on the first paint
  // so there's no visible flash of stale scroll state.
  const justActivated = active && !prevActive.current;
  // Update prevActive synchronously during render (before effects)
  prevActive.current = active;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    if (!active) {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.paddingRight = "";
      el.dispatchEvent(new CustomEvent("tab-hidden", { bubbles: true }));
      return;
    }

    if (justActivated) {
      // Reset scroll on all scrollable descendants before revealing
      el.querySelectorAll<HTMLElement>("*").forEach(child => {
        if (child.scrollTop > 0) child.scrollTop = 0;
      });
      // Signal children (e.g. HomeClient) to reset inline transforms
      window.dispatchEvent(new CustomEvent("tab-shown"));
    }

    // Fade in (el starts at opacity:0 from render when justActivated, else already 1)
    el.style.transition = "none";
    el.style.opacity = "0";
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "opacity 0.12s cubic-bezier(0.25,0.1,0.25,1)";
        el.style.opacity = "1";
      });
    });
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div
      ref={divRef}
      aria-hidden={!active}
      style={{ display: active ? "block" : "none", opacity: justActivated ? 0 : 1 }}
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
