// src/components/loader-engine/ListingLoader.tsx
"use client";

import React from "react";

type Direction = "prev" | "next" | "forward" | "back" | null;
type Phase = "entering" | "active" | "exiting";

type ListingLoaderProps = {
  direction?: Direction;
  phase?: Phase;
};

export function ListingLoader({
  direction = "forward",
  phase = "active",
}: ListingLoaderProps) {
  const entering = phase === "entering";
  const exiting = phase === "exiting";

  // Slide in from side only on enter, then sit in place
  const slideClass =
    direction === "back" || direction === "prev"
      ? entering
        ? "-translate-x-full"
        : "translate-x-0"
      : entering
      ? "translate-x-full"
      : "translate-x-0";

  // Fade out on exit
  const opacityClass = exiting ? "opacity-0" : "opacity-100";

  // Faster entry, gentle fade out
  const durationClass = entering
    ? "duration-150"
    : exiting
    ? "duration-200"
    : "duration-150";

  return (
    // Overlay that sits on top of the page
    <div className="fixed inset-0 z-[10] pointer-events-none">
      <div
        className={`
          pointer-events-auto absolute inset-0
          flex flex-col
          transition-transform transition-opacity
          ease-out
          ${durationClass}
          ${slideClass}
          ${opacityClass}
        `}
      >
        {/* Full-page skeleton with its own white background */}
        <div className="w-full h-full flex flex-col relative bg-white">
          {/* Cover skeleton */}
          <div className="w-full bg-neutral-200 animate-pulse pt-[70%]" />

          {/* Info section */}
          <div className="px-4 pt-4 pb-8 space-y-5">
            {/* Title */}
            <div className="h-10 w-4/5 rounded-md bg-neutral-200 animate-pulse" />

            {/* Ratings row – circular stars */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-5 w-5 rounded-full bg-neutral-200 animate-pulse"
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

          {/* Centered spinner overlay */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="h-12 w-12 rounded-full border-2 border-neutral-300 border-t-transparent animate-spin"
              style={{ animationDuration: "0.6s" }}
            />
            <p
              className="mt-3 text-sm text-neutral-700 tracking-wide"
              aria-live="polite"
            >
              Loading site…
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
