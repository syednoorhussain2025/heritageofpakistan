"use client";

import React from "react";

/**
 * Instagram-style swipe carousel for site images.
 *
 * - urls: null = still loading (shows gradient placeholder)
 *         []   = no images (shows gradient placeholder)
 *         [...] = slide through images
 * - fallbackUrl: used when urls resolves to []
 * - autoAdvance: if true, auto-cycles every 5 s (for desktop panels)
 */
export default function SiteCarousel({
  urls,
  fallbackUrl,
  alt,
  autoAdvance = false,
}: {
  urls: string[] | null;
  fallbackUrl?: string | null;
  alt: string;
  autoAdvance?: boolean;
}) {
  const slides =
    urls === null
      ? []
      : urls.length > 0
      ? urls
      : fallbackUrl
      ? [fallbackUrl]
      : [];

  const hasMultiple = slides.length > 1;
  const [idx, setIdx] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);

  // All gesture state lives in refs — never causes async stale-closure bugs
  const gesture = React.useRef<{
    startX: number;
    startY: number;
    dx: number;
    locked: "none" | "horizontal" | "vertical"; // direction lock for this gesture
    currentIdx: number;
  } | null>(null);

  // Reset to first slide when the site changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setIdx(0); }, [slides.join(",")]);

  // Optional auto-advance (desktop only)
  React.useEffect(() => {
    if (!autoAdvance || !hasMultiple) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [autoAdvance, hasMultiple, slides.length]);

  // Apply transform directly on the track DOM node — zero re-renders during drag
  const applyTransform = React.useCallback((dx: number, currentIdx: number, animated: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const pct = -currentIdx * (100 / slides.length);
    el.style.transition = animated ? "transform 0.3s cubic-bezier(0.22,1,0.36,1)" : "none";
    el.style.transform = `translateX(calc(${pct}% + ${dx}px))`;
  }, [slides.length]);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (!hasMultiple) return;
    const t = e.touches[0];
    // Read current idx synchronously via the ref pattern below
    gesture.current = {
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      locked: "none",
      currentIdx: 0, // will be set by the idx captured at render time
    };
  }, [hasMultiple]);

  // We need idx inside touch handlers without stale closure — use a ref mirror
  const idxRef = React.useRef(idx);
  React.useEffect(() => { idxRef.current = idx; }, [idx]);

  // Attach native (non-passive) listeners so we can preventDefault on horizontal swipes
  React.useEffect(() => {
    const el = trackRef.current?.parentElement;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (!hasMultiple) return;
      const t = e.touches[0];
      gesture.current = {
        startX: t.clientX,
        startY: t.clientY,
        dx: 0,
        locked: "none",
        currentIdx: idxRef.current,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g || !hasMultiple) return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;

      // Determine direction lock on first significant movement
      if (g.locked === "none") {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // too small to decide
        g.locked = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      }

      if (g.locked === "vertical") return; // let the page scroll

      // Horizontal — take over scroll
      e.preventDefault();
      g.dx = dx;

      // Rubber-band resistance at the edges
      const atStart = g.currentIdx === 0 && dx > 0;
      const atEnd = g.currentIdx === slides.length - 1 && dx < 0;
      const displayDx = (atStart || atEnd) ? dx * 0.25 : dx;

      applyTransform(displayDx, g.currentIdx, false);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.locked !== "horizontal") return;

      const dx = g.dx;
      const SWIPE_THRESHOLD = 50; // px — must move this much to change slide
      const VELOCITY_THRESHOLD = 0.3; // rough px/ms — fast flick still counts

      // Rough velocity from total dx and touch duration is not tracked here,
      // so use threshold only — 50px is reliable on mobile
      let nextIdx = g.currentIdx;
      if (dx < -SWIPE_THRESHOLD && g.currentIdx < slides.length - 1) {
        nextIdx = g.currentIdx + 1;
      } else if (dx > SWIPE_THRESHOLD && g.currentIdx > 0) {
        nextIdx = g.currentIdx - 1;
      }

      applyTransform(0, nextIdx, true);
      setIdx(nextIdx);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [hasMultiple, slides.length, applyTransform]);

  // Keep track position in sync with idx changes from dot clicks / auto-advance
  React.useEffect(() => {
    applyTransform(0, idx, true);
  }, [idx, applyTransform]);

  if (slides.length === 0) {
    return <div className="w-full h-full bg-gradient-to-br from-[#F78300] to-[#00b78b]" />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Sliding track — manipulated directly via ref */}
      <div
        ref={trackRef}
        className="flex h-full"
        style={{
          width: `${slides.length * 100}%`,
          willChange: "transform",
        }}
      >
        {slides.map((url, i) => (
          <div
            key={url}
            className="h-full flex-shrink-0"
            style={{ width: `${100 / slides.length}%` }}
          >
            <img
              src={url}
              alt={i === 0 ? alt : ""}
              className="w-full h-full object-cover object-top"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {hasMultiple && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === idx ? "bg-white scale-125" : "bg-white/50"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
