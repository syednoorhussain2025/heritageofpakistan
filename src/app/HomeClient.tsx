// src/app/HomeClient.tsx
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { getPublicClient } from "@/lib/supabase/browser";
import Link from "next/link";
import SiteBottomSheet from "@/components/SiteBottomSheet";
import type { BottomSheetSite } from "@/components/SiteBottomSheet";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Option = { id: string; name: string; slug?: string };
type Region = { id: string; name: string; parent_id: string | null };
type SubRegionsMap = Record<string, Region[]>;

type SiteCard = {
  id: string;
  slug: string;
  title: string;
  location_free: string | null;
  cover_photo_thumb_url: string | null;
  cover_photo_url: string | null;
  heritage_type: string | null;
  avg_rating: number | null;
  review_count?: number | null;
  province_id: string | null;
  tagline?: string | null;
  cover_slideshow_image_ids?: string[] | null;
};

type MobileConfig = {
  featured: string[];
  popular: string[];
  unknown_pakistan: string[]; // legacy key, now used for architecture
  architecture: string[];
  beyond_tourist_trail: string[];
  category_pills: string[];
  province_covers: Record<string, string>;
};

type Province = {
  id: string;
  name: string;
  slug: string;
  site_count?: number;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const FALLBACK_GRADIENT = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#F78300"/><stop offset="100%" stop-color="#00b78b"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`
);

const useClickOutside = (ref: any, handler: () => void) => {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

/* ─── SearchableSelect ───────────────────────────────────────────────────── */

const SearchableSelect = ({
  options, value, onChange, placeholder,
}: {
  options: Option[]; value: string; onChange: (v: string) => void; placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const ref = useRef(null);
  useClickOutside(ref, () => setIsOpen(false));

  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [options, searchTerm]
  );
  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)} className="relative w-full cursor-pointer">
        <div className="flex items-center justify-between rounded-xl border border-[var(--taupe-grey)] bg-white px-3 py-2">
          <span className={`truncate ${selected ? "text-[var(--dark-grey)]" : "text-[var(--espresso-brown)]/70"}`}>
            {selected?.name || placeholder}
          </span>
          <div className="flex items-center gap-1">
            {selected && (
              <svg onClick={(e) => { e.stopPropagation(); onChange(""); }} className="h-4 w-4 text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <svg className={`h-4 w-4 text-[var(--taupe-grey)] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className={`absolute left-0 top-[calc(100%+2px)] z-50 w-full rounded-lg bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ${isOpen ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"}`}>
          <div className="p-2">
            <input type="text" placeholder="Search…" className="w-full rounded-md bg-[var(--ivory-cream)] px-3 py-2 text-[var(--dark-grey)] outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filtered.map((opt) => (
              <li key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }} className="cursor-pointer px-4 py-2 text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)]">{opt.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/* ─── RegionSelect ───────────────────────────────────────────────────────── */

const RegionSelect = ({
  parentRegions, subRegions, value, onChange, activeParent, setActiveParent,
}: {
  parentRegions: Region[]; subRegions: SubRegionsMap; value: string;
  onChange: (v: string) => void; activeParent: Region | null; setActiveParent: (r: Region | null) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setIsOpen(false));

  const allRegions = useMemo(() => [...parentRegions, ...Object.values(subRegions).flat()], [parentRegions, subRegions]);
  const selected = useMemo(() => allRegions.find((r) => r.id === value), [allRegions, value]);
  const currentOptions = activeParent ? subRegions[activeParent.id] || [] : parentRegions;

  const getDisplayText = () => {
    if (!selected) return "Regions";
    if (activeParent && activeParent.id === selected.id) return `All in "${activeParent.name}"`;
    return selected.name;
  };

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)} className="relative w-full cursor-pointer">
        <div className="flex items-center justify-between rounded-xl border border-[var(--taupe-grey)] bg-white px-3 py-2">
          <span className={`truncate ${selected ? "text-[var(--dark-grey)]" : "text-[var(--espresso-brown)]/70"}`}>{getDisplayText()}</span>
          <div className="flex items-center gap-1">
            {selected && (
              <svg onClick={(e) => { e.stopPropagation(); onChange(""); setActiveParent(null); }} className="h-4 w-4 text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <svg className={`h-4 w-4 text-[var(--taupe-grey)] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className={`absolute left-0 top-[calc(100%+2px)] z-50 w-full rounded-lg bg-white shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ${isOpen ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"}`}>
          {activeParent && (
            <div onClick={() => { onChange(activeParent.id); setIsOpen(false); }} className="cursor-pointer px-4 py-2 font-semibold text-[var(--navy-deep)] hover:bg-[var(--ivory-cream)]">All in "{activeParent.name}"</div>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {currentOptions.map((opt) => (
              <li key={opt.id} onClick={() => {
                if (activeParent) { onChange(opt.id); setIsOpen(false); }
                else { setActiveParent(opt); onChange(opt.id); setIsOpen(false); }
              }} className="cursor-pointer px-4 py-2 text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)]">{opt.name}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/* ─── HomeCardCarousel ───────────────────────────────────────────────────── */

function HomeCardCarousel({
  sites,
  onCardClick,
}: {
  sites: SiteCard[];
  onCardClick?: (site: SiteCard) => void;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  const updateScales = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const cCenter = cRect.left + cRect.width / 2;
      cardRefs.current.forEach((el) => {
        if (!el) return;
        const eRect = el.getBoundingClientRect();
        const eCenter = eRect.left + eRect.width / 2;
        const dist = Math.abs(cCenter - eCenter);
        const maxDist = cRect.width * 0.6;
        const ratio = Math.min(dist / maxDist, 1);
        el.style.transform = `scale(${Math.min(1, 0.91 + 0.09 * (1 - ratio))})`;
      });
    });
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    updateScales();
    container.addEventListener("scroll", updateScales, { passive: true });
    return () => container.removeEventListener("scroll", updateScales);
  }, [updateScales, sites]);

  useEffect(() => {
    const id = requestAnimationFrame(updateScales);
    return () => cancelAnimationFrame(id);
  }, [updateScales, sites]);

  if (sites.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none"
      style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
    >
      {sites.map((site, i) => (
        <button
          key={site.id}
          ref={(el) => { cardRefs.current[i] = el; }}
          onClick={() => onCardClick ? onCardClick(site) : router.push(`/site/${site.slug}`)}
          className="shrink-0 rounded-2xl overflow-hidden bg-white shadow-sm"
          style={{ width: "52vw", maxWidth: 200, scrollSnapAlign: "start", willChange: "transform" }}
        >
          {/* Image */}
          <div className="relative" style={{ aspectRatio: "4/3" }}>
            <img
              src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
              alt={site.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
            />
            {/* Heritage type badge */}
            {site.heritage_type && (
              <span className="absolute top-2 left-2 bg-[#F78300] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full leading-tight">
                {site.heritage_type}
              </span>
            )}
            {/* Rating badge */}
            {site.avg_rating != null && (
              <span className="absolute top-2 right-2 bg-[#00b78b] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full leading-tight flex items-center gap-0.5">
                ★ {site.avg_rating.toFixed(1)}
              </span>
            )}
          </div>
          {/* Footer */}
          <div className="px-2.5 py-2 text-left">
            <div className="text-xs font-bold text-[#1c1f4c] leading-tight line-clamp-1">{site.title}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{site.location_free || "—"}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── StoryCarousel ─────────────────────────────────────────────────────── */

const STORY_CARD_W = 72; // vw
const STORY_GAP = 12; // px

function StoryCarousel({
  sites,
  onCardClick,
}: {
  sites: SiteCard[];
  onCardClick?: (site: SiteCard) => void;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const axisLocked = useRef<boolean | null>(null);
  const dragDeltaRef = useRef(0);
  const isSwiping = useRef(false);

  // Direct DOM update — zero React re-renders during drag
  const applyDrag = useCallback((delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    const idx = indexRef.current;
    track.style.transition = "none";
    track.style.transform = `translateX(calc(50vw - ${STORY_CARD_W / 2}vw - ${idx} * (${STORY_CARD_W}vw + ${STORY_GAP}px) + ${delta}px))`;

    // Scale cards directly
    const progress = Math.min(Math.abs(delta) / 120, 1);
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const offset = i - idx;
      let scale = offset === 0 ? 1 : 0.88;
      if (offset === 0) scale = 1 - 0.12 * progress;
      else if (offset === -1 && delta > 0) scale = 0.88 + 0.12 * progress;
      else if (offset === 1 && delta < 0) scale = 0.88 + 0.12 * progress;
      el.style.transform = `scale(${scale})`;
    });
  }, []);

  const snapToIndex = useCallback((newIndex: number) => {
    const track = trackRef.current;
    if (!track) return;
    indexRef.current = newIndex;
    track.style.transition = "transform 0.38s cubic-bezier(0.25,0.1,0.25,1)";
    track.style.transform = `translateX(calc(50vw - ${STORY_CARD_W / 2}vw - ${newIndex} * (${STORY_CARD_W}vw + ${STORY_GAP}px)))`;

    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const isActive = i === newIndex;
      el.style.transition = "transform 0.38s cubic-bezier(0.25,0.1,0.25,1)";
      el.style.transform = `scale(${isActive ? 1 : 0.88})`;
    });

    setIndex(newIndex); // only re-render to update text overlay
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (axisLocked.current === null) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        axisLocked.current = Math.abs(dx) >= Math.abs(dy);
      }
      if (!axisLocked.current) return;
      e.preventDefault();
      isSwiping.current = true;
      const idx = indexRef.current;
      const resistance = (idx === 0 && dx > 0) || (idx === sites.length - 1 && dx < 0) ? 0.25 : 1;
      dragDeltaRef.current = dx * resistance;
      applyDrag(dragDeltaRef.current);
    };
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, [sites.length, applyDrag]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    axisLocked.current = null;
    dragDeltaRef.current = 0;
    isSwiping.current = false;
  }

  function onTouchEnd() {
    if (axisLocked.current !== true) return;
    const threshold = 50;
    const idx = indexRef.current;
    if (dragDeltaRef.current < -threshold && idx < sites.length - 1) snapToIndex(idx + 1);
    else if (dragDeltaRef.current > threshold && idx > 0) snapToIndex(idx - 1);
    else snapToIndex(idx); // snap back
    touchStartX.current = null;
    axisLocked.current = null;
  }

  if (sites.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden pb-4"
      style={{ height: `calc(${STORY_CARD_W}vw * 5 / 4)` }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Single GPU track */}
      <div
        ref={trackRef}
        className="absolute inset-0"
        style={{
          transform: `translateX(calc(50vw - ${STORY_CARD_W / 2}vw))`,
          willChange: "transform",
          display: "flex",
          alignItems: "center",
          gap: `${STORY_GAP}px`,
        }}
      >
        {sites.map((site, i) => {
          const isActive = i === index;
          return (
            <button
              key={site.id}
              ref={(el) => { cardRefs.current[i] = el; }}
              onClick={() => {
                if (isSwiping.current) return;
                if (!isActive) { snapToIndex(i); return; }
                if (onCardClick) onCardClick(site);
                else router.push(`/heritage/${site.slug}`);
              }}
              className="relative shrink-0 rounded-3xl overflow-hidden"
              style={{
                width: `${STORY_CARD_W}vw`,
                height: `calc(${STORY_CARD_W}vw * 5 / 4)`,
                transform: `scale(${isActive ? 1 : 0.88})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <img
                src={getThumbOrVariantUrlNoTransform(site.cover_photo_url, "md") || site.cover_photo_url || FALLBACK_GRADIENT}
                alt={site.title}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
                {site.heritage_type && (
                  <span className="bg-[#F78300] text-white text-[10px] font-bold px-2.5 py-1 rounded-full leading-tight">
                    {site.heritage_type}
                  </span>
                )}
                {site.avg_rating != null && (
                  <span className="ml-auto bg-black/40 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full leading-tight flex items-center gap-0.5">
                    ★ {site.avg_rating.toFixed(1)}
                  </span>
                )}
              </div>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 px-3.5 pb-4 pt-8 text-left">
                  <p className="text-white text-[20px] font-extrabold leading-tight line-clamp-2" style={{ fontFamily: "var(--font-futura, sans-serif)" }}>{site.title}</p>
                  {site.location_free && (
                    <p className="text-white/70 text-[11px] mt-1 leading-tight flex items-center gap-1">
                      <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      {site.location_free}
                    </p>
                  )}
                  {site.tagline && (
                    <p className="text-white/60 text-[11px] mt-1.5 leading-snug line-clamp-4 italic">{site.tagline}</p>
                  )}
                  <span className="inline-block mt-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                    Explore →
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── FeaturedHeroCarousel ───────────────────────────────────────────────── */

function FeaturedHeroCarousel({ sites, onCardClick }: { sites: SiteCard[]; onCardClick?: (site: SiteCard) => void }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Auto-advance — paused once user swipes manually
  const userSwipedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (sites.length <= 1) return;
    timerRef.current = setInterval(() => {
      if (!userSwipedRef.current) {
        setIndex((i) => (i + 1) % sites.length);
      }
    }, 5000);
  }

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sites.length]);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const axisLocked = useRef<boolean | null>(null); // true = horizontal, false = vertical
  const dragDeltaRef = useRef(0);
  const [dragDelta, setDragDelta] = useState(0);

  // Non-passive touchmove so we can preventDefault on horizontal swipes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (axisLocked.current === null) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        axisLocked.current = Math.abs(dx) >= Math.abs(dy);
      }
      if (!axisLocked.current) return;
      e.preventDefault();
      const resistance = (index === 0 && dx > 0) || (index === sites.length - 1 && dx < 0) ? 0.3 : 1;
      dragDeltaRef.current = dx * resistance;
      setDragDelta(dragDeltaRef.current);
    };
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, [index, sites.length]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    axisLocked.current = null;
    dragDeltaRef.current = 0;
    setDragDelta(0);
  }

  function onTouchEnd() {
    if (axisLocked.current !== true) { setDragDelta(0); return; }
    const threshold = 50;
    if (dragDeltaRef.current < -threshold && index < sites.length - 1) {
      userSwipedRef.current = true;
      setIndex((i) => i + 1);
    } else if (dragDeltaRef.current > threshold && index > 0) {
      userSwipedRef.current = true;
      setIndex((i) => i - 1);
    }
    setDragDelta(0);
    touchStartX.current = null;
    axisLocked.current = null;
  }

  // Tap to navigate — only if not a swipe
  function onTap() {
    if (Math.abs(dragDeltaRef.current) > 5) return;
    const site = sites[index];
    if (!site) return;
    if (onCardClick) onCardClick(site);
    else router.push(`/site/${site.slug}`);
  }

  if (sites.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative mx-4 rounded-2xl overflow-hidden shadow-lg select-none"
      style={{ aspectRatio: "16/9" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Sliding track */}
      <div
        className="absolute inset-0 flex"
        style={{
          width: `${sites.length * 100}%`,
          transform: `translateX(calc(${-index * (100 / sites.length)}% + ${dragDelta}px))`,
          transition: dragDelta !== 0 ? "none" : "transform 0.35s cubic-bezier(0.25,0.1,0.25,1)",
        }}
      >
        {sites.map((site, i) => (
          <div
            key={site.id}
            className="relative h-full"
            style={{ width: `${100 / sites.length}%` }}
          >
            <img
              src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
              alt={site.title}
              className="w-full h-full object-cover"
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
            />
          </div>
        ))}
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

      {/* Tap target + content */}
      <button
        className="absolute inset-0 w-full h-full text-left p-4 flex flex-col justify-end"
        onClick={onTap}
      >
        {sites[index]?.heritage_type && (
          <span className="mb-1.5 inline-flex self-start bg-[#F78300] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {sites[index].heritage_type}
          </span>
        )}
        <h3 className="text-white font-extrabold text-lg leading-tight line-clamp-2 transition-all duration-300">
          {sites[index]?.title}
        </h3>
        <p className="text-white/70 text-xs mt-0.5 line-clamp-1">
          {sites[index]?.location_free || ""}
        </p>
      </button>

      {/* Dot indicators */}
      {sites.length > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5 pointer-events-none">
          {sites.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${i === index ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── SectionHeader ──────────────────────────────────────────────────────── */

function SectionHeader({ label, onSeeAll }: { label: string; onSeeAll?: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 mb-3">
      <h2 className="text-xl font-extrabold text-[#1c1f4c]" style={{ fontFamily: "var(--font-futura, sans-serif)" }}>{label}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-sm font-semibold text-[#F78300]">
          See All →
        </button>
      )}
    </div>
  );
}

/* ─── Province Tiles ─────────────────────────────────────────────────────── */

// Static province images — representational photos
const PROVINCE_IMAGES: Record<string, string> = {
  punjab: "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/04da125d-4c2b-4be6-a112-e52b87f1629a/1771569291072-birds-flying-badshahi-mosque.jpg",
  sindh: "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/da973cff-1bff-45f8-a13d-38e2af239691/1771663260542-Khaplu%20Palace-20.jpg",
  kpk: "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/d4fe2137-78ff-4e17-b7c6-f4b41cad31a8/1771660133978-Islamia%20College%20Peshawar-34.jpg",
  balochistan: "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/3567294c-1090-43e7-8c2d-6676e5b9ea54/1771680261029-Malam%20Jabba-103.jpg",
  gilgit: "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/c7ffcc06-e765-4e4e-a6ad-cffc2fc1b441/1771690397771-Royal%20Garden%20Altit-8.jpg",
};

function ProvinceTiles({ provinces, covers }: { provinces: Province[]; covers: Record<string, string> }) {
  const router = useRouter();

  if (provinces.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
      {provinces.map((province) => {
        const adminCover = covers[province.id];
        const imgKey = Object.keys(PROVINCE_IMAGES).find((k) =>
          province.name.toLowerCase().includes(k) || province.slug?.toLowerCase().includes(k)
        );
        const img = adminCover || (imgKey ? PROVINCE_IMAGES[imgKey] : FALLBACK_GRADIENT);

        return (
          <button
            key={province.id}
            onClick={() => router.push(`/explore?regs=${province.id}`)}
            className="relative shrink-0 rounded-2xl overflow-hidden active:scale-[0.97] transition-transform shadow-sm"
            style={{ width: "70vw", maxWidth: 280, height: "44vw", maxHeight: 176 }}
          >
            <img
              src={img}
              alt={province.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }}
            />
            {/* Dark gradient — stronger at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
            {/* Site count badge — top right */}
            {province.site_count != null && (
              <span className="absolute top-2.5 right-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[9px] font-semibold px-2 py-0.5 rounded-full">
                {province.site_count} sites
              </span>
            )}
            {/* Province name — bottom left, large */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
              <p
                className="text-white font-extrabold text-[18px] leading-tight tracking-tight"
                style={{ fontFamily: "var(--font-futura, sans-serif)" }}
              >
                {province.name}
              </p>
              <p className="text-white/60 text-[10px] mt-0.5 font-medium tracking-wide uppercase">Explore →</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── CategoryPills ──────────────────────────────────────────────────────── */

function CategoryPills({ pills, categories }: { pills: string[]; categories: Option[] }) {
  const router = useRouter();

  const pillOptions = useMemo(() => {
    if (pills.length === 0) return categories;
    return pills
      .map((slug) => categories.find((c) => c.slug === slug || c.id === slug || c.name.toLowerCase() === slug.toLowerCase()))
      .filter(Boolean) as Option[];
  }, [pills, categories]);

  if (pillOptions.length === 0) return null;

  return (
    <div className="relative">
      {/* Scroll row */}
      <div
        className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
      >
        {pillOptions.map((cat) => (
          <button
            key={cat.id}
            onClick={() => router.push(`/explore?cats=${cat.id}`)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-[#3d4d7a] bg-white/90 border border-white/30 active:bg-white transition-colors"
            style={{ scrollSnapAlign: "start" }}
          >
            {cat.name}
          </button>
        ))}
        {/* Right padding so last pill doesn't sit flush against edge */}
        <div className="shrink-0 w-4" />
      </div>
    </div>
  );
}

/* ─── Mobile Homepage ────────────────────────────────────────────────────── */

const heroImages = [
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/d4fe2137-78ff-4e17-b7c6-f4b41cad31a8/1771660133978-Islamia%20College%20Peshawar-34.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/04da125d-4c2b-4be6-a112-e52b87f1629a/1771569291072-birds-flying-badshahi-mosque.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/da973cff-1bff-45f8-a13d-38e2af239691/1771663260542-Khaplu%20Palace-20.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/3567294c-1090-43e7-8c2d-6676e5b9ea54/1771680261029-Malam%20Jabba-103.jpg",
  "https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/site-images/gallery/c7ffcc06-e765-4e4e-a6ad-cffc2fc1b441/1771690397771-Royal%20Garden%20Altit-8.jpg",
];

function MobileHomepage() {
  const router = useRouter();

  // Config from admin
  const [config, setConfig] = useState<MobileConfig>({ featured: [], popular: [], unknown_pakistan: [], architecture: [], beyond_tourist_trail: [], category_pills: [], province_covers: {} });

  // Site data
  const [featuredSites, setFeaturedSites] = useState<SiteCard[]>([]);
  const [popularSites, setPopularSites] = useState<SiteCard[]>([]);
  const [architectureSites, setArchitectureSites] = useState<SiteCard[]>([]);
  const [beyondTrailSites, setBeyondTrailSites] = useState<SiteCard[]>([]);
  const [nearbySites, setNearbySites] = useState<SiteCard[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);

  // GPS
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "done" | "denied">("idle");

  // Bottom sheet
  const [selectedSite, setSelectedSite] = useState<BottomSheetSite | null>(null);

  // Search bar
  const [searchFocused, setSearchFocused] = useState(false);

  const sb = getPublicClient();

  // ── Load config + categories + provinces on mount ──
  useEffect(() => {
    (async () => {
      const [cfgRes, catRes, provRes] = await Promise.all([
        supabase.from("global_settings").select("value").eq("key", "mobile_homepage").maybeSingle(),
        sb.from("categories").select("id, name, slug").order("name"),
        sb.from("regions").select("id, name, slug, parent_id").is("parent_id", null).order("name"),
      ]);

      const cfg = (cfgRes.data?.value || {}) as MobileConfig;
      setConfig(cfg);
      setCategories((catRes.data as Option[]) || []);

      // Count sites per province using group-by
      const provRows = (provRes.data || []) as Province[];
      const { data: countData } = await sb
        .from("sites")
        .select("province_id, count:id")
        .eq("is_published", true)
        .not("province_id", "is", null);
      const counts: Record<string, number> = {};
      if (countData) {
        for (const row of countData as { province_id: string; count: number }[]) {
          if (row.province_id) counts[row.province_id] = (counts[row.province_id] || 0) + 1;
        }
      }
      setProvinces(provRows.map((p) => ({ ...p, site_count: counts[p.id] || 0 })));
    })();
  }, []);

  // ── Load featured + unknown once config is ready ──
  useEffect(() => {
    if (config.featured.length > 0) {
      sb.from("sites")
        .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
        .in("id", config.featured)
        .eq("is_published", true)
        .then(({ data }) => {
          if (data) {
            const map = new Map(data.map((s: SiteCard) => [s.id, s]));
            setFeaturedSites(config.featured.map((id) => map.get(id)).filter(Boolean) as SiteCard[]);
          }
        });
    }

    if (config.popular.length > 0) {
      sb.from("sites")
        .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
        .in("id", config.popular)
        .eq("is_published", true)
        .then(({ data }) => {
          if (data) {
            const map = new Map(data.map((s: SiteCard) => [s.id, s]));
            setPopularSites(config.popular.map((id) => map.get(id)).filter(Boolean) as SiteCard[]);
          }
        });
    }

    // architecture — falls back to legacy unknown_pakistan key
    const archIds = config.architecture?.length > 0 ? config.architecture : (config.unknown_pakistan || []);
    if (archIds.length > 0) {
      sb.from("sites")
        .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
        .in("id", archIds)
        .eq("is_published", true)
        .then(({ data }) => {
          if (data) {
            const map = new Map(data.map((s: SiteCard) => [s.id, s]));
            setArchitectureSites(archIds.map((id) => map.get(id)).filter(Boolean) as SiteCard[]);
          }
        });
    }

    if (config.beyond_tourist_trail?.length > 0) {
      sb.from("sites")
        .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
        .in("id", config.beyond_tourist_trail)
        .eq("is_published", true)
        .then(({ data }) => {
          if (data) {
            const map = new Map(data.map((s: SiteCard) => [s.id, s]));
            setBeyondTrailSites(config.beyond_tourist_trail.map((id) => map.get(id)).filter(Boolean) as SiteCard[]);
          }
        });
    }
  }, [config.featured.join(","), config.popular.join(","), (config.architecture || config.unknown_pakistan || []).join(","), (config.beyond_tourist_trail || []).join(",")]);

  // ── GPS / Nearby ──
  function requestNearby() {
    if (!navigator.geolocation) { setGpsStatus("denied"); return; }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Use PostgREST RPC if available, else fallback to simple query
        const { data } = await sb
          .from("sites")
          .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
          .eq("is_published", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .limit(10);
        if (data) setNearbySites(data as SiteCard[]);
        setGpsStatus("done");
      },
      () => setGpsStatus("denied"),
      { timeout: 8000 }
    );
  }

  const safeTop = "env(safe-area-inset-top, 44px)";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const titleRow = titleRowRef.current;
    if (!container || !titleRow) return;

    // Phase 1: title fades/slides over first ~50px of scroll
    const TITLE_END = 50;

    const onScroll = () => {
      const scrollY = container.scrollTop;

      // Phase 1 — title fade + slide up
      const p1 = Math.min(1, scrollY / TITLE_END);
      titleRow.style.opacity = `${1 - p1}`;
      titleRow.style.transform = `translateY(-${p1 * 10}px)`;
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    {/* Teal status bar cover — always visible behind the notch/status area */}
    <div className="fixed inset-x-0 top-0 z-[101] bg-[#00c9a7]" style={{ height: safeTop }} />

    {/* Single scroll container — teal background, the whole page scrolls inside this */}
    <div
      ref={scrollContainerRef}
      className="fixed inset-x-0 overflow-y-auto bg-[#00c9a7]"
      style={{ top: 0, bottom: `calc(52px + env(safe-area-inset-bottom, 0px))` }}
    >
      {/* DEFAULT: Title row — scrolls away naturally */}
      <div ref={titleRowRef} className="px-4 pb-6 relative flex items-center justify-center" style={{ paddingTop: `calc(${safeTop} + 22px)`, willChange: "transform, opacity" }}>
        {/* GPS indicator — left side */}
        <button
          onClick={gpsStatus === "idle" ? requestNearby : undefined}
          className="absolute left-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30"
          aria-label="Location"
        >
          {gpsStatus === "loading" ? (
            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"
              style={{ color: gpsStatus === "done" ? "#4ade80" : "rgba(255,255,255,0.6)" }}>
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        <span className="text-white font-extrabold text-2xl tracking-tight" style={{ fontFamily: "var(--font-futura, sans-serif)" }}>
          Heritage of Pakistan
        </span>

        {/* Bell — right side */}
        <button className="absolute right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
      </div>

      {/* COLLAPSED: Sticky bar — search + pills */}
      <div className="sticky bg-[#00c9a7] pb-5" style={{ top: safeTop, zIndex: 100 }}>
        {/* Search bar */}
        <div className="px-4 pt-1 pb-3">
          <button
            onClick={() => router.push("/explore")}
            className="w-full flex items-center gap-2 bg-white rounded-full px-4 py-2.5 shadow-sm"
          >
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm text-gray-400 flex-1 text-left">Search heritage sites…</span>
          </button>
        </div>
        {/* Category pills */}
        {categories.length > 0 && (
          <div style={{ marginBottom: "0" }}>
            <CategoryPills pills={config.category_pills} categories={categories} />
          </div>
        )}
      </div>

      {/* White card */}
      <div className="bg-[#f2f2f2] rounded-t-[28px]">
        <div className="pb-24 pt-7">

          {/* Featured hero carousel */}
          {featuredSites.length > 0 && (
            <div>
              <SectionHeader label="Featured" />
              <FeaturedHeroCarousel sites={featuredSites} onCardClick={setSelectedSite} />
            </div>
          )}

          {/* Popular Tourist Sites */}
          {popularSites.length > 0 && (
            <div className="mt-9">
              <SectionHeader label="Popular Tourist Sites" onSeeAll={() => router.push("/explore")} />
              <HomeCardCarousel sites={popularSites} onCardClick={setSelectedSite} />
            </div>
          )}

          {/* Nearby You */}
          <div className="mt-9">
            <SectionHeader
              label="Nearby You"
              onSeeAll={gpsStatus === "done" ? () => router.push("/explore?nearby=1") : undefined}
            />
            {gpsStatus === "idle" && (
              <div className="mx-4 rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#00c9a7]/15 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[#00c9a7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1c1f4c]">See heritage sites near you</p>
                  <p className="text-xs text-gray-400 mt-0.5">Enable location to discover what's close by</p>
                </div>
                <button
                  onClick={requestNearby}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-[#00c9a7] text-white text-xs font-bold"
                >
                  Enable
                </button>
              </div>
            )}
            {gpsStatus === "loading" && (
              <div className="mx-4 rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-5 flex items-center gap-3">
                <span className="inline-block w-5 h-5 border-2 border-[#00c9a7] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Finding sites near you…</p>
              </div>
            )}
            {gpsStatus === "denied" && (
              <p className="mx-4 text-xs text-gray-400">Location access denied. Enable in settings to see nearby sites.</p>
            )}
            {gpsStatus === "done" && nearbySites.length > 0 && (
              <HomeCardCarousel sites={nearbySites} onCardClick={setSelectedSite} />
            )}
            {gpsStatus === "done" && nearbySites.length === 0 && (
              <p className="mx-4 text-xs text-gray-400">No sites found nearby.</p>
            )}
          </div>

          {/* Architectural Wonders */}
          {architectureSites.length > 0 && (
            <div className="mt-9">
              <SectionHeader label="Architectural Wonders" onSeeAll={() => router.push("/explore")} />
              <StoryCarousel sites={architectureSites} onCardClick={setSelectedSite} />
            </div>
          )}

          {/* Explore by Region */}
          {provinces.length > 0 && (
            <div className="mt-9">
              <SectionHeader label="Explore by Region" onSeeAll={() => router.push("/explore")} />
              <ProvinceTiles provinces={provinces} covers={config.province_covers} />
            </div>
          )}

          {/* Beyond the Tourist Trail */}
          {beyondTrailSites.length > 0 && (
            <div className="mt-9">
              <SectionHeader label="Beyond the Tourist Trail" onSeeAll={() => router.push("/explore")} />
              <FeaturedHeroCarousel sites={beyondTrailSites} onCardClick={setSelectedSite} />
            </div>
          )}

          {/* Bottom spacer */}
          <div className="h-6" />
        </div>
      </div>

      {/* Site bottom sheet */}
      <SiteBottomSheet
        site={selectedSite}
        isOpen={selectedSite !== null}
        onClose={() => setSelectedSite(null)}
      />
    </div>
    </>
  );
}

/* ─── Main Export ────────────────────────────────────────────────────────── */

export default function HomeClient() {
  const router = useRouter();

  // Desktop-only state
  const [heroReady, setHeroReady] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [parentRegions, setParentRegions] = useState<Region[]>([]);
  const [subRegions, setSubRegions] = useState<SubRegionsMap>({});
  const [categories, setCategories] = useState<Option[]>([]);
  const [regionId, setRegionId] = useState("");
  const [activeParentRegion, setActiveParentRegion] = useState<Region | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [textVisible, setTextVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searching, setSearching] = useState(false);


  // Desktop: preload hero + fetch data
  useEffect(() => {
    const img = new Image();
    img.src = heroImages[0];
    if (img.complete) setHeroReady(true);
    else { img.onload = () => setHeroReady(true); img.onerror = () => setHeroReady(true); }

    (async () => {
      const [{ data: regData }, { data: catData }] = await Promise.all([
        supabase.from("regions").select("id,name,parent_id").order("name"),
        supabase.from("categories").select("id,name").order("name"),
      ]);
      const allRegions = (regData as Region[]) || [];
      setParentRegions(allRegions.filter((r) => r.parent_id === null));
      setSubRegions(allRegions.reduce<SubRegionsMap>((acc, r) => {
        if (r.parent_id) { if (!acc[r.parent_id]) acc[r.parent_id] = []; acc[r.parent_id].push(r); }
        return acc;
      }, {}));
      setCategories((catData as Option[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!heroReady) return;
    const t1 = setTimeout(() => setTextVisible(true), 150);
    const t2 = setTimeout(() => setSearchVisible(true), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [heroReady]);

  useEffect(() => {
    if (!heroReady) return;
    const timer = setInterval(() => setHeroIndex((p) => (p + 1) % heroImages.length), 5000);
    return () => clearInterval(timer);
  }, [heroReady]);

  function onSearch() {
    setSearching(true);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (categoryId) sp.set("cats", categoryId);
    if (regionId) sp.set("regs", regionId);
    const href = `/explore?${sp.toString()}`;
    try { router.push(href); } catch { window.location.href = href; }
  }

  return (
    <main className="w-full">
      {/* ── MOBILE ── */}
      <div className="md:hidden h-[100dvh] overflow-y-auto">
        <MobileHomepage />
      </div>

      {/* ── DESKTOP ── */}
      <div
        className="hidden md:grid min-h-screen w-full grid-cols-2"
        style={{ marginTop: "calc(var(--sticky-offset, 72px) * -1)" }}
      >
        {/* Left: hero slideshow */}
        <div className="relative">
          {heroImages.map((src, i) => (
            <img key={src} src={src} alt="Heritage of Pakistan"
              className={`absolute inset-0 h-full w-full object-cover object-[center_30%] transition-opacity duration-1000 ${heroReady && i === heroIndex ? "opacity-100" : "opacity-0"}`}
              draggable={false}
            />
          ))}
          <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center gap-2">
            {heroImages.map((_, i) => (
              <button key={i} onClick={() => setHeroIndex(i)}
                className={`rounded-full transition-all duration-300 ${i === heroIndex ? "h-2.5 w-2.5 bg-white shadow-md" : "h-2 w-2 bg-white/50 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </div>

        {/* Right: ivory search panel */}
        <div className="relative flex h-full items-center justify-center bg-[var(--ivory-cream)] px-6 py-10 md:px-10">
          <div className="relative z-10 w-full max-w-3xl">
            <header className={`mb-6 text-left transition-all duration-700 ease-out ${textVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
              <h1 className="text-4xl font-black leading-tight text-[var(--brand-blue)] md:text-5xl">Heritage of Pakistan</h1>
              <p className="mt-1 text-base text-[var(--brand-grey)] md:text-lg">Discover, Explore, Preserve</p>
              <div className="mt-3 h-[3px] w-16 rounded bg-[var(--sand-gold)]" />
            </header>

            <section className={`transition-all duration-700 ease-out ${searchVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
              <div className="rounded-md bg-white p-4 border border-[var(--taupe-grey)] shadow-md">
                <div className="mb-4 grid grid-cols-12 items-center gap-3">
                  <div className="col-span-10">
                    <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch()}
                      placeholder="Search Heritage"
                      className="w-full rounded-md border border-[var(--taupe-grey)] bg-white px-3 py-2 text-[var(--dark-grey)] outline-none placeholder-[var(--espresso-brown)]/60"
                    />
                  </div>
                  <div className="col-span-2">
                    <button onClick={onSearch} disabled={searching}
                      className="w-full rounded-lg bg-[var(--terracotta-red)] px-6 py-3 font-semibold text-white hover:opacity-95 disabled:opacity-80 flex items-center justify-center gap-2"
                    >
                      {searching ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Searching…</> : "Search"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <RegionSelect parentRegions={parentRegions} subRegions={subRegions} value={regionId} onChange={setRegionId} activeParent={activeParentRegion} setActiveParent={setActiveParentRegion} />
                  <SearchableSelect options={categories} value={categoryId} onChange={setCategoryId} placeholder="Heritage Type" />
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--espresso-brown)]/70">Tip: Choose a region and heritage type, or search directly by name.</p>
              <div className="mt-8 flex items-center gap-3 text-sm">
                <a href="/auth/sign-in" className="inline-flex items-center rounded-lg bg-[var(--brand-orange)] px-5 py-2.5 font-semibold text-white shadow-lg hover:opacity-95">Sign in</a>
                <span className="text-[var(--brand-grey)]/60">or</span>
                <a href="/auth/sign-up" className="font-semibold text-[var(--brand-orange)] underline underline-offset-2 hover:opacity-90">Create an account</a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
