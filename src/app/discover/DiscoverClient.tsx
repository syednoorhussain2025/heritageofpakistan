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
import { subscribeTab } from "@/lib/tabStore";

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

async function searchPhotos(query: string, offset: number): Promise<DiscoverPhoto[]> {
  try {
    const res = await fetchWithRetry(`/api/search/photos?q=${encodeURIComponent(query)}&offset=${offset}`);
    return res.json();
  } catch {
    return [];
  }
}

const SESSION_SEED_KEY = "discover:seed";

function createNewSeed(): number {
  const seed = Math.floor(Math.random() * 1_000_000);
  try { sessionStorage.setItem(SESSION_SEED_KEY, String(seed)); } catch {}
  return seed;
}

function getOrCreateSeed(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_SEED_KEY);
    if (stored) return parseInt(stored, 10);
    return createNewSeed();
  } catch {
    return Math.floor(Math.random() * 1_000_000);
  }
}

async function loadPhotos(page: number, cycle: number, seed: number, requestNum: number): Promise<DiscoverPhoto[]> {
  const res = await fetchWithRetry(`/api/discover?page=${page}&cycle=${cycle}&seed=${seed}&rn=${requestNum}`);
  return res.json();
}

const SiteBottomSheet = dynamicImport(
  () => import("@/components/SiteBottomSheet"),
  { ssr: false }
);

// ─── Tile aspect ratio pattern ────────────────────────────────────────────────
const LEFT_ASPECTS  = ["aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]"];
const RIGHT_ASPECTS = ["aspect-[2/3]", "aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]"];
const COL2_ASPECTS  = ["aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-[2/3]"];
const COL3_ASPECTS  = ["aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]", "aspect-[3/4]"];

// ─── Single tile ──────────────────────────────────────────────────────────────

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
  const imgRef = useRef<HTMLImageElement>(null);
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
  const [imgFailed, setImgFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleError = useCallback(() => {
    if (!retried) {
      // One automatic retry after 2s — covers transient network errors
      retryTimerRef.current = setTimeout(() => {
        setRetried(true);
        const img = imgRef.current;
        if (img) {
          img.src = thumbUrl + (thumbUrl.includes("?") ? "&" : "?") + "_r=1";
        }
      }, 2000);
    } else {
      setImgFailed(true);
      onImgLoad();
    }
  }, [retried, thumbUrl, onImgLoad]);

  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  const handlePressStart = useCallback(() => setPressed(true), []);
  const handlePressEnd = useCallback(() => {
    setPressed(false);
    void hapticLight();
    onOpen();
  }, [onOpen]);
  const handlePressCancel = useCallback(() => setPressed(false), []);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-3xl cursor-pointer ${aspectClass}`}
      style={{ backgroundColor: "#e0dcd8" }}
      onPointerDown={handlePressStart}
      onPointerUp={handlePressEnd}
      onPointerLeave={handlePressCancel}
      onPointerCancel={handlePressCancel}
    >
      {/* Blur placeholder */}
      {photo.blurDataURL && !imgFailed && (
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

      {/* Failed state */}
      {imgFailed && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-stone-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-stone-300">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
          </svg>
          <p className="text-stone-400 text-[10px] font-medium">Photo unavailable</p>
        </div>
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
        onError={handleError}
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

      {/* Bottom overlay: caption only */}
      {!imgFailed && (
        <div
          className="absolute inset-x-0 bottom-0 z-[3] px-3 pt-12 pb-3"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 40%, transparent 100%)",
          }}
        >
          {photo.caption ? (
            <p className="text-white text-[12px] font-medium leading-snug line-clamp-3"
              style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
              {photo.caption}
            </p>
          ) : (
            <p className="text-white text-[12px] font-medium leading-tight truncate"
              style={{ textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
              {photo.site.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

// ─── Skeleton tile ────────────────────────────────────────────────────────────

function SkeletonTile({ aspectClass }: { aspectClass: string }) {
  return (
    <div className={`w-full rounded-3xl bg-gray-200 animate-pulse ${aspectClass}`} />
  );
}

// ─── Inline search bar ────────────────────────────────────────────────────────

function SearchBar({ onSearch, onClose }: { onSearch: (q: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
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
    <div
      className="flex items-center gap-2 bg-white rounded-full px-4 py-2.5 mx-4 shadow-lg"
      style={{ animation: "dropIn 0.45s cubic-bezier(0.16,1,0.3,1)" }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4 text-gray-400 flex-shrink-0">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M20 20l-3-3" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search photos, places, styles…"
        className="flex-1 bg-transparent text-[14px] text-gray-800 placeholder-gray-400 outline-none min-w-0"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value ? (
        <button onClick={() => setValue("")} className="text-gray-400 active:text-gray-600 flex-shrink-0 p-0.5">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M12 10.586l4.95-4.95 1.414 1.414L13.414 12l4.95 4.95-1.414 1.414L12 13.414l-4.95 4.95-1.414-1.414L10.586 12 5.636 7.05 7.05 5.636z" />
          </svg>
        </button>
      ) : (
        <button onClick={onClose} className="text-gray-400 active:text-gray-600 flex-shrink-0 p-0.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      <style>{`
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Pull-to-refresh indicator ────────────────────────────────────────────────

function PullIndicator({ pullPct }: { pullPct: number }) {
  // pullPct: 0→1 (1 = threshold reached)
  const size = 36;
  const r = 13;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pullPct, 1);
  const opacity = Math.min(pullPct * 2, 1);
  const scale = 0.6 + 0.4 * Math.min(pullPct, 1);

  return (
    <div
      className="absolute left-1/2 z-[1200] flex items-center justify-center pointer-events-none"
      style={{
        top: `calc(var(--sat, 44px) + 8px)`,
        transform: `translateX(-50%) scale(${scale})`,
        opacity,
        transition: pullPct === 0 ? "opacity 0.2s, transform 0.2s" : "none",
        width: size,
        height: size,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="rgba(0,0,0,0.3)"
          style={{ backdropFilter: "blur(8px)" }}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {pullPct >= 1 && (
          <path
            d={`M${size/2} ${size/2 - 7} A7 7 0 1 1 ${size/2 - 0.01} ${size/2 - 7}`}
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            className="animate-spin"
            style={{ transformOrigin: `${size/2}px ${size/2}px` }}
          />
        )}
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LOAD_THRESHOLD_PX = 1500;
const PULL_THRESHOLD = 72; // px to trigger refresh

export default function DiscoverClient({
  initialPhotos,
}: {
  initialPhotos: DiscoverPhoto[];
}) {
  const [photos, setPhotos]   = useState<DiscoverPhoto[]>(initialPhotos);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  // Pull-to-refresh state
  const [pullPct, setPullPct] = useState(0);
  const pullStartY  = useRef<number | null>(null);
  const isPulling   = useRef(false);

  // Bottom sheet state
  const [sheetPhoto, setSheetPhoto] = useState<DiscoverPhoto | null>(null);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef  = useRef(false);

  // ── Core load ──────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(false);
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
    } catch {
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // ── Refresh (new seed, full reset) ────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (refreshing || loadingRef.current) return;
    setRefreshing(true);
    setLoadError(false);
    const newSeed = createNewSeed();
    seedRef.current = newSeed;
    pageRef.current = 0;
    cycleRef.current = 0;
    requestNumRef.current = 0;
    loadingRef.current = true;
    try {
      const next = await loadPhotos(0, 0, newSeed, 0);
      requestNumRef.current = 1;
      setPhotos(next);
      pageRef.current = 1;
      // Scroll to top
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [refreshing]);

  // ── Search ────────────────────────────────────────────────────────────────

  const runSearch = useCallback(async (query: string, offset: number, replace: boolean) => {
    if (searchLoadingRef.current) return;
    searchLoadingRef.current = true;
    setSearchLoading(true);
    try {
      const results = await searchPhotos(query, offset);
      if (activeQueryRef.current !== query) return;
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

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    seedRef.current = getOrCreateSeed();
    if (initialPhotos.length === 0) void loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset loadingRef when tab becomes visible again ───────────────────────
  // Prevents permanent lock if user switched tabs mid-fetch

  useEffect(() => {
    const unsub = subscribeTab((tab) => {
      if (tab === "discover") {
        // Unlock if a previous fetch was abandoned
        if (loadingRef.current && !loading) {
          loadingRef.current = false;
        }
      }
    });
    return unsub;
  }, [loading]);

  // ── Tap Discover tab to scroll to top ────────────────────────────────────

  useEffect(() => {
    const unsub = subscribeTab((tab) => {
      if (tab === "discover") {
        const el = scrollRef.current;
        if (el && el.scrollTop > 0) {
          el.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    });
    return unsub;
  }, []);

  // ── Infinite scroll sentinel ──────────────────────────────────────────────

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (loadError) return; // don't auto-retry — let user tap "Try again"
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
  }, [loadMore, searchActive, searchHasMore, searchOffset, runSearch, loadError]);

  // ── Pull-to-refresh touch handlers ───────────────────────────────────────

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      pullStartY.current = null;
      setPullPct(0);
      return;
    }
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy <= 0) { setPullPct(0); return; }
    isPulling.current = dy > 8;
    // Rubber-band: resistance increases as you pull further
    const pct = Math.min(dy / PULL_THRESHOLD, 1.2);
    setPullPct(pct);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullPct >= 1 && !refreshing) {
      void refresh();
    }
    pullStartY.current = null;
    isPulling.current = false;
    setPullPct(0);
  }, [pullPct, refreshing, refresh]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const activePhotos = searchActive ? searchPhotosArr : photos;

  const [leftPhotos, rightPhotos] = useMemo(() => {
    const left: DiscoverPhoto[]  = [];
    const right: DiscoverPhoto[] = [];
    activePhotos.forEach((p, i) => {
      if (i % 2 === 0) left.push(p); else right.push(p);
    });
    return [left, right];
  }, [activePhotos]);

  const [col0, col1, col2, col3] = useMemo(() => {
    const c: [DiscoverPhoto[], DiscoverPhoto[], DiscoverPhoto[], DiscoverPhoto[]] = [[], [], [], []];
    activePhotos.forEach((p, i) => c[i % 4].push(p));
    return c;
  }, [activePhotos]);

  const showSkeleton = !searchActive && photos.length === 0 && !loadError;
  const showSearchSkeleton = searchActive && searchLoading && searchPhotosArr.length === 0;

  const sheetSite = useMemo(() => {
    if (!sheetPhoto) return null;
    const s = sheetPhoto.site;
    const coverUrl = s.coverPhotoUrl ?? sheetPhoto.url ?? null;
    return {
      id: s.id,
      slug: sheetPhoto.siteSlug,
      province_slug: sheetPhoto.regionSlug,
      title: s.name,
      cover_photo_url: coverUrl,
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
      data-scroll-reset
      className="h-[100dvh] overflow-y-auto bg-[#f5f2ef] lg:h-auto lg:overflow-visible lg:min-h-screen"
      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >

      {/* ── Pull-to-refresh indicator ── */}
      {pullPct > 0.05 && <PullIndicator pullPct={pullPct} />}

      {/* ── Refreshing spinner ── */}
      {refreshing && (
        <div
          className="fixed left-1/2 z-[1200] pointer-events-none"
          style={{ top: `calc(var(--sat, 44px) + 12px)`, transform: "translateX(-50%)" }}
        >
          <div className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center">
            <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      {/* ── Fixed header ── */}
      <div className="fixed inset-x-0 top-0 z-[1100] pointer-events-none lg:hidden">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 55%, transparent 100%)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(1px)",
            maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            height: "130%",
          }}
        />
        <div className="relative" style={{ paddingTop: "calc(var(--sat, 44px) + 8px)", paddingBottom: searchOpen ? "14px" : "16px" }}>
          <div className="flex items-center justify-between px-4 pb-1">
            <div className="w-10" />
            <div className="flex-1 text-center">
              <h1
                className="text-white font-bold tracking-tight"
                style={{
                  fontSize: "clamp(22px, 5.5vw, 27px)",
                  textShadow: "0 2px 16px rgba(0,0,0,0.65), 0 1px 4px rgba(0,0,0,0.5)",
                  letterSpacing: "-0.02em",
                }}
              >
                Discover
              </h1>
              {searchActive && (
                <div className="flex justify-center mt-1 pointer-events-auto">
                  <span className="bg-white/90 text-stone-800 text-[11px] font-semibold px-3 py-1 rounded-full truncate max-w-[200px]">
                    {searchQuery}
                  </span>
                </div>
              )}
            </div>
            <div className="pointer-events-auto flex justify-end pr-3">
              {searchActive ? (
                <button
                  onClick={clearSearch}
                  style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                  className="bg-black/30 flex items-center justify-center text-white/90 active:bg-black/50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[21px] h-[21px]">
                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              ) : !searchOpen && (
                <button
                  onClick={() => setSearchOpen(true)}
                  style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                  className="bg-black/30 flex items-center justify-center text-white/90 active:bg-black/50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[21px] h-[21px]">
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" d="M20 20l-3-3" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {searchOpen && (
            <div className="pointer-events-auto pb-1">
              <SearchBar onSearch={handleSearch} onClose={() => setSearchOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop header ── */}
      <div className="hidden lg:flex items-center justify-between px-10 xl:px-16 pt-8 pb-5">
        <div>
          <h1 className="text-[32px] font-bold text-stone-800 tracking-tight leading-none">Discover</h1>
          {searchActive && (
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-stone-200 text-stone-700 text-[13px] font-semibold px-3 py-1 rounded-full">
                {searchQuery}
              </span>
              <button onClick={clearSearch} className="text-stone-400 hover:text-stone-600 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {searchOpen ? (
          <div className="w-80">
            <SearchBar onSearch={handleSearch} onClose={() => setSearchOpen(false)} />
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 bg-white border border-stone-200 rounded-full px-4 py-2.5 text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-all text-sm shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4 flex-shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3-3" />
            </svg>
            Search photos, places, styles…
          </button>
        )}
      </div>

      {/* ── Feed ── */}
      <div
        className="px-3 pb-8 lg:px-10 xl:px-16 lg:!pt-0"
        style={{ paddingTop: "calc(var(--sat, 44px) + 80px)" }}
      >
        {/* Error state */}
        {loadError && photos.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-32 gap-4 text-center px-8">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-gray-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-gray-500 text-[15px] font-medium">Couldn't load photos</p>
            <p className="text-gray-400 text-[13px]">Check your connection and try again</p>
            <button
              onClick={() => void loadMore()}
              className="mt-1 px-6 py-2.5 rounded-full bg-[var(--brand-green)] text-white text-[14px] font-semibold active:opacity-80"
            >
              Try again
            </button>
          </div>
        )}

        {/* Error banner when more photos fail to load mid-scroll */}
        {loadError && photos.length > 0 && (
          <div className="flex items-center justify-between gap-3 mx-1 mb-3 px-4 py-3 rounded-2xl bg-white border border-gray-200">
            <p className="text-gray-500 text-[13px]">Failed to load more photos</p>
            <button
              onClick={() => void loadMore()}
              className="text-[var(--brand-green)] text-[13px] font-semibold shrink-0 active:opacity-70"
            >
              Retry
            </button>
          </div>
        )}

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
          <div className="flex gap-3 lg:gap-3">
            <div className="flex flex-col gap-3 flex-1">
              {LEFT_ASPECTS.slice(0, 5).map((a, i) => <SkeletonTile key={i} aspectClass={a} />)}
            </div>
            <div className="flex flex-col gap-3 flex-1">
              {RIGHT_ASPECTS.slice(0, 5).map((a, i) => <SkeletonTile key={i} aspectClass={a} />)}
            </div>
            <div className="hidden lg:flex flex-col gap-3 flex-1">
              {COL2_ASPECTS.slice(0, 5).map((a, i) => <SkeletonTile key={i} aspectClass={a} />)}
            </div>
            <div className="hidden lg:flex flex-col gap-3 flex-1">
              {COL3_ASPECTS.slice(0, 5).map((a, i) => <SkeletonTile key={i} aspectClass={a} />)}
            </div>
          </div>
        ) : (
          <>
            {/* Mobile: 2-column grid */}
            <div className="flex gap-3 items-start lg:hidden">
              <div className="flex flex-col gap-3 flex-1">
                {leftPhotos.map((photo, colIdx) => (
                  <DiscoverTile
                    key={photo.id}
                    photo={photo}
                    aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]}
                    isPriority={colIdx < 4}
                    onOpen={() => setSheetPhoto(photo)}
                  />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => (
                  <SkeletonTile key={`l-sk-${i}`} aspectClass={LEFT_ASPECTS[(leftPhotos.length + i) % LEFT_ASPECTS.length]} />
                ))}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {rightPhotos.map((photo, colIdx) => (
                  <DiscoverTile
                    key={photo.id}
                    photo={photo}
                    aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]}
                    isPriority={colIdx < 4}
                    onOpen={() => setSheetPhoto(photo)}
                  />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => (
                  <SkeletonTile key={`r-sk-${i}`} aspectClass={RIGHT_ASPECTS[(rightPhotos.length + i) % RIGHT_ASPECTS.length]} />
                ))}
              </div>
            </div>

            {/* Desktop: 4-column grid */}
            <div className="hidden lg:flex gap-3 items-start">
              <div className="flex flex-col gap-3 flex-1">
                {col0.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]} isPriority={colIdx < 4} onOpen={() => setSheetPhoto(photo)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d0-sk-${i}`} aspectClass={LEFT_ASPECTS[(col0.length + i) % LEFT_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col1.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]} isPriority={colIdx < 4} onOpen={() => setSheetPhoto(photo)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d1-sk-${i}`} aspectClass={RIGHT_ASPECTS[(col1.length + i) % RIGHT_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col2.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={COL2_ASPECTS[colIdx % COL2_ASPECTS.length]} isPriority={colIdx < 4} onOpen={() => setSheetPhoto(photo)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d2-sk-${i}`} aspectClass={COL2_ASPECTS[(col2.length + i) % COL2_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col3.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={COL3_ASPECTS[colIdx % COL3_ASPECTS.length]} isPriority={colIdx < 4} onOpen={() => setSheetPhoto(photo)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d3-sk-${i}`} aspectClass={COL3_ASPECTS[(col3.length + i) % COL3_ASPECTS.length]} />)}
              </div>
            </div>
          </>
        )}

        <div ref={sentinelRef} className="h-4" />
        <div className="h-[calc(env(safe-area-inset-bottom,0px)+72px)]" />
      </div>

      <SiteBottomSheet
        site={sheetSite}
        isOpen={sheetSite !== null}
        onClose={() => setSheetPhoto(null)}
      />

    </div>
  );
}
