// src/app/heritage/[region]/[slug]/heritage/SwipeHeritageNavigator.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

type NeighborLink = {
  href: string;
  title?: string;
};

type SwipeHeritageNavigatorProps = {
  prev?: NeighborLink | null;
  next?: NeighborLink | null;
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

  // Only enable on mobile-ish widths
  const [enabled, setEnabled] = useState(false);

  // Visual feedback state
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0); // px

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");

    const handleChange = () => setEnabled(mql.matches);
    handleChange();

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const resetSwipe = () => {
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!enabled) return;

      const { dir, deltaX } = eventData;
      // Only show horizontal drag feedback for left/right swipes
      if (dir !== "Left" && dir !== "Right") {
        resetSwipe();
        return;
      }

      setIsSwiping(true);

      // deltaX is always positive; apply sign based on direction
      const signedDelta = dir === "Left" ? -deltaX : deltaX;
      const MAX_OFFSET = 80; // clamp so it never moves too far
      const clamped =
        signedDelta > 0
          ? Math.min(signedDelta, MAX_OFFSET)
          : Math.max(signedDelta, -MAX_OFFSET);

      setSwipeOffset(clamped);
    },

    onSwipedLeft: () => {
      if (!enabled) {
        resetSwipe();
        return;
      }
      resetSwipe();
      if (next?.href) router.push(next.href);
    },

    onSwipedRight: () => {
      if (!enabled) {
        resetSwipe();
        return;
      }
      resetSwipe();
      if (prev?.href) router.push(prev.href);
    },

    onSwiped: () => {
      // Any completed swipe that didn't navigate should still snap back
      resetSwipe();
    },

    delta: 40, // minimum px before a swipe is recognized
    preventScrollOnSwipe: false, // keep vertical scroll natural
    trackTouch: true,
    trackMouse: false,
  });

  const swipeBindings = enabled ? handlers : {};
  const showHint = enabled && (prev?.href || next?.href);

  const translateX = enabled ? swipeOffset : 0;

  return (
    <div className={className}>
      {/* The swipe listener is attached to this inner shell so we can animate it */}
      <div
        {...swipeBindings}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? "none" : "transform 180ms ease-out",
          willChange: "transform",
        }}
      >
        {children}
      </div>

      {/* Bottom hint – mobile only */}
      {showHint && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none z-40 md:hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 text-[11px] text-white shadow-sm pointer-events-auto">
            {prev?.href && <Icon name="chevron-left" size={14} />}
            <span className="uppercase tracking-[0.12em]">Swipe</span>
            {next?.href && <Icon name="chevron-right" size={14} />}
          </div>
        </div>
      )}
    </div>
  );
}
