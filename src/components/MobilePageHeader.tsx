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

import React, { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  backgroundColor?: string;
  className?: string;
  minHeight?: string;
  zIndex?: number;
  style?: React.CSSProperties;
  id?: string;
};

export default function MobilePageHeader({
  children,
  backgroundColor = "var(--brand-green)",
  className = "",
  minHeight = "180px",
  zIndex = 1100,
  style,
  id,
}: Props) {
  return (
    <div
      id={id}
      className={`lg:hidden fixed inset-x-0 top-0 w-full ${className}`}
      style={{
        zIndex,
        backgroundColor,
        paddingTop: "var(--sat, 44px)",
        minHeight,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
