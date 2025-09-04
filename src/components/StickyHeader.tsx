// src/components/StickyHeader.tsx
import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

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
}

const HOVER_COLOR = "#4f46e5"; // purple hover

function ActionButton({
  children,
  onClick,
  href,
  ariaPressed,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  ariaPressed?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium " +
    "border border-slate-200 bg-white text-slate-800 cursor-pointer " +
    "transition-colors whitespace-nowrap";

  const hoverClass =
    "hover:bg-[var(--hover-color)] hover:text-white hover:border-[var(--hover-color)]";
  const style = { ["--hover-color" as any]: HOVER_COLOR };

  const cls = `${base} ${hoverClass}`;

  if (href) {
    return (
      <a href={href} className={cls} style={style}>
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
      style={style}
    >
      {children}
    </button>
  );
}

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
}: StickyHeaderProps) {
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

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

  if (!site) return null;

  return (
    <div
      ref={stickyRef}
      className="sticky top-0 z-40 bg-white border-b border-slate-200"
    >
      <div className="w-full max-w-[calc(100%-200px)] mx-auto px-4 py-1.5">
        <div className="flex items-center gap-3 md:gap-4">
          {/* Left block: icon + title + location */}
          <div
            className={`flex items-center gap-3 min-w-0 transition-all duration-300 ease-out
              ${
                isStuck
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 -translate-y-1 pointer-events-none select-none"
              }`}
            aria-hidden={!isStuck}
          >
            <span className="inline-flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-[var(--brand-orange)] flex-shrink-0">
              <Icon
                name={categoryIconKey || "gallery"}
                size={16}
                className="text-white"
              />
            </span>
            <div className="min-w-0">
              <div className="text-sm md:text-base font-semibold text-slate-900 truncate">
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

          {/* Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
            <ActionButton
              onClick={() => toggleBookmark(site.id)}
              ariaPressed={isBookmarked}
            >
              <Icon name="bookmark" size={14} className="text-current" />
              <span>
                {isLoaded
                  ? isBookmarked
                    ? "Bookmarked"
                    : "Bookmark"
                  : "Bookmark"}
              </span>
            </ActionButton>

            <ActionButton onClick={() => setInTrip((t) => !t)}>
              <Icon name="route" size={14} className="text-current" />
              <span>{inTrip ? "Added to Trip" : "Add to Trip"}</span>
            </ActionButton>

            <ActionButton onClick={() => setShowWishlistModal(true)}>
              <Icon name="list-ul" size={14} className="text-current" />
              <span>{wishlisted ? "Wishlisted" : "Add to Wishlist"}</span>
            </ActionButton>

            <ActionButton href={`/heritage/${site.slug}/gallery`}>
              <Icon name="gallery" size={14} className="text-current" />
              <span>Photo Gallery</span>
            </ActionButton>

            <ActionButton onClick={doShare}>
              <Icon name="share" size={14} className="text-current" />
              <span>Share</span>
            </ActionButton>

            <ActionButton href="#reviews">
              <Icon name="star" size={14} className="text-current" />
              <span>Reviews</span>
            </ActionButton>

            <ActionButton onClick={() => setShowReviewModal(true)}>
              <Icon name="hike" size={14} className="text-current" />
              <span>Share your experience</span>
            </ActionButton>
          </div>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}
