"use client";

import React from "react";
import { Spinner } from "@/components/ui/Spinner";

export default function SiteCarousel({
  slides,
  siteId,
  alt,
  autoAdvance = false,
  hideDots = false,
  onIndexChange,
}: {
  slides: string[];
  siteId?: string | null;
  alt: string;
  autoAdvance?: boolean;
  hideDots?: boolean;
  onIndexChange?: (idx: number) => void;
}) {
  const hasMultiple = slides.length > 1;
  const [idx, setIdx] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const spinnerRef = React.useRef<HTMLDivElement>(null);
  const idxRef = React.useRef(idx);
  const slidesRef = React.useRef(slides);
  slidesRef.current = slides;

  // Hide/show spinner imperatively — no React state, no re-render on load.
  const showSpinner = React.useCallback((show: boolean) => {
    const el = spinnerRef.current;
    if (el) el.style.display = show ? "flex" : "none";
  }, []);

  // Reset only when the site changes, not when slides are appended.
  React.useEffect(() => {
    setIdx(0);
    const firstUrl = slides[0];
    if (firstUrl) {
      const img = new Image();
      img.src = firstUrl;
      const cached = img.complete && img.naturalWidth > 0;
      showSpinner(!cached);
    } else {
      showSpinner(true);
    }
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance (desktop only)
  React.useEffect(() => {
    if (!autoAdvance || !hasMultiple) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slidesRef.current.length), 5000);
    return () => clearInterval(t);
  }, [autoAdvance, hasMultiple]);

  React.useEffect(() => { idxRef.current = idx; onIndexChange?.(idx); }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTransform = React.useCallback((dx: number, atIdx: number, animated: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const len = slidesRef.current.length;
    const pct = len > 1 ? -atIdx * (100 / len) : 0;
    el.style.transition = animated ? "transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94)" : "none";
    el.style.transform = `translate3d(${pct === 0 && dx === 0 ? "0" : `calc(${pct}% + ${dx}px)`}, 0, 0)`;
  }, []); // no deps — reads slidesRef.current at call time

  // Sync track position when idx or slides change.
  const prevSlidesLenRef = React.useRef(slides.length);
  React.useEffect(() => {
    const slidesExpanded = slides.length !== prevSlidesLenRef.current;
    prevSlidesLenRef.current = slides.length;
    applyTransform(0, idx, !slidesExpanded);
  }, [idx, applyTransform, slides.length]);

  // Touch listeners — attached ONCE, read slidesRef.current dynamically.
  // Never re-attached on slide count changes.
  React.useEffect(() => {
    const container = trackRef.current?.parentElement;
    if (!container) return;

    type G = { startX: number; startY: number; dx: number; locked: "none" | "h" | "v"; currentIdx: number };
    let g: G | null = null;
    let wct: ReturnType<typeof setTimeout> | null = null;

    const releaseLayer = () => { if (trackRef.current) trackRef.current.style.willChange = ""; };

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
        g.locked = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
      if (g.locked === "v") return;
      e.preventDefault();
      const track = trackRef.current;
      if (track && !track.style.willChange) track.style.willChange = "transform";
      if (wct != null) { clearTimeout(wct); wct = null; }
      g.dx = dx;
      const len = slidesRef.current.length;
      const atStart = g.currentIdx === 0 && dx > 0;
      const atEnd = g.currentIdx === len - 1 && dx < 0;
      applyTransform((atStart || atEnd) ? dx * 0.25 : dx, g.currentIdx, false);
    };

    const onEnd = () => {
      if (!g || g.locked !== "h") { g = null; wct = setTimeout(releaseLayer, 450); return; }
      const dx = g.dx;
      const len = slidesRef.current.length;
      let next = g.currentIdx;
      if (dx < -50 && g.currentIdx < len - 1) next = g.currentIdx + 1;
      else if (dx > 50 && g.currentIdx > 0) next = g.currentIdx - 1;
      g = null;
      applyTransform(0, next, true);
      setIdx(next);
      wct = setTimeout(releaseLayer, 450);
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: true });
    container.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      if (wct != null) clearTimeout(wct);
      releaseLayer();
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onEnd);
    };
  }, []); // attached once — never re-attached

  if (slides.length === 0) {
    return (
      <div className="w-full h-full relative bg-neutral-200">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Spinner variant="dots" color="white" size={160} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-neutral-200" style={{ contain: "layout paint" }}>
      <div
        ref={spinnerRef}
        className="absolute inset-0 z-20 items-center justify-center pointer-events-none"
        style={{ display: "flex" }}
      >
        <Spinner variant="dots" color="white" size={160} />
      </div>

      <div
        ref={trackRef}
        className="flex h-full"
        style={{ width: slides.length > 1 ? `${slides.length * 100}%` : "100%" }}
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
              decoding="async"
              onLoad={() => { if (i === 0) showSpinner(false); }}
            />
          </div>
        ))}
      </div>

      {hasMultiple && !hideDots && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-30">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
