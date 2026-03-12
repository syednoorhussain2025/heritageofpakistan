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
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [dragDx, setDragDx] = React.useState(0);

  // Reset to first slide when the site changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setIdx(0); }, [slides.join(",")]);

  // Optional auto-advance (desktop only)
  React.useEffect(() => {
    if (!autoAdvance || !hasMultiple) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [autoAdvance, hasMultiple, slides.length]);

  if (slides.length === 0) {
    return <div className="w-full h-full bg-gradient-to-br from-[#F78300] to-[#00b78b]" />;
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    setDragging(false);
    setDragDx(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !hasMultiple) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (!dragging && Math.abs(dy) > Math.abs(dx)) return;
    setDragging(true);
    setDragDx(dx);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    setDragging(false);
    setDragDx(0);
    if (!hasMultiple || Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    setIdx((i) =>
      dx < 0 ? (i + 1) % slides.length : (i - 1 + slides.length) % slides.length
    );
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sliding track */}
      <div
        className="flex h-full"
        style={{
          width: `${slides.length * 100}%`,
          transform: `translateX(calc(${-idx * (100 / slides.length)}% + ${dragging ? dragDx : 0}px))`,
          transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
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
