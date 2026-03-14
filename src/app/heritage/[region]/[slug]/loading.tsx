"use client";

import { useLayoutEffect, useRef } from "react";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

function Card({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <Bar className="h-5 w-40 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <Bar key={i} className={`h-4 mb-2 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export default function HeritageLoading() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.innerWidth >= 768) return;

    // Start off-screen before first paint
    el.style.transform = "translateX(100%)";

    const raf = requestAnimationFrame(() => {
      el.style.transition = "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)";
      el.style.transform = "translateX(0)";

      el.addEventListener("transitionend", () => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.willChange = "";
      }, { once: true });
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/*
        Fixed overlay — slides in over whatever page is currently shown.
        When Next.js replaces this with the real page, it just unmounts this
        fixed div. The real page underneath is never affected.
      */}
      <div
        ref={ref}
        className="md:hidden fixed inset-0 z-[9999] bg-[#f8f8f8] overflow-y-auto"
        style={{ willChange: "transform" }}
      >
        {/* MOBILE HERO */}
        <div className="bg-white">
          <div className="w-full aspect-[5/4] bg-gray-200 animate-pulse" />
          <div className="px-4 pt-4 pb-5 space-y-3">
            <Bar className="h-8 w-3/4" />
            <div className="flex items-center gap-2">
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-28" />
            </div>
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <div className="pt-1 space-y-1">
              <Bar className="h-3 w-20" />
              <Bar className="h-5 w-36" />
            </div>
            <div className="pt-1 space-y-1">
              <Bar className="h-3 w-16" />
              <Bar className="h-5 w-44" />
            </div>
            <div className="pt-3">
              <Bar className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>

        {/* Sticky header placeholder */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-200 h-[52px]" />

        {/* CONTENT */}
        <div className="mx-auto my-6 px-4 flex flex-col gap-5">
          <aside className="space-y-5">
            <Card lines={7} />
            <Card lines={5} />
          </aside>
          <main className="space-y-5">
            <Card lines={6} />
            <Card lines={8} />
            <div className="bg-white rounded-xl shadow-sm p-5">
              <Bar className="h-5 w-32 mb-4" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Bar key={i} className="h-36 w-full rounded-lg" />
                ))}
              </div>
            </div>
            <Card lines={3} />
            <Card lines={4} />
          </main>
        </div>
      </div>

      {/* Spacer so the document isn't empty (prevents scroll jump on swap) */}
      <div className="min-h-screen" />
    </>
  );
}
