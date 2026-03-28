"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  memo,
} from "react";
import dynamicImport from "next/dynamic";
import type { DiscoverPhoto } from "@/app/api/discover/route";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight } from "@/lib/haptics";
import CollectHeart from "@/components/CollectHeart";

async function searchPhotos(query: string, offset: number): Promise<DiscoverPhoto[]> {
  const res = await fetch(`/api/search/photos?q=${encodeURIComponent(query)}&offset=${offset}`);
  if (!res.ok) return [];
  return res.json();
}

const SESSION_SEED_KEY = "discover:seed";

function getOrCreateSeed(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_SEED_KEY);
    if (stored) return parseInt(stored, 10);
    const seed = Math.floor(Math.random() * 1_000_000);
    sessionStorage.setItem(SESSION_SEED_KEY, String(seed));
    return seed;
  } catch {
    return Math.floor(Math.random() * 1_000_000);
  }
}

async function loadPhotos(page: number, cycle: number, seed: number, requestNum: number): Promise<DiscoverPhoto[]> {
  const res = await fetch(`/api/discover?page=${page}&cycle=${cycle}&seed=${seed}&rn=${requestNum}`);
  if (!res.ok) return [];
  return res.json();
}

const SiteBottomSheet = dynamicImport(
  () => import("@/components/SiteBottomSheet"),
  { ssr: false }
);

/* ─── Tile aspect ratio pattern ─────────────────────────────────────────── */
const LEFT_ASPECTS  = ["aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]"];
const RIGHT_ASPECTS = ["aspect-[2/3]", "aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]"];

/* ─── Single tile ──────────────────────────────────────────────────────── */

type TileProps = {
  photo: DiscoverPhoto;
  aspectClass: string;
  onOpen: () => void;
  isPriority: boolean;
};

const DiscoverTile = memo(function DiscoverTile({
  photo,
  aspectClass,
  onOpen,
  isPriority,
}: TileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const imgRef  = useRef<HTMLImageElement>(null);
  const setImgRef = useCallback((el: HTMLImageElement | null) => {
    (imgRef as React.MutableRefObject<HTMLImageElement | null>).current = el;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) el.style.opacity = "1";
  }, []);

  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.style.transition = "opacity 0.55s cubic-bezier(0.4,0,0.2,1)";
        img.style.opacity = "1";
      });
    });
  }, []);

  const thumbUrl = useMemo(() => {
    if (!photo.storagePath) return photo.url;
    try { return getVariantPublicUrl(photo.storagePath, "md"); } catch { return photo.url; }
  }, [photo.storagePath, photo.url]);

  const [pressed, setPressed] = useState(false);

  const handlePressStart = useCallback(() => {
    setPressed(true);
  }, []);

  const handlePressEnd = useCallback(() => {
    setPressed(false);
    void hapticLight();
    onOpen();
  }, [onOpen]);

  const handlePressCancel = useCallback(() => {
    setPressed(false);
  }, []);

  return (
    <div
      ref={tileRef}
      className={`relative w-full overflow-hidden rounded-2xl cursor-pointer ${aspectClass}`}
      style={{ backgroundColor: "#e0dcd8" }}
      onPointerDown={handlePressStart}
      onPointerUp={handlePressEnd}
      onPointerLeave={handlePressCancel}
      onPointerCancel={handlePressCancel}
    >
      {/* Blur placeholder */}
      {photo.blurDataURL && (
        <div
          className="absolute inset-0 z-[1]"
          style={{
            backgroundImage: `url(${photo.blurDataURL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px)",
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Real image */}
      <img
        ref={setImgRef}
        src={thumbUrl}
        alt={photo.caption ?? photo.site.name}
        className="absolute inset-0 w-full h-full object-cover z-[2] transition-transform duration-[1200ms] ease-in-out"
        style={{ transform: pressed ? "scale(1.06)" : "scale(1)", opacity: 0 }}
        loading={isPriority ? "eager" : "lazy"}
        fetchPriority={isPriority ? "high" : "auto"}
        onLoad={onImgLoad}
        onError={onImgLoad}
      />

      {/* Collect heart — top right */}
      <CollectHeart
        siteImageId={photo.id}
        storagePath={photo.storagePath}
        imageUrl={photo.url}
        siteId={photo.site.id}
        altText={photo.caption}
        variant="overlay"
        size={20}
      />

      {/* Bottom overlay: site name */}
      <div
        className="absolute inset-x-0 bottom-0 z-[3] px-2.5 pt-6 pb-2.5"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)",
        }}
      >
        <p className="text-white text-[11px] font-semibold leading-tight truncate drop-shadow-sm">
          {photo.site.name}
        </p>
        {photo.site.location && (
          <p className="text-white/70 text-[10px] leading-tight truncate mt-0.5">
            {photo.site.location}
          </p>
        )}
      </div>
    </div>
  );
});

/* ─── Skeleton tile ────────────────────────────────────────────────────── */

function SkeletonTile({ aspectClass }: { aspectClass: string }) {
  return (
    <div className={`w-full rounded-2xl bg-gray-300 animate-pulse ${aspectClass}`} />
  );
}

/* ─── Search bottom sheet ──────────────────────────────────────────────── */

function SearchSheet({ onSearch, onClose }: { onSearch: (q: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so the sheet animates in first
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const submit = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    onSearch(q);
  }, [value, onSearch]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onClose();
  }, [submit, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1200] bg-black/50"
        onClick={onClose}
        style={{ backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[1201] bg-white rounded-t-3xl"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 20px) + 16px)",
          animation: "slideUp 0.22s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-4 pt-2 pb-4">
          <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Search photos
          </p>

          {/* Input row */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-3-3" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g. Mughal arch, blue tiles, Lahore…"
                className="flex-1 bg-transparent text-[15px] text-gray-800 placeholder-gray-400 outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {value && (
                <button onClick={() => setValue("")} className="text-gray-400 active:text-gray-600 flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 10.586l4.95-4.95 1.414 1.414L13.414 12l4.95 4.95-1.414 1.414L12 13.414l-4.95 4.95-1.414-1.414L10.586 12 5.636 7.05 7.05 5.636z" />
                  </svg>
                </button>
              )}
            </div>

            <button
              onClick={submit}
              disabled={!value.trim()}
              className="bg-stone-800 text-white rounded-2xl px-5 text-[14px] font-semibold disabled:opacity-40 active:bg-stone-700 transition-colors"
            >
              Search
            </button>
          </div>

          {/* Hint chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {["Mughal", "Lahore", "blue tiles", "mosque", "colonial"].map((hint) => (
              <button
                key={hint}
                onClick={() => { setValue(hint); setTimeout(() => inputRef.current?.focus(), 0); }}
                className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-600 text-[12px] font-medium active:bg-stone-200"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

/* ─── Main component ───────────────────────────────────────────────────── */

const LOAD_THRESHOLD_PX = 1500;

export default function DiscoverClient({
  initialPhotos,
}: {
  initialPhotos: DiscoverPhoto[];
}) {
  const [photos, setPhotos]   = useState<DiscoverPhoto[]>(initialPhotos);
  const [loading, setLoading] = useState(false);
  const pageRef       = useRef(initialPhotos.length > 0 ? 1 : 0);
  const cycleRef      = useRef(0);
  const seedRef       = useRef(0);
  const requestNumRef = useRef(0);

  // Search state
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchPhotosArr, setSearchPhotosArr] = useState<DiscoverPhoto[]>([]);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [searchOffset, setSearchOffset]       = useState(0);
  const [searchHasMore, setSearchHasMore]     = useState(true);
  const searchLoadingRef = useRef(false);
  const activeQueryRef   = useRef("");

  // Bottom sheet state
  const [sheetPhoto, setSheetPhoto] = useState<DiscoverPhoto | null>(null);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef  = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const next = await loadPhotos(pageRef.current, cycleRef.current, seedRef.current, requestNumRef.current);
      requestNumRef.current += 1;
      if (next.length > 0) {
        setPhotos((prev) => [...prev, ...next]);
        pageRef.current += 1;
      }
      if (next.length < 30) {
        cycleRef.current += 1;
        pageRef.current = 0;
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async (query: string, offset: number, replace: boolean) => {
    if (searchLoadingRef.current) return;
    searchLoadingRef.current = true;
    setSearchLoading(true);
    try {
      const results = await searchPhotos(query, offset);
      if (activeQueryRef.current !== query) return; // stale
      if (replace) {
        setSearchPhotosArr(results);
      } else {
        setSearchPhotosArr((prev) => [...prev, ...results]);
      }
      setSearchOffset(offset + results.length);
      setSearchHasMore(results.length === 30);
    } finally {
      searchLoadingRef.current = false;
      setSearchLoading(false);
    }
  }, []);

  const handleSearch = useCallback((q: string) => {
    const query = q.trim();
    if (!query) return;
    activeQueryRef.current = query;
    setSearchQuery(query);
    setSearchActive(true);
    setSearchOpen(false);
    setSearchOffset(0);
    setSearchHasMore(true);
    void runSearch(query, 0, true);
  }, [runSearch]);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchPhotosArr([]);
    setSearchOffset(0);
    activeQueryRef.current = "";
  }, []);

  useEffect(() => {
    seedRef.current = getOrCreateSeed();
    if (initialPhotos.length === 0) void loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (searchActive) {
          if (searchHasMore && !searchLoadingRef.current) {
            void runSearch(activeQueryRef.current, searchOffset, false);
          }
        } else {
          void loadMore();
        }
      },
      { rootMargin: `${LOAD_THRESHOLD_PX}px` }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, searchActive, searchHasMore, searchOffset, runSearch]);

  const activePhotos = searchActive ? searchPhotosArr : photos;

  const [leftPhotos, rightPhotos] = useMemo(() => {
    const left: DiscoverPhoto[]  = [];
    const right: DiscoverPhoto[] = [];
    activePhotos.forEach((p, i) => {
      if (i % 2 === 0) left.push(p); else right.push(p);
    });
    return [left, right];
  }, [activePhotos]);

  const showSkeleton = !searchActive && photos.length === 0;
  const showSearchSkeleton = searchActive && searchLoading && searchPhotosArr.length === 0;

  // Build BottomSheetSite from a DiscoverPhoto
  const sheetSite = useMemo(() => {
    if (!sheetPhoto) return null;
    const s = sheetPhoto.site;
    return {
      id: s.id,
      slug: sheetPhoto.siteSlug,
      province_slug: sheetPhoto.regionSlug,
      title: s.name,
      cover_photo_url: s.coverPhotoUrl ?? null,
      cover_slideshow_image_ids: s.coverSlideshowImageIds ?? null,
      avg_rating: s.avgRating ?? null,
      review_count: s.reviewCount ?? null,
      heritage_type: s.heritageType ?? null,
      location_free: s.location ?? null,
      tagline: s.tagline ?? null,
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
    };
  }, [sheetPhoto]);

  return (
    <div
      ref={scrollRef}
      className="h-[100dvh] overflow-y-auto bg-[#f5f2ef]"
      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
    >

      {/* ── Fixed header ── */}
      <div className="fixed inset-x-0 top-0 z-[1100] pointer-events-none lg:hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            height: "110%",
          }}
        />
        <div
          className="relative flex items-center justify-between px-4"
          style={{ paddingTop: "calc(var(--sat, 44px) + 4px)", paddingBottom: "12px" }}
        >
          {/* Left: clear search or spacer */}
          <div className="w-8 pointer-events-auto">
            {searchActive && (
              <button onClick={clearSearch} className="text-white/80 active:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Center: title or active query */}
          <div className="flex-1 text-center">
            {searchActive ? (
              <p className="text-white text-sm font-semibold truncate px-2">
                "{searchQuery}"
              </p>
            ) : (
              <h1
                className="text-white font-bold tracking-tight"
                style={{
                  fontSize: "clamp(20px, 5.5vw, 26px)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                  letterSpacing: "-0.02em",
                }}
              >
                Discover
              </h1>
            )}
          </div>

          {/* Right: search icon */}
          <div className="w-8 pointer-events-auto flex justify-end">
            <button
              onClick={() => setSearchOpen(true)}
              className="text-white/90 active:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-3-3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Feed ── */}
      <div
        className="px-2 pb-8"
        style={{ paddingTop: "calc(var(--sat, 44px) + 70px)" }}
      >
        {/* Search empty state */}
        {searchActive && !searchLoading && searchPhotosArr.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-24 gap-3 text-center px-8">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-gray-300">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3-3" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">No photos found for "{searchQuery}"</p>
            <button onClick={clearSearch} className="text-sm text-gray-400 underline mt-1">Back to Discover</button>
          </div>
        )}

        {(showSkeleton || showSearchSkeleton) ? (
          <div className="flex gap-2">
            <div className="flex flex-col gap-2 flex-1">
              {LEFT_ASPECTS.slice(0, 5).map((a, i) => (
                <SkeletonTile key={i} aspectClass={a} />
              ))}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {RIGHT_ASPECTS.slice(0, 5).map((a, i) => (
                <SkeletonTile key={i} aspectClass={a} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-2 items-start">
            {/* Left column */}
            <div className="flex flex-col gap-2 flex-1">
              {leftPhotos.map((photo, colIdx) => (
                <DiscoverTile
                  key={`${photo.id}-${colIdx}`}
                  photo={photo}
                  aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]}
                  isPriority={colIdx < 4}
                  onOpen={() => setSheetPhoto(photo)}
                />
              ))}
              {loading && [0, 1, 2].map((i) => (
                <SkeletonTile key={`l-sk-${i}`} aspectClass={LEFT_ASPECTS[(leftPhotos.length + i) % LEFT_ASPECTS.length]} />
              ))}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-2 flex-1">
              {rightPhotos.map((photo, colIdx) => (
                <DiscoverTile
                  key={`${photo.id}-${colIdx}`}
                  photo={photo}
                  aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]}
                  isPriority={colIdx < 4}
                  onOpen={() => setSheetPhoto(photo)}
                />
              ))}
              {loading && [0, 1, 2].map((i) => (
                <SkeletonTile key={`r-sk-${i}`} aspectClass={RIGHT_ASPECTS[(rightPhotos.length + i) % RIGHT_ASPECTS.length]} />
              ))}
            </div>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* Bottom nav clearance */}
        <div className="h-[calc(env(safe-area-inset-bottom,0px)+72px)]" />
      </div>

      {/* Site bottom sheet */}
      <SiteBottomSheet
        site={sheetSite}
        isOpen={sheetSite !== null}
        onClose={() => setSheetPhoto(null)}
      />

      {/* Search bottom sheet */}
      {searchOpen && (
        <SearchSheet
          onSearch={handleSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
