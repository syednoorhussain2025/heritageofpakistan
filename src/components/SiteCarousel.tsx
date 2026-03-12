"use client";

import React from "react";

/**
 * Instagram-style swipe carousel for site images.
 *
 * - slides: array of URLs to show. The first URL should be the thumb/cover
 *           so it renders immediately. Additional URLs are added as they load.
 * - blurDataUrl: shown as a blurred placeholder while the first slide is loading.
 * - autoAdvance: if true, auto-cycles every 5 s (desktop panels only).
 */
export default function SiteCarousel({
  slides,
  siteId,
  alt,
  autoAdvance = false,
}: {
  slides: string[];        // first entry = thumb shown immediately; rest added progressively
  siteId?: string | null;  // pass site.id so carousel knows when it's a genuinely new site
  alt: string;
  autoAdvance?: boolean;
}) {
  const hasMultiple = slides.length > 1;
  const [idx, setIdx] = React.useState(0);
  const [firstLoaded, setFirstLoaded] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const idxRef = React.useRef(idx);

  // Reset idx + spinner only when the site itself changes, not when more slides are appended
  React.useEffect(() => {
    setIdx(0);
    setFirstLoaded(false);
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance (desktop only)
  React.useEffect(() => {
    if (!autoAdvance || !hasMultiple) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [autoAdvance, hasMultiple, slides.length]);

  React.useEffect(() => { idxRef.current = idx; }, [idx]);

  // Apply transform directly on DOM — zero re-renders during drag
  const applyTransform = React.useCallback((dx: number, atIdx: number, animated: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const pct = slides.length > 1 ? -atIdx * (100 / slides.length) : 0;
    el.style.transition = animated ? "transform 0.3s cubic-bezier(0.22,1,0.36,1)" : "none";
    el.style.transform = `translateX(calc(${pct}% + ${dx}px))`;
  }, [slides.length]);

  // Keep track in sync when idx changes from dot clicks / auto-advance.
  // Use prevSlidesLenRef to detect when slides were appended vs idx actually changed —
  // on append we reposition without animation so there's no visible jump.
  const prevSlidesLenRef = React.useRef(slides.length);
  React.useEffect(() => {
    const slidesExpanded = slides.length !== prevSlidesLenRef.current;
    prevSlidesLenRef.current = slides.length;
    applyTransform(0, idx, !slidesExpanded);
  }, [idx, applyTransform, slides.length]);

  // Native touch listeners (non-passive touchmove so we can preventDefault)
  React.useEffect(() => {
    const container = trackRef.current?.parentElement;
    if (!container || !hasMultiple) return;

    type GestureState = {
      startX: number; startY: number; dx: number;
      locked: "none" | "horizontal" | "vertical";
      currentIdx: number;
    };
    let g: GestureState | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      g = { startX: t.clientX, startY: t.clientY, dx: 0, locked: "none", currentIdx: idxRef.current };
    };

    const onMove = (e: TouchEvent) => {
      if (!g) return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (g.locked === "none") {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        g.locked = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
      }
      if (g.locked === "vertical") return;
      e.preventDefault();
      g.dx = dx;
      const atStart = g.currentIdx === 0 && dx > 0;
      const atEnd = g.currentIdx === slides.length - 1 && dx < 0;
      applyTransform((atStart || atEnd) ? dx * 0.25 : dx, g.currentIdx, false);
    };

    const onEnd = () => {
      if (!g || g.locked !== "horizontal") { g = null; return; }
      const dx = g.dx;
      let next = g.currentIdx;
      if (dx < -50 && g.currentIdx < slides.length - 1) next = g.currentIdx + 1;
      else if (dx > 50 && g.currentIdx > 0) next = g.currentIdx - 1;
      g = null;
      applyTransform(0, next, true);
      setIdx(next);
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
    };
  }, [hasMultiple, slides.length, applyTransform]);

  if (slides.length === 0) {
    return (
      <div className="w-full h-full relative bg-neutral-200">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-6 h-6 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-neutral-200">
      {/* Spinner — shown while first image hasn't decoded */}
      {!firstLoaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <span className="w-6 h-6 rounded-full border-2 border-white/80 border-t-transparent animate-spin shadow-md" />
        </div>
      )}

      {/* Sliding track */}
      <div
        ref={trackRef}
        className="flex h-full"
        style={{
          width: slides.length > 1 ? `${slides.length * 100}%` : "100%",
          willChange: "transform",
        }}
      >
        {slides.map((url, i) => (
          <div
            key={url}
            className="h-full flex-shrink-0 overflow-hidden"
            style={{ width: slides.length > 1 ? `${100 / slides.length}%` : "100%" }}
          >
            <img
              src={url}
              alt={i === 0 ? alt : ""}
              className="w-full h-full object-cover object-top"
              style={{ transform: "scale(1.078)", transformOrigin: "top center" }}
              draggable={false}
              onLoad={() => { if (!firstLoaded) setFirstLoaded(true); }}
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {hasMultiple && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
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
