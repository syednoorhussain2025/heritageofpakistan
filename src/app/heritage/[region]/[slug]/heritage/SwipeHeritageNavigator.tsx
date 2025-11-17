// src/app/heritage/[region]/[slug]/heritage/SwipeHeritageNavigator.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

type PreviewCover = {
  url: string;
  width?: number | null;
  height?: number | null;
  blurhash?: string | null;
  blurDataURL?: string | null;
  caption?: string | null;
  credit?: string | null;
} | null;

type NeighborPreview = {
  href: string;
  title: string;
  tagline?: string | null;
  cover?: PreviewCover;
};

type SwipeHeritageNavigatorProps = {
  prev?: NeighborPreview | null;
  next?: NeighborPreview | null;
  children: React.ReactNode;
  className?: string;
};

export default function SwipeHeritageNavigator({
  prev = null,
  next = null,
  children,
  className = "",
}: SwipeHeritageNavigatorProps) {
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0); // px
  const [isAnimating, setIsAnimating] = useState(false);

  // Enable only on mobile-ish widths
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");

    const handleChange = () => {
      setEnabled(mql.matches);
      setViewportWidth(window.innerWidth);
    };
    handleChange();

    mql.addEventListener("change", handleChange);
    window.addEventListener("resize", handleChange);

    return () => {
      mql.removeEventListener("change", handleChange);
      window.removeEventListener("resize", handleChange);
    };
  }, []);

  const resetPosition = () => {
    setIsAnimating(true);
    setSwipeOffset(0);
    const timeout = setTimeout(() => {
      setIsAnimating(false);
    }, 220);
    return () => clearTimeout(timeout);
  };

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!enabled || viewportWidth === 0) return;

      const { dir, deltaX } = eventData;
      if (dir !== "Left" && dir !== "Right") return;

      // If there is no neighbour in that direction, still allow a tiny pull but it will snap back.
      const sign = dir === "Left" ? -1 : 1;
      const raw = sign * deltaX;
      const max = viewportWidth;
      const clamped =
        raw > 0 ? Math.min(raw, max) : Math.max(raw, -max);

      setIsAnimating(false);
      setSwipeOffset(clamped);
    },

    onSwiped: (eventData) => {
      if (!enabled || viewportWidth === 0) {
        setSwipeOffset(0);
        setIsAnimating(false);
        return;
      }

      const { dir, deltaX } = eventData;
      if (dir !== "Left" && dir !== "Right") {
        resetPosition();
        return;
      }

      const sign = dir === "Left" ? -1 : 1;
      const neighbor = sign === -1 ? next : prev;

      // If no neighbour, just snap back
      if (!neighbor?.href) {
        resetPosition();
        return;
      }

      const threshold = viewportWidth * 0.25; // must travel 25% of width
      if (deltaX < threshold) {
        // Not enough swipe distance → bounce back
        resetPosition();
        return;
      }

      // Commit navigation: animate to full slide then push route
      const targetOffset = sign * viewportWidth;
      setIsAnimating(true);
      setSwipeOffset(targetOffset);

      const timeout = setTimeout(() => {
        router.push(neighbor.href);
      }, 220);

      return () => clearTimeout(timeout);
    },

    delta: 5, // make tracking start early, we use our own commit threshold
    preventScrollOnSwipe: false,
    trackTouch: true,
    trackMouse: false,
  });

  const showHint = enabled && (prev?.href || next?.href);

  const baseTransition = isAnimating
    ? "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)"
    : "none";

  const currentTransform = enabled
    ? `translate3d(${swipeOffset}px, 0, 0)`
    : "translate3d(0, 0, 0)";

  const prevTransform =
    enabled && viewportWidth
      ? `translate3d(${swipeOffset - viewportWidth}px, 0, 0)`
      : `translate3d(-100%, 0, 0)`;

  const nextTransform =
    enabled && viewportWidth
      ? `translate3d(${swipeOffset + viewportWidth}px, 0, 0)`
      : `translate3d(100%, 0, 0)`;

  return (
    <div className={className}>
      <div className="relative overflow-hidden">
        {/* PREVIOUS preview slide (left) */}
        {prev && (
          <div
            className="absolute inset-0 z-10"
            style={{
              transform: prevTransform,
              transition: baseTransition,
              willChange: "transform",
            }}
          >
            <PreviewSlide preview={prev} align="left" />
          </div>
        )}

        {/* NEXT preview slide (right) */}
        {next && (
          <div
            className="absolute inset-0 z-10"
            style={{
              transform: nextTransform,
              transition: baseTransition,
              willChange: "transform",
            }}
          >
            <PreviewSlide preview={next} align="right" />
          </div>
        )}

        {/* CURRENT content */}
        <div
          {...(enabled ? handlers : {})}
          className="relative z-20"
          style={{
            transform: currentTransform,
            transition: baseTransition,
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>

      {/* Bottom hint – mobile only */}
      {showHint && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none z-40 md:hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 text-[11px] text-white shadow-sm pointer-events-auto">
            {prev?.href && <Icon name="chevron-left" size={14} />}
            <span className="uppercase tracking-[0.12em]">
              Swipe
            </span>
            {next?.href && <Icon name="chevron-right" size={14} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Preview slide (hero-style) ---------------- */

function PreviewSlide({
  preview,
  align,
}: {
  preview: NeighborPreview;
  align: "left" | "right";
}) {
  const coverUrl = preview.cover?.url || null;

  return (
    <div className="min-h-screen bg-black">
      <div className="relative w-full h-screen overflow-hidden">
        {coverUrl ? (
          <>
            <div
              className="absolute inset-0 bg-center bg-cover"
              style={{
                backgroundImage: `url(${coverUrl})`,
              }}
            />
            {/* Blur fallback if blurDataURL is available */}
            {preview.cover?.blurDataURL && (
              <div
                className="absolute inset-0 bg-center bg-cover"
                style={{
                  backgroundImage: `url(${preview.cover.blurDataURL})`,
                  filter: "blur(12px)",
                  transform: "scale(1.05)",
                }}
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        )}

        {/* Gradient overlay bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 pb-8 px-6">
          <div className="max-w-screen-md mx-auto text-left">
            <div className="inline-flex items-center gap-2 mb-3 text-[12px] uppercase tracking-[0.18em] text-white/75">
              <span>{align === "left" ? "Previous site" : "Next site"}</span>
            </div>
            <h1 className="text-2xl font-semibold text-white mb-2 leading-tight">
              {preview.title}
            </h1>
            {preview.tagline && (
              <p className="text-[13px] text-white/80 leading-snug">
                {preview.tagline}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
