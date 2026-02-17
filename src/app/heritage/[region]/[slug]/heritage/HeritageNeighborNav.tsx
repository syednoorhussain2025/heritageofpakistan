// src/app/heritage/[region]/[slug]/heritage/HeritageNeighborNav.tsx
"use client";

import React from "react";
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
            w-9 h-9 text-slate-700 hover:bg-black/5 transition
          "
        >
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
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
            w-9 h-9 text-slate-700 hover:bg-black/5 transition
          "
        >
          <svg
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
          </svg>
        </button>
      )}
    </>
  );
}
