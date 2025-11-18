// src/app/heritage/[region]/[slug]/heritage/HeritageNeighborNav.tsx
"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

type HeritageNeighborNavProps = {
  prevHref?: string | null;
  nextHref?: string | null;
  prevTitle?: string | null;
  nextTitle?: string | null;
};

type Direction = "prev" | "next" | null;

export default function HeritageNeighborNav({
  prevHref,
  nextHref,
  prevTitle,
  nextTitle,
}: HeritageNeighborNavProps) {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [direction, setDirection] = useState<Direction>(null);
  const [entered, setEntered] = useState(false);

  if (!prevHref && !nextHref) return null;

  const navigateWithTransition = useCallback(
    (target: string | null | undefined, dir: Direction) => {
      if (!target || !dir || isLoading) return;

      setDirection(dir);
      setIsLoading(true);
      setEntered(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });

      setTimeout(() => {
        router.push(target);
      }, 320);
    },
    [router, isLoading]
  );

  const handlePrevClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateWithTransition(prevHref, "prev");
  };

  const handleNextClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigateWithTransition(nextHref, "next");
  };

  const loaderTransformClass =
    direction === "next"
      ? entered
        ? "translate-x-0"
        : "translate-x-full"
      : direction === "prev"
      ? entered
        ? "translate-x-0"
        : "-translate-x-full"
      : "translate-x-0";

  return (
    <>
      {prevHref && (
        <button
          type="button"
          onClick={handlePrevClick}
          aria-label={prevTitle ? `Previous: ${prevTitle}` : "Previous site"}
          className="
            fixed left-2 top-1/2 -translate-y-1/2 z-[60]
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
            fixed right-2 top-1/2 -translate-y-1/2 z-[60]
            inline-flex items-center justify-center
            rounded-full bg-white shadow-md border border-black/10
            w-9 h-9 hover:bg-black/5 transition
          "
        >
          <Icon name="chevron-right" size={16} />
        </button>
      )}

      {isLoading && direction && (
        <div className="fixed inset-0 z-[20] bg-[#f8f8f8] overflow-hidden">
          <div
            className={`
              relative w-full h-full
              transition-transform duration-300 ease-out
              ${loaderTransformClass}
            `}
          >
            <div className="w-full h-full bg-white flex flex-col">
              {/* COVER IMAGE SKELETON */}
              <div className="w-full bg-neutral-200 animate-pulse pt-[70%]" />

              {/* INFO SECTION */}
              <div className="px-4 pt-4 pb-8 space-y-5">
                {/* Title */}
                <div className="h-8 w-4/5 rounded-md bg-neutral-200 animate-pulse" />

                {/* Ratings row — STARS ONLY (circular) */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 w-4 rounded-full bg-neutral-200 animate-pulse"
                      />
                    ))}
                  </div>
                </div>

                {/* Tagline paragraph */}
                <div className="space-y-2">
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-11/12 rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-full rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-9/12 rounded bg-neutral-200 animate-pulse" />
                  <div className="h-3.5 w-8/12 rounded bg-neutral-200 animate-pulse" />
                </div>
              </div>
            </div>

            {/* SPINNER */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin" />
              <p className="mt-3 text-sm text-neutral-700 tracking-wide">
                Loading next site…
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
