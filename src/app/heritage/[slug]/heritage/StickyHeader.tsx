// src/components/StickyHeader.tsx
import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import AddToTripModal from "@/components/AddToTripModal"; // <-- added

type Site = { id: string; slug: string; title: string };

interface StickyHeaderProps {
  site: Site | null;

  isBookmarked: boolean;
  wishlisted: boolean;
  inTrip: boolean;
  isLoaded: boolean;

  toggleBookmark: (id: string) => void;
  setShowWishlistModal: (show: boolean) => void;
  setInTrip: (inTrip: boolean | ((prev: boolean) => boolean)) => void;
  doShare: () => void;
  setShowReviewModal: (show: boolean) => void;

  locationFree?: string | null;
  categoryIconKey?: string | null;

  /** Optional map link (passed from page) */
  mapsLink?: string | null;

  /** Research Tools controlled props (optional) */
  researchMode?: boolean;
  onChangeResearchMode?: (enabled: boolean) => void;
}

const DEFAULT_STICKY_OFFSET = 72;
/** Slim hotzone at far-left to open the sidebar */
const EDGE_WIDTH_PX = 18;
const CHEVRON_SIZE = 36;
const RESEARCH_LS_KEY = "researchMode";

/* ───────────── Small UI helper ───────────── */

function ActionButton({
  children,
  onClick,
  href,
  ariaPressed,
  target,
  rel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  ariaPressed?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
}) {
  const base =
    "group inline-flex items-center gap-2.5 px-4 py-1 rounded-full text-sm font-medium " +
    "bg-white text-slate-800 cursor-pointer transition-colors whitespace-nowrap";
  const hoverClass = "hover:text-[var(--brand-orange,#F78300)]";
  const cls = `${base} ${hoverClass}`;

  if (href) {
    return (
      <a href={href} className={cls} target={target} rel={rel}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  );
}

function IconBadge({ name, size = 14 }: { name: string; size?: number }) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center rounded-full w-8 h-8",
        "bg-slate-200 transition-colors",
        "group-hover:bg-[var(--brand-orange,#F78300)]",
      ].join(" ")}
      aria-hidden="true"
    >
      <Icon
        name={name}
        size={size}
        className="transition-colors text-slate-700 group-hover:text-white"
      />
    </span>
  );
}

/* ───────────── Sidebar items ───────────── */

type TocItem = {
  id: string;
  title: string;
  level: 2 | 3 | 4;
  iconName?: string;
};

const FIXED_ITEMS: TocItem[] = [
  { id: "overview", title: "Overview", level: 2, iconName: "home" },
  { id: "location", title: "Location", level: 2, iconName: "location" },
  {
    id: "general",
    title: "General Information",
    level: 2,
    iconName: "general-info",
  },
  {
    id: "history",
    title: "History and Background",
    level: 2,
    iconName: "history-background",
  },
  {
    id: "architecture",
    title: "Architecture & Design",
    level: 2,
    iconName: "architecture-design",
  },
  { id: "gallery", title: "Gallery", level: 2, iconName: "gallery" },
  { id: "travel", title: "Travel Guide", level: 2, iconName: "travel-guide" },
  {
    id: "bibliography",
    title: "Bibliography & Sources",
    level: 2,
    iconName: "bibliography-sources",
  },
  { id: "reviews", title: "Traveler Reviews", level: 2, iconName: "star" },
  { id: "nearby", title: "Places Nearby", level: 2, iconName: "regiontax" },
];

function getStickyOffset(): number {
  if (typeof window === "undefined") return DEFAULT_STICKY_OFFSET;
  const varVal = getComputedStyle(document.documentElement)
    .getPropertyValue("--sticky-offset")
    .trim();
  const n = Number(varVal.replace("px", ""));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STICKY_OFFSET;
}

function useScrollSpy(items: TocItem[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length) return;
    const stickyOffset = getStickyOffset();
    const hasOverview = items.some((i) => i.id === "overview");

    const targets = items
      .filter((i) => i.id !== "overview")
      .map((i) => document.getElementById(i.id))
      .filter(Boolean) as HTMLElement[];
    if (!targets.length && !hasOverview) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (hasOverview) {
          const topThreshold = stickyOffset + 8;
          if (window.scrollY <= topThreshold) {
            setActiveId("overview");
            return;
          }
        }
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          setActiveId(visible[0].target.id);
        } else if (targets.length) {
          const tops = targets.map((h) => ({
            id: h.id,
            y: Math.abs(h.getBoundingClientRect().top - stickyOffset),
          }));
          tops.sort((a, b) => a.y - b.y);
          if (tops.length) setActiveId(tops[0].id);
        }
      },
      {
        root: null,
        rootMargin: `-${stickyOffset + 1}px 0px -60% 0px`,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );
    targets.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  return activeId;
}

function scrollToId(id: string) {
  if (id === "overview") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (!el) return;
  const stickyOffset = getStickyOffset();
  const rect = el.getBoundingClientRect();
  const absoluteTop = window.scrollY + rect.top;
  const target = Math.max(absoluteTop - stickyOffset, 0);
  window.scrollTo({ top: target, behavior: "smooth" });
}

/* ───────────── Main Component ───────────── */

export default function StickyHeader({
  site,
  isBookmarked,
  wishlisted,
  inTrip,
  isLoaded,
  toggleBookmark,
  setShowWishlistModal,
  setInTrip,
  doShare,
  setShowReviewModal,
  locationFree,
  categoryIconKey,
  mapsLink,
  researchMode,
  onChangeResearchMode,
}: StickyHeaderProps) {
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  const [headerHeight, setHeaderHeight] = useState<number>(
    DEFAULT_STICKY_OFFSET
  );
  useEffect(() => {
    if (!stickyRef.current) return;
    const el = stickyRef.current;
    const update = () => {
      const h = el.offsetHeight || DEFAULT_STICKY_OFFSET;
      setHeaderHeight(h);
      document.documentElement.style.setProperty("--sticky-offset", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Hover zones
  const [hoverBtn, setHoverBtn] = useState(false);
  const [hoverEdge, setHoverEdge] = useState(false);
  const [hoverPanel, setHoverPanel] = useState(false);

  const [navOpen, setNavOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const tocItems = FIXED_ITEMS;
  const activeId = useScrollSpy(tocItems);

  // Sticky tracking
  useEffect(() => {
    let ticking = false;
    const measure = () => {
      if (!stickyRef.current) return;
      const rect = stickyRef.current.getBoundingClientRect();
      setIsStuck(rect.top <= 0);
      ticking = false;
    };
    const handler = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(measure);
      }
    };
    measure();
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  // Open/close; mark openedOnce when first revealed
  useEffect(() => {
    const shouldOpen = hoverBtn || hoverEdge || hoverPanel;
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (shouldOpen) {
      openTimer.current = window.setTimeout(() => {
        setNavOpen(true);
        if (!openedOnce) setOpenedOnce(true);
      }, 60);
    } else {
      closeTimer.current = window.setTimeout(() => setNavOpen(false), 140);
    }
  }, [hoverBtn, hoverEdge, hoverPanel, openedOnce]);

  /* ── Research Mode: default ON, persist if not set, reflect controlled prop ── */
  const [researchModeInternal, setResearchModeInternal] =
    useState<boolean>(true); // default ON

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESEARCH_LS_KEY);
      if (raw == null) {
        localStorage.setItem(RESEARCH_LS_KEY, "1");
        setResearchModeInternal(true);
      } else {
        setResearchModeInternal(raw === "1" || "true");
      }
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    if (typeof researchMode === "boolean") {
      setResearchModeInternal(researchMode);
    }
  }, [researchMode]);

  useEffect(() => {
    onChangeResearchMode?.(researchModeInternal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchModeInternal]);

  // ── Add to Trip modal state ──
  const [showTripModal, setShowTripModal] = useState(false);

  if (!site) return null;

  return (
    <div
      ref={stickyRef}
      className="sticky top-0 z-40 bg-white border-b border-slate-200"
      aria-label="Sticky site header"
    >
      <div className="relative">
        {/* Leftmost trigger (shows when stuck) */}
        <div
          className={[
            "absolute left-2 top-1/2 -translate-y-1/2",
            "transition-all duration-300 ease-out",
            isStuck
              ? "opacity-100 translate-x-0"
              : "opacity-0 -translate-y-2 pointer-events-none select-none",
          ].join(" ")}
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
        >
          <button
            type="button"
            aria-label="Open page navigator"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
          >
            <Icon name="navigator" size={16} className="text-current" />
          </button>
        </div>

        {/* Main header content */}
        <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-1">
          <div className="flex items-center gap-3 md:gap-4">
            {/* Site identity (visible when stuck) */}
            <div
              className={`flex items-center gap-3 min-w-0 transition-all duration-300 ease-out ${
                isStuck
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 -translate-y-1 pointer-events-none select-none"
              }`}
              aria-hidden={!isStuck}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-orange,#F78300)] flex-shrink-0">
                <Icon
                  name={categoryIconKey || "gallery"}
                  size={16}
                  className="text-white"
                />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-slate-900 truncate">
                  {site.title}
                </div>
                {locationFree ? (
                  <div className="text-xs text-slate-600 truncate">
                    {locationFree}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex-1" />

            {/* Centered actions */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin justify-center mx-auto">
              {/* Bookmark */}
              <ActionButton
                onClick={() => toggleBookmark(site.id)}
                ariaPressed={isBookmarked}
              >
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-full w-8 h-8 transition-colors",
                    isBookmarked
                      ? "bg-[var(--brand-orange,#F78300)] text-white"
                      : "bg-slate-200 text-slate-700 group-hover:bg-[var(--brand-orange,#F78300)] group-hover:text-white",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  <Icon name="bookmark" size={14} />
                </span>
                <span>
                  {isLoaded
                    ? isBookmarked
                      ? "Bookmarked"
                      : "Bookmark"
                    : "Bookmark"}
                </span>
              </ActionButton>

              {/* Add to Trip → open Trip modal */}
              <ActionButton onClick={() => setShowTripModal(true)}>
                <IconBadge name="route" />
                <span>{inTrip ? "Added to Trip" : "Add to Trip"}</span>
              </ActionButton>

              {/* Wishlist */}
              <ActionButton onClick={() => setShowWishlistModal(true)}>
                <IconBadge name="list-ul" />
                <span>{wishlisted ? "Wishlisted" : "Add to Wishlist"}</span>
              </ActionButton>

              {/* Open in new tab */}
              <ActionButton
                href={`/heritage/${site.slug}/gallery`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconBadge name="gallery" />
                <span>Gallery</span>
              </ActionButton>

              {/* Open in new tab */}
              <ActionButton
                href={`/heritage/${site.slug}/story`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconBadge name="play" />
                <span>Photo Story</span>
              </ActionButton>

              <ActionButton onClick={() => setShowReviewModal(true)}>
                <IconBadge name="hike" />
                <span>Share your experience</span>
              </ActionButton>
            </div>

            <div className="flex-1" />
          </div>
        </div>
      </div>

      {/* Left-edge hotzone (slim) */}
      <div
        className="fixed left-0 z-[41] pointer-events-auto"
        style={{
          top: `${headerHeight}px`,
          bottom: 0,
          width: `${EDGE_WIDTH_PX}px`,
        }}
        onMouseEnter={() => setHoverEdge(true)}
        onMouseLeave={() => setHoverEdge(false)}
        aria-hidden
      />

      {/* Chevron indicator */}
      <div
        className="fixed left-1 z-[41] pointer-events-none select-none"
        style={{ top: "50vh", transform: "translateY(-50%)" }}
        aria-hidden
      >
        <div className={openedOnce ? "" : "animate-chev-nudge"}>
          <Icon
            name="chevron-right"
            size={CHEVRON_SIZE}
            className="text-slate-500/85 drop-shadow-sm"
          />
        </div>
      </div>

      {/* Sidebar */}
      <div
        className="fixed left-0 z-[42]"
        style={{
          top: `${headerHeight}px`,
          bottom: 0,
          pointerEvents: navOpen ? "auto" : "none",
          width: 340,
        }}
        aria-hidden={!navOpen}
      >
        <div
          className={[
            "transition-all duration-200 ease-out h-full",
            navOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2",
          ].join(" ")}
        >
          <aside
            className={[
              "h-full w-[340px] max-w-[88vw]",
              "bg-gray-100 rounded-r-2xl shadow-xl border-r border-y border-slate-200",
              "py-3 pr-2 pl-6 md:pl-8 flex flex-col",
            ].join(" ")}
            role="navigation"
            aria-label="On this page"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onMouseEnter={() => setHoverPanel(true)}
            onMouseLeave={() => setHoverPanel(false)}
          >
            {/* Chip header */}
            <div className="px-3 py-2 mb-2 rounded-xl bg-slate-200/60 border border-slate-300/50">
              <div className="text-[13px] font-semibold text-slate-700">
                On this page
              </div>
            </div>

            {/* Dashed vertical connector */}
            <div className="relative flex-1">
              <span
                aria-hidden
                className="absolute left-[1.75rem] top-0 bottom-0 border-l-[3px] border-dashed border-slate-300/80"
              />

              {/* Navigation */}
              <nav
                className={[
                  "relative z-[1] pr-1 h-full no-scrollbar overflow-auto",
                  "pt-3 pb-5",
                ].join(" ")}
              >
                {FIXED_ITEMS.map((item) => {
                  const textIndent =
                    item.level === 4
                      ? "pl-20"
                      : item.level === 3
                      ? "pl-18"
                      : "pl-16";
                  const isActive = activeId === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollToId(item.id)}
                      className={[
                        "relative group w-full text-left flex items-center gap-4 px-2",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                        "transform origin-left transition-transform duration-200 ease-out",
                        "hover:scale-[1.07]",
                        isActive ? "scale-[1.07]" : "",
                        textIndent,
                        "py-2.5",
                      ].join(" ")}
                      aria-current={isActive ? "location" : undefined}
                      style={{ willChange: "transform" }}
                    >
                      {/* Badge */}
                      <span
                        className={[
                          "absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors",
                          "w-8 h-8",
                          isActive ? "bg-slate-700" : "bg-slate-200",
                          "group-hover:bg-slate-600",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        <Icon
                          name={item.iconName || "dot"}
                          size={14}
                          className={[
                            "transition-colors",
                            isActive
                              ? "text-gray-100"
                              : "text-slate-700 group-hover:text-gray-100",
                          ].join(" ")}
                        />
                      </span>

                      {/* Label */}
                      <span
                        className={[
                          "truncate transition-colors",
                          "text-[12px] md:text-[13px] font-medium",
                          isActive ? "text-slate-800" : "text-slate-500",
                          "group-hover:text-slate-600",
                        ].join(" ")}
                      >
                        {item.title}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        </div>
      </div>

      {/* Add to Trip Modal */}
      {showTripModal && site && (
        <AddToTripModal
          siteId={site.id}
          onClose={() => {
            setShowTripModal(false);
            // Optional: mark as added once user interacts with modal
            // setInTrip(true);
          }}
        />
      )}

      <style jsx global>{`
        .scrollbar-thin {
          scrollbar-width: thin;
        }
        .scrollbar-thin::-webkit-scrollbar {
          height: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          border-radius: 8px;
          background-color: rgba(0, 0, 0, 0.15);
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        @keyframes chev-nudge {
          0% {
            transform: translateX(0);
            opacity: 0.7;
          }
          50% {
            transform: translateX(10px);
            opacity: 1;
          }
          100% {
            transform: translateX(0);
            opacity: 0.7;
          }
        }
        .animate-chev-nudge {
          animation: chev-nudge 1.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
