"use client";

/**
 * MobilePageHeader
 *
 * A wrapper for per-page mobile headers. Handles:
 * - Fixed positioning at top of screen
 * - safe-area-inset-top padding so content clears the status bar
 * - Hidden on lg+ screens (desktop uses the main Header)
 * - z-index above page content but below modals/bottom-nav
 */

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  backgroundColor?: string;
  className?: string;
  minHeight?: string;
};

export default function MobilePageHeader({
  children,
  backgroundColor = "#00c9a7",
  className = "",
  minHeight = "180px",
}: Props) {
  const [safeTop, setSafeTop] = useState("44px");

  useEffect(() => {
    // Read the actual safe-area-inset-top value from the browser
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:env(safe-area-inset-top,0px);left:0;width:1px;height:1px;pointer-events:none;";
    document.body.appendChild(el);
    const top = el.getBoundingClientRect().top;
    document.body.removeChild(el);
    // If top > 0 the env() worked; otherwise use 44px fallback for iOS status bar
    setSafeTop(top > 0 ? `${top}px` : "44px");
  }, []);

  return (
    <div
      className={`lg:hidden fixed inset-x-0 top-0 z-[1100] w-full ${className}`}
      style={{
        backgroundColor,
        paddingTop: safeTop,
        minHeight,
      }}
    >
      {children}
    </div>
  );
}
