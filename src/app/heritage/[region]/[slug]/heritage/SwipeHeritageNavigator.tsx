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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");

    const handleChange = () => setEnabled(mql.matches);
    handleChange();

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (!enabled) return;
      if (next?.href) router.push(next.href);
    },
    onSwipedRight: () => {
      if (!enabled) return;
      if (prev?.href) router.push(prev.href);
    },
    delta: 40, // minimum px for swipe
    preventScrollOnSwipe: false, // keep vertical scrolling natural
    trackTouch: true,
    trackMouse: false,
  });

  const swipeBindings = enabled ? handlers : {};
  const showHint = enabled && (prev?.href || next?.href);

  return (
    <div {...swipeBindings} className={className}>
      {children}

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
