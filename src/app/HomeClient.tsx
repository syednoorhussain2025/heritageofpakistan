// src/app/HomeClient.tsx
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { getPublicClient } from "@/lib/supabase/browser";
import Link from "next/link";
import SiteBottomSheet from "@/components/SiteBottomSheet";
import type { BottomSheetSite } from "@/components/SiteBottomSheet";

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
  unknown_pakistan: string[];
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

function StoryCarousel({
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
        const s = Math.min(1, 0.92 + 0.08 * (1 - ratio));
        el.style.transform = `scale(${s})`;
      });
    });
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Run once on mount
    updateScales();
    // Listen on the carousel's own horizontal scroll
    container.addEventListener("scroll", updateScales, { passive: true });
    return () => container.removeEventListener("scroll", updateScales);
  }, [updateScales, sites]);

  // Re-run scales whenever sites load (images paint, layout shifts)
  useEffect(() => {
    const id = requestAnimationFrame(updateScales);
    return () => cancelAnimationFrame(id);
  }, [updateScales, sites]);

  if (sites.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-none"
      style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollPaddingLeft: "1rem" }}
    >
      {sites.map((site, i) => (
        <button
          key={site.id}
          ref={(el) => { cardRefs.current[i] = el; }}
          onClick={() => onCardClick ? onCardClick(site) : router.push(`/heritage/${site.slug}`)}
          className="relative shrink-0 rounded-3xl overflow-hidden"
          style={{
            width: "75vw",
            maxWidth: 300,
            aspectRatio: "9/16",
            scrollSnapAlign: "start",
            transform: "scale(0.88)",
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          <img
            src={site.cover_photo_thumb_url || site.cover_photo_url || FALLBACK_GRADIENT}
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
          <div className="absolute bottom-0 left-0 right-0 px-3.5 pb-4 pt-8 text-left">
            <p className="text-white text-[15px] font-bold leading-tight line-clamp-2">{site.title}</p>
            {site.location_free && (
              <p className="text-white/70 text-[11px] mt-1 leading-tight flex items-center gap-1">
                <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                {site.location_free}
              </p>
            )}
            {site.tagline && (
              <p className="text-white/60 text-[10.5px] mt-1.5 leading-snug line-clamp-2 italic">{site.tagline}</p>
            )}
            <span className="inline-block mt-2.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
              Explore →
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── FeaturedHeroCarousel ───────────────────────────────────────────────── */

function FeaturedHeroCarousel({ sites, onCardClick }: { sites: SiteCard[]; onCardClick?: (site: SiteCard) => void }) {
  const router = useRouter();
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
  const isDragging = useRef(false);
  const dragDeltaRef = useRef(0);
  const [dragDelta, setDragDelta] = useState(0);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
    dragDeltaRef.current = 0;
    setDragDelta(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Lock to horizontal swipe only — ignore if mostly vertical
    if (!isDragging.current && Math.abs(dy) > Math.abs(dx)) return;
    isDragging.current = true;
    // Resist at edges
    const resistance = (index === 0 && dx > 0) || (index === sites.length - 1 && dx < 0) ? 0.3 : 1;
    dragDeltaRef.current = dx * resistance;
    setDragDelta(dragDeltaRef.current);
  }

  function onTouchEnd() {
    if (!isDragging.current) { setDragDelta(0); return; }
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
    isDragging.current = false;
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

  const containerWidth = typeof window !== "undefined" ? window.innerWidth - 32 : 350; // mx-4 = 16px each side

  return (
    <div
      className="relative mx-4 rounded-2xl overflow-hidden shadow-lg select-none"
      style={{ aspectRatio: "16/9" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
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
      <h2 className="text-base font-extrabold text-[#1c1f4c]">{label}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-xs font-semibold text-[#F78300]">
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
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
      {provinces.map((province) => {
        // Admin-set cover takes priority, fall back to static map
        const adminCover = covers[province.id];
        const imgKey = Object.keys(PROVINCE_IMAGES).find((k) =>
          province.name.toLowerCase().includes(k) || province.slug?.toLowerCase().includes(k)
        );
        const img = adminCover || (imgKey ? PROVINCE_IMAGES[imgKey] : FALLBACK_GRADIENT);

        return (
          <button
            key={province.id}
            onClick={() => router.push(`/explore?regs=${province.id}`)}
            className="shrink-0 relative rounded-2xl overflow-hidden active:scale-[0.98] transition-transform shadow-md"
            style={{ width: "38vw", maxWidth: 150, aspectRatio: "3/4" }}
          >
            <img src={img} alt={province.name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_GRADIENT; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2.5 text-left">
              <div className="text-white font-extrabold text-sm leading-tight">{province.name}</div>
              {province.site_count != null && (
                <div className="text-white/60 text-[10px] mt-0.5">{province.site_count} sites</div>
              )}
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
  const [config, setConfig] = useState<MobileConfig>({ featured: [], popular: [], unknown_pakistan: [], category_pills: [], province_covers: {} });

  // Site data
  const [featuredSites, setFeaturedSites] = useState<SiteCard[]>([]);
  const [popularSites, setPopularSites] = useState<SiteCard[]>([]);
  const [unknownSites, setUnknownSites] = useState<SiteCard[]>([]);
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

    if (config.unknown_pakistan.length > 0) {
      sb.from("sites")
        .select("id, slug, title, location_free, cover_photo_thumb_url, cover_photo_url, heritage_type, avg_rating, review_count, province_id, tagline, cover_slideshow_image_ids")
        .in("id", config.unknown_pakistan)
        .eq("is_published", true)
        .then(({ data }) => {
          if (data) {
            const map = new Map(data.map((s: SiteCard) => [s.id, s]));
            setUnknownSites(config.unknown_pakistan.map((id) => map.get(id)).filter(Boolean) as SiteCard[]);
          }
        });
    }
  }, [config.featured.join(","), config.popular.join(","), config.unknown_pakistan.join(",")]);

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

  return (
    <div className="min-h-screen bg-[#00c9a7]">
      {/* ── Fixed teal header ── */}
      <div
        className="fixed inset-x-0 top-0 z-[100] bg-[#00c9a7]"
        style={{ paddingTop: safeTop }}
      >
        <div className="px-4 pb-2 pt-2">
          {/* Top row: app name + notification */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-extrabold text-lg tracking-tight" style={{ fontFamily: "var(--font-futura, sans-serif)" }}>
              Heritage of Pakistan
            </span>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
          {/* Search bar — taps open Explore search */}
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
        {/* Category pills — inside header, below search, full-width scroll */}
        {categories.length > 0 && (
          <div className="mt-2 pb-2">
            <CategoryPills pills={config.category_pills} categories={categories} />
          </div>
        )}
      </div>

      {/* ── Scrollable content — fixed position card, only inner content scrolls ── */}
      <div
        className="fixed inset-x-0 bg-[#f2f2f2] rounded-t-[32px] overflow-y-auto z-10"
        style={{ top: `calc(${safeTop} + 152px)`, bottom: `calc(52px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="pb-24">

        {/* Featured hero carousel */}
        {featuredSites.length > 0 && (
          <div className="mt-5">
            <SectionHeader label="Featured" />
            <FeaturedHeroCarousel sites={featuredSites} onCardClick={setSelectedSite} />
          </div>
        )}

        {/* Popular Tourist Sites */}
        {popularSites.length > 0 && (
          <div className="mt-6">
            <SectionHeader label="Popular Tourist Sites" onSeeAll={() => router.push("/explore")} />
            <HomeCardCarousel sites={popularSites} onCardClick={setSelectedSite} />
          </div>
        )}

        {/* Nearby You */}
        <div className="mt-6">
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

        {/* Explore by Province */}
        {provinces.length > 0 && (
          <div className="mt-6">
            <SectionHeader label="Explore by Province" onSeeAll={() => router.push("/explore")} />
            <ProvinceTiles provinces={provinces} covers={config.province_covers} />
          </div>
        )}

        {/* Beyond the Tourist Trail */}
        {unknownSites.length > 0 && (
          <div className="mt-6">
            <SectionHeader label="Beyond the Tourist Trail" onSeeAll={() => router.push("/explore")} />
            <StoryCarousel sites={unknownSites} onCardClick={setSelectedSite} />
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
