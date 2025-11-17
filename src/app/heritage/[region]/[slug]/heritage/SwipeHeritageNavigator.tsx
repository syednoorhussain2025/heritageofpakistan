// src/app/heritage/[region]/[slug]/heritage/SwipeHeritageNavigator.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

type NeighborLink = {
  href: string;
  title?: string;
  tagline?: string | null;
  cover?: { url: string } | null;
};

type SwipeHeritageNavigatorProps = {
  prev?: NeighborLink | null;
  next?: NeighborLink | null;
  children: React.ReactNode;
  className?: string;
};

/**
 * HERO-ONLY SWIPE NAVIGATOR
 *  - We do NOT swipe the entire page anymore.
 *  - We only animate the hero container when the user swipes over it.
 *  - Children must render the hero as the FIRST child so we can target it.
 */
export default function SwipeHeritageNavigator({
  prev = null,
  next = null,
  children,
  className = "",
}: SwipeHeritageNavigatorProps) {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);

  const [enabled, setEnabled] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Enable only on phones / small tablets
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const toggle = () => setEnabled(mql.matches);
    toggle();
    mql.addEventListener("change", toggle);
    return () => mql.removeEventListener("change", toggle);
  }, []);

  const resetSwipe = () => {
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  /**
   * Gesture only counts if the swipe starts INSIDE the hero area.
   * We accept `any` here because `react-swipeable` passes React synthetic events,
   * not DOM `TouchEvent | MouseEvent`.
   */
  const gestureAllowed = (evt: any) => {
    if (!heroRef.current || !evt) return false;

    const rect = heroRef.current.getBoundingClientRect();

    let y: number | null = null;
    // React TouchEvent-style
    if ("touches" in evt && evt.touches && evt.touches.length > 0) {
      y = evt.touches[0].clientY;
    } else if (typeof evt.clientY === "number") {
      // React MouseEvent-style
      y = evt.clientY;
    } else if (evt.nativeEvent) {
      // Fallback to nativeEvent if wrapped
      const ne = evt.nativeEvent as any;
      if (ne.touches && ne.touches.length > 0) {
        y = ne.touches[0].clientY;
      } else if (typeof ne.clientY === "number") {
        y = ne.clientY;
      }
    }

    if (y == null) return false;
    return y >= rect.top && y <= rect.bottom;
  };

  const handlers = useSwipeable({
    onSwiping: (data) => {
      if (!enabled || !gestureAllowed(data.event)) return;

      const { dir, deltaX } = data;
      if (dir !== "Left" && dir !== "Right") {
        resetSwipe();
        return;
      }

      setIsSwiping(true);

      const signed = dir === "Left" ? -deltaX : deltaX;
      const MAX = 120;
      const clamped =
        signed > 0 ? Math.min(signed, MAX) : Math.max(signed, -MAX);
      setSwipeOffset(clamped);
    },

    onSwipedLeft: () => {
      if (!enabled || !next?.href) return resetSwipe();
      animateAndNavigate(next.href);
    },

    onSwipedRight: () => {
      if (!enabled || !prev?.href) return resetSwipe();
      animateAndNavigate(prev.href);
    },

    onSwiped: () => resetSwipe(),
    delta: 40,
    trackTouch: true,
    trackMouse: false,
    preventScrollOnSwipe: false,
  });

  /**
   * Slide the hero fully out, THEN navigate.
   */
  function animateAndNavigate(target: string) {
    if (!heroRef.current) {
      router.push(target);
      return;
    }

    const direction = target === next?.href ? -1 : 1;

    setIsSwiping(false);
    setSwipeOffset(0);

    // Kick off animation in the next frame
    requestAnimationFrame(() => {
      setIsSwiping(true);
      setSwipeOffset(240 * direction);

      setTimeout(() => {
        setIsSwiping(false);
        router.push(target);
      }, 200);
    });
  }

  const translate = enabled ? swipeOffset : 0;
  const showHint = enabled && (prev?.href || next?.href);

  return (
    <div className={className} {...(enabled ? handlers : {})}>
      {/* HERO SWIPE CONTAINER */}
      <div
        ref={heroRef}
        style={{
          transform: `translateX(${translate}px)`,
          transition: isSwiping
            ? "none"
            : "transform 220ms cubic-bezier(.18,.89,.32,1.28)",
          willChange: "transform",
        }}
      >
        {children}
      </div>

      {/* Gentle hint */}
      {showHint && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center pointer-events-none z-40 md:hidden">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-[11px] text-white tracking-wide shadow-sm pointer-events-auto">
            {prev?.href && <Icon name="chevron-left" size={13} />}
            <span className="uppercase tracking-[0.12em]">Swipe</span>
            {next?.href && <Icon name="chevron-right" size={13} />}
          </div>
        </div>
      )}
    </div>
  );
}
