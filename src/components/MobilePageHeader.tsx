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

import { type ReactNode } from "react";

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
  return (
    <div
      className={`lg:hidden fixed inset-x-0 top-0 z-[1100] w-full ${className}`}
      style={{
        backgroundColor,
        paddingTop: "var(--sat, 44px)",
        minHeight,
      }}
    >
      {children}
    </div>
  );
}
