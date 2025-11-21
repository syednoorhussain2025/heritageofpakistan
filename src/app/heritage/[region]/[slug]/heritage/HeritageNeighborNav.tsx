// src/app/heritage/[region]/[slug]/heritage/HeritageNeighborNav.tsx
"use client";

import React from "react";
import Icon from "@/components/Icon";
import { useLoaderEngine } from "@/components/loader-engine/LoaderEngineProvider";

type HeritageNeighborNavProps = {
  prevHref?: string | null;
  nextHref?: string | null;
  prevTitle?: string | null;
  nextTitle?: string | null;
};

export default function HeritageNeighborNav({
  prevHref,
  nextHref,
  prevTitle,
  nextTitle,
}: HeritageNeighborNavProps) {
  const { startNavigation } = useLoaderEngine();

  if (!prevHref && !nextHref) return null;

  const handlePrevClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!prevHref) return;

    // Use listing loader + slide from left
    startNavigation(prevHref, { direction: "prev" });
  };

  const handleNextClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!nextHref) return;

    // Use listing loader + slide from right
    startNavigation(nextHref, { direction: "next" });
  };

  return (
    <>
      {prevHref && (
        <button
          type="button"
          onClick={handlePrevClick}
          aria-label={prevTitle ? `Previous: ${prevTitle}` : "Previous site"}
          className="
            fixed left-2 bottom-[60px] -translate-y-1/2 z-[60]
            inline-flex items-center justify-center
            rounded-full bg-white shadow-md border border-black/10
            w-9 h-9 hover:bg-black/5 transition
          "
        >
          <Icon name="chevron-left" size={16} />
        </button>
      )}

      {nextHref && (
        <button
          type="button"
          onClick={handleNextClick}
          aria-label={nextTitle ? `Next: ${nextTitle}` : "Next site"}
          className="
            fixed right-2 bottom-[60px] -translate-y-1/2 z-[60]
            inline-flex items-center justify-center
            rounded-full bg-white shadow-md border border-black/10
            w-9 h-9 hover:bg-black/5 transition
          "
        >
          <Icon name="chevron-right" size={16} />
        </button>
      )}
    </>
  );
}
