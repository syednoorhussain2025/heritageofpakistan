// src/app/heritage/[region]/[slug]/heritage/LazySection.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

type LazySectionProps = {
  children: React.ReactNode;
  skeleton?: React.ReactNode;
  /**
   * How early to pre-load relative to viewport.
   * Default: "200px 0px"
   */
  rootMargin?: string;
};

export default function LazySection({
  children,
  skeleton = null,
  rootMargin = "200px 0px",
}: LazySectionProps) {
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    const el = hostRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0.15,
      }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={hostRef}>
      {!visible && (
        <>
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
          </div>
          {skeleton}
        </>
      )}
      {visible && children}
    </div>
  );
}
