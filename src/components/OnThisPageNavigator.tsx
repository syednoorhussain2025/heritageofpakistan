// src/components/OnThisPageNavigator.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";

type TocItem = {
  id: string;
  title: string;
  level?: 2 | 3 | 4;
  iconName?: string;
};

type Props = {
  /** If provided, we use these items; otherwise we auto-scan h2..h4[id]. */
  items?: TocItem[];
  /** px offset for sticky header and scroll-margin. Default 72. */
  stickyOffset?: number;
  /** Optional className passthrough. */
  className?: string;
  /** Container to auto-scan headings from; if omitted, uses document. */
  container?: HTMLElement | null;
};

/* ----------------------------- Utilities ----------------------------- */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const l = () => setReduced(m.matches);
    l();
    m.addEventListener?.("change", l);
    return () => m.removeEventListener?.("change", l);
  }, []);
  return reduced;
}

function smoothScrollToId(
  id: string,
  stickyOffset: number,
  reduceMotion: boolean
) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const absoluteTop = window.scrollY + rect.top;
  const target = Math.max(absoluteTop - stickyOffset, 0);
  window.scrollTo({
    top: target,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

function readHeadings(container?: HTMLElement | null): TocItem[] {
  const scope: ParentNode = container ?? document;
  const nodes = Array.from(
    scope.querySelectorAll("h2[id], h3[id], h4[id]")
  ) as HTMLHeadingElement[];
  return nodes.map((n) => {
    const level = Number(n.tagName.substring(1)) as 2 | 3 | 4;
    return { id: n.id, title: n.textContent ?? "", level };
  });
}

/* One observer to track all headings (efficient even for many) */
function useScrollSpy(items: TocItem[], stickyOffset: number) {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!items.length) return;
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter(Boolean) as HTMLElement[];

    if (!headings.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // Choose the entry that is most visible and above the fold
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          setActiveId(visible[0].target.id);
        } else {
          // If none intersect, pick the nearest section above viewport
          const tops = headings.map((h) => ({
            id: h.id,
            y: Math.abs(h.getBoundingClientRect().top - stickyOffset),
          }));
          tops.sort((a, b) => a.y - b.y);
          if (tops.length) setActiveId(tops[0].id);
        }
      },
      {
        // Start observing a bit before the heading reaches top, so it "activates" sooner
        root: null,
        rootMargin: `-${stickyOffset + 1}px 0px -60% 0px`,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items, stickyOffset]);

  return activeId;
}

/* --------------------------- Main Component -------------------------- */

export default function OnThisPageNavigator({
  items,
  stickyOffset = 72,
  className = "",
  container = null,
}: Props) {
  const reduceMotion = usePrefersReducedMotion();

  // Auto TOC if items not provided
  const autoItems = useMemo(
    () => (items && items.length ? items : readHeadings(container)),
    [items, container]
  );

  const activeId = useScrollSpy(autoItems, stickyOffset);

  // Mobile drawer state
  const [openMobile, setOpenMobile] = useState(false);
  const mobileCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap behavior for mobile drawer
  useEffect(() => {
    if (!openMobile) return;
    mobileCloseBtnRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMobile(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openMobile]);

  useEffect(() => {
    if (!openMobile) fabRef.current?.focus();
  }, [openMobile]);

  // Global CSS var for scroll-margin compatibility (coexists with your page-level var)
  useEffect(() => {
    const prev =
      document.documentElement.style.getPropertyValue("--sticky-offset");
    document.documentElement.style.setProperty(
      "--sticky-offset",
      `${stickyOffset}px`
    );
    return () => {
      // don't clobber if another page also set it; we simply leave it
      if (prev)
        document.documentElement.style.setProperty("--sticky-offset", prev);
    };
  }, [stickyOffset]);

  /* -------------------------- Desktop (Hover) -------------------------- */

  const DesktopRail = (
    <div
      className={`hidden lg:block ${className}`}
      aria-label="On this page navigation"
    >
      {/* The hover-to-expand group container; sticky keeps it in view */}
      <div className="group lg:sticky" style={{ top: `${stickyOffset}px` }}>
        {/* Collapsible shell: starts narrow, expands on hover */}
        <div
          className={`
            relative overflow-visible
            transition-[width] duration-200 ease-out
            w-12 group-hover:w-80
          `}
        >
          {/* Background card that expands with container width */}
          <div className="absolute inset-0 rounded-2xl bg-white shadow-sm border border-black/5" />

          {/* Compact rail content (always visible): just an icon + rotated label */}
          <div className="relative z-10 h-full flex flex-col items-center py-3 gap-3">
            {/* Anchor icon */}
            <div
              className="w-8 h-8 rounded-full bg-[var(--brand-blue,#1f6be0)]/10 flex items-center justify-center"
              title="On this page"
              aria-hidden="true"
            >
              <Icon
                name="list"
                size={18}
                className="text-[var(--brand-blue,#1f6be0)]"
              />
            </div>
            {/* Vertical label */}
            <div
              className="text-[11px] tracking-wide text-slate-500 rotate-90 translate-y-6 select-none"
              aria-hidden="true"
            >
              On this page
            </div>
          </div>

          {/* Expanded panel content (appears on hover) */}
          <div
            className={`
              pointer-events-none group-hover:pointer-events-auto
              absolute inset-0 pl-12 pr-3 py-3
              opacity-0 group-hover:opacity-100 transition-opacity duration-200
              flex
            `}
            role="navigation"
            aria-label="On this page"
          >
            <div className="w-full h-full overflow-auto">
              <div className="px-3 py-2 mb-2 rounded-xl bg-[var(--brand-blue,#1f6be0)]/5 border border-[var(--brand-blue,#1f6be0)]/10">
                <div
                  className="text-[13px] font-semibold"
                  style={{
                    color: "var(--brand-blue, #1f6be0)",
                    fontFamily: "var(--font-article-heading, inherit)",
                  }}
                >
                  On this page
                </div>
              </div>

              <nav className="space-y-1">
                {autoItems.map((item) => {
                  const isActive = activeId === item.id;
                  const indent =
                    item.level === 4 ? "ml-6" : item.level === 3 ? "ml-3" : "";
                  return (
                    <button
                      key={item.id}
                      onClick={() =>
                        smoothScrollToId(item.id, stickyOffset, reduceMotion)
                      }
                      className={[
                        "w-full text-left flex items-center gap-2 rounded-xl px-2 py-2 transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                        isActive
                          ? "bg-[var(--brand-blue,#1f6be0)]/10"
                          : "hover:bg-slate-100",
                        indent,
                      ].join(" ")}
                      aria-current={isActive ? "location" : undefined}
                    >
                      {item.iconName ? (
                        <Icon
                          name={item.iconName}
                          size={16}
                          className="text-[var(--brand-blue,#1f6be0)] flex-shrink-0"
                        />
                      ) : (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[var(--brand-blue,#1f6be0)] flex-shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-[13px] text-slate-800">
                        {item.title}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------------------------- Mobile Drawer ---------------------------- */

  const MobileFab = (
    <button
      ref={fabRef}
      type="button"
      className="lg:hidden fixed bottom-5 right-5 z-40 rounded-full shadow-lg bg-black text-white w-12 h-12 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      onClick={() => setOpenMobile(true)}
      aria-label="Open on this page navigator"
    >
      <Icon name="list" size={20} />
    </button>
  );

  const MobileDrawer = openMobile ? (
    <div
      className="lg:hidden fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="on-this-page-heading"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpenMobile(false)}
      />
      <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-white shadow-xl p-4 flex flex-col">
        <div className="flex items-center justify-between">
          <h2
            id="on-this-page-heading"
            className="text-[15px] font-semibold"
            style={{
              color: "var(--brand-blue, #1f6be0)",
              fontFamily: "var(--font-article-heading, inherit)",
            }}
          >
            On this page
          </h2>
          <button
            ref={mobileCloseBtnRef}
            onClick={() => setOpenMobile(false)}
            className="rounded-full p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            aria-label="Close navigator"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mt-3 overflow-auto">
          <nav className="space-y-1">
            {autoItems.map((item) => {
              const isActive = activeId === item.id;
              const indent =
                item.level === 4 ? "ml-6" : item.level === 3 ? "ml-3" : "";
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setOpenMobile(false);
                    // Defer scroll until after drawer closes
                    setTimeout(
                      () =>
                        smoothScrollToId(item.id, stickyOffset, reduceMotion),
                      0
                    );
                  }}
                  className={[
                    "w-full text-left flex items-center gap-2 rounded-xl px-2 py-2 transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                    isActive
                      ? "bg-[var(--brand-blue,#1f6be0)]/10"
                      : "hover:bg-slate-100",
                    indent,
                  ].join(" ")}
                  aria-current={isActive ? "location" : undefined}
                >
                  {item.iconName ? (
                    <Icon
                      name={item.iconName}
                      size={18}
                      className="text-[var(--brand-blue,#1f6be0)] flex-shrink-0"
                    />
                  ) : (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-[var(--brand-blue,#1f6be0)] flex-shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-[14px] text-slate-800">
                    {item.title}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Desktop hover-to-expand rail */}
      {DesktopRail}

      {/* Mobile FAB + Drawer */}
      {MobileFab}
      {MobileDrawer}

      {/* Ensure global anchor offset works universally */}
      <style jsx global>{`
        h2[id],
        h3[id],
        h4[id] {
          scroll-margin-top: ${stickyOffset}px;
        }
      `}</style>
    </>
  );
}
