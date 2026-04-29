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
import Icon from "@/components/Icon";
import type { DiscoverPhoto } from "@/app/api/discover/route";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import { hideKeyboard } from "@/lib/keyboard";
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

// ── Preload singleton — fetches first batch once on module load ───────────────
// TabShell mounts all panes at app start, so this runs immediately in the
// background while the user is on the Home tab.
let _preloadSeed = 0;
let _preloadPromise: Promise<DiscoverPhoto[]> | null = null;

function preloadFirstBatch(): Promise<DiscoverPhoto[]> {
  if (_preloadPromise) return _preloadPromise;
  _preloadSeed = getOrCreateSeed();
  _preloadPromise = loadPhotos(0, 0, _preloadSeed, 0).catch(() => []);
  return _preloadPromise;
}

// Kick off preload immediately when module is imported (app start)
if (typeof window !== "undefined") preloadFirstBatch();

const DiscoverPhotoSheet = dynamicImport(
  () => import("@/components/DiscoverPhotoSheet"),
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
  onOpen: (rect: DOMRect, thumbUrl: string) => void;
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
    (imgRef as React.RefObject<HTMLImageElement | null>).current = el;
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

  const [imgFailed, setImgFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleError = useCallback(() => {
    if (!retried) {
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

  const tileRef = useRef<HTMLDivElement>(null);

  // Scroll-into-view fade for tiles below the fold
  const setTileRef = useCallback((el: HTMLDivElement | null) => {
    (tileRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    // If already in viewport (first batch), leave animation to the stagger wrapper
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;
    // Below the fold — hide and reveal on scroll
    el.style.opacity = "0";
    el.style.transform = "translateY(18px)";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -30px 0px" }
    );
    observer.observe(el);
  }, []);

  const handlePressEnd = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    // Kill scroll momentum by briefly toggling overflow — WebKit drops inertia immediately
    const scroller = el.closest<HTMLElement>("[data-scroll-reset]");
    if (scroller) {
      const top = scroller.scrollTop;
      scroller.style.overflowY = "hidden";
      scroller.scrollTop = top;
      requestAnimationFrame(() => { scroller.style.overflowY = ""; });
    }
    const rect = el.getBoundingClientRect();
    onOpen(rect, thumbUrl);
  }, [onOpen, thumbUrl]);

  return (
    <div
      ref={setTileRef}
      className={`relative w-full overflow-hidden rounded-3xl cursor-pointer ${aspectClass}`}
      style={{ backgroundColor: "#e0dcd8" }}
      onPointerUp={handlePressEnd}
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
        className="absolute inset-0 w-full h-full object-cover z-[2]"
        style={{ opacity: 0 }}
        loading={isPriority ? "eager" : "lazy"}
        fetchPriority={isPriority ? "high" : "auto"}
        onLoad={onImgLoad}
        onError={handleError}
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
    <div className={`w-full rounded-3xl skeleton-shimmer ${aspectClass}`} />
  );
}

// ─── Inline search bar ────────────────────────────────────────────────────────

// Cached inspirations — fetched once per session, eagerly on mount
let cachedInspirations: string[] = [];
let inspirationsFetchStarted = false;

function prefetchInspirations() {
  if (inspirationsFetchStarted) return;
  inspirationsFetchStarted = true;
  fetch("/api/search/inspirations")
    .then((r) => r.json())
    .then((data: { phrase: string }[]) => {
      cachedInspirations = data.map((d) => d.phrase);
    })
    .catch(() => {});
}

function pickRandom(arr: string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function SearchBar({ onSearch, onClose, isOpen, chips }: { onSearch: (q: string) => void; onClose: () => void; isOpen: boolean; chips: string[] }) {
  const [value, setValue] = useState("");
  const [chipsVisible, setChipsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const focusT = setTimeout(() => inputRef.current?.focus(), 40);
    // Fade chips in after the slide-down animation completes (~320ms)
    const chipsT = setTimeout(() => setChipsVisible(true), 320);
    return () => { clearTimeout(focusT); clearTimeout(chipsT); };
  }, [isOpen]);

  // Reset chips visibility when search closes
  useEffect(() => {
    if (!isOpen) setChipsVisible(false);
  }, [isOpen]);

  const submit = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    void hapticMedium();
    hideKeyboard();
    onSearch(q);
  }, [value, onSearch]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onClose();
  }, [submit, onClose]);

  const handleChip = useCallback((phrase: string) => {
    void hapticLight();
    hideKeyboard();
    onSearch(phrase);
  }, [onSearch]);

  return (
    <div className="mx-4">
      <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2.5 shadow-lg">
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
          className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 outline-none min-w-0"
          style={{ fontSize: "16px" }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="search"
          enterKeyHint="search"
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
      </div>

      {/* Inspiration chips — always in DOM; fade in after slide, fade out on typing */}
      <div
        className="flex gap-1.5 mt-2.5 px-1"
        style={{
          opacity: chipsVisible && !value && chips.length > 0 ? 1 : 0,
          transition: value ? "opacity 0.12s ease-in" : "opacity 0.2s ease-out",
          pointerEvents: chipsVisible && !value && chips.length > 0 ? "auto" : "none",
        }}
      >
        {chips.slice(0, 3).map((phrase) => (
          <button
            key={phrase}
            onPointerDown={() => handleChip(phrase)}
            className="border border-white/30 text-white text-[11px] font-medium px-2.5 py-1 rounded-full active:bg-white/30 flex-1 truncate"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            {phrase}
          </button>
        ))}
        {chips.length === 0 && (
          <>
            <div className="flex-1 h-[26px] rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <div className="flex-1 h-[26px] rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
            <div className="flex-1 h-[26px] rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          </>
        )}
      </div>
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
      className="fixed left-1/2 z-[1200] flex items-center justify-center pointer-events-none"
      style={{
        top: `calc(var(--sat, 44px) + 68px)`,
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
  const [searchChips, setSearchChips]   = useState<string[]>(() => pickRandom(cachedInspirations, 3));
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

  // Grid stagger animation key — incremented on tab switch once photos are loaded
  const [gridAnimKey, setGridAnimKey] = useState(0);
  const hasPhotosRef = useRef(false);

  // Photo popup state
  const [sheetPhoto, setSheetPhoto] = useState<DiscoverPhoto | null>(null);
  const [sheetOriginRect, setSheetOriginRect] = useState<DOMRect | null>(null);
  const [sheetThumbUrl, setSheetThumbUrl] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetBlocking, setSheetBlocking] = useState(false);

  useEffect(() => {
    // sheetBlocking stays true until animation fully done — keeps nav disabled
    document.body.classList.toggle("discover-sheet-open", sheetBlocking);
    return () => { document.body.classList.remove("discover-sheet-open"); };
  }, [sheetBlocking]);

  const handleTileOpen = useCallback((photo: DiscoverPhoto, rect: DOMRect, thumb: string) => {
    setSheetPhoto(photo);
    setSheetOriginRect(rect);
    setSheetThumbUrl(thumb);
    setSheetVisible(true);
    setSheetBlocking(true);
  }, []);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLDivElement>(null);
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
        hasPhotosRef.current = true;
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
      if (next.length > 0) hasPhotosRef.current = true;
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
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; });
  }, [runSearch]);

  const clearSearch = useCallback(() => {
    setSearchActive(false);
    setSearchQuery("");
    setSearchPhotosArr([]);
    setSearchOffset(0);
    activeQueryRef.current = "";
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; });
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    seedRef.current = _preloadSeed || getOrCreateSeed();
    if (initialPhotos.length === 0) {
      // Use preloaded data if ready, otherwise await it
      preloadFirstBatch().then((photos) => {
        if (photos.length > 0) {
          setPhotos(photos);
          hasPhotosRef.current = true;
          pageRef.current = 1;
        } else {
          void loadMore();
        }
      });
    }
    // Eagerly prefetch inspirations so chips are instant on first search open
    if (cachedInspirations.length === 0) {
      prefetchInspirations();
      // Poll briefly until data arrives, then set chips
      const interval = setInterval(() => {
        if (cachedInspirations.length > 0) {
          setSearchChips(pickRandom(cachedInspirations, 3));
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
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
        for (const el of [subtitleRef.current, searchBtnRef.current]) {
          if (!el) continue;
          el.style.transition = "none";
          el.style.opacity = "1";
          el.style.transform = "translate3d(0, 0, 0)";
          (el as HTMLElement).style.pointerEvents = "auto";
        }
        if (hasPhotosRef.current) {
          setGridAnimKey((k) => k + 1);
        }
      }
    });
    return unsub;
  }, []);

  // ── Subtitle + search button: hide on scroll-down, show on scroll-up ────────
  // Direction-aware: any downward scroll hides them, any upward scroll reveals.
  // CSS transition does the animation — JS only flips the hidden state once per
  // direction change, so there's zero per-frame stutter.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const THRESHOLD = 6; // px of scroll before direction is committed
    const TRANSITION_HIDE = "opacity 0.18s ease-in, transform 0.18s ease-in";
    const TRANSITION_SHOW = "opacity 0.32s ease-out, transform 0.32s ease-out";

    let lastScrollTop = container.scrollTop;
    let hidden = false;

    const SUBTITLE_FADE_END = 60;

    const setSearchBtnHidden = (hide: boolean) => {
      if (hide === hidden) return;
      hidden = hide;
      const searchBtn = searchBtnRef.current;
      if (!searchBtn) return;
      searchBtn.style.transition = hide ? TRANSITION_HIDE : TRANSITION_SHOW;
      searchBtn.style.opacity = hide ? "0" : "1";
      searchBtn.style.transform = hide ? "translate3d(0, -20px, 0)" : "translate3d(0, 0, 0)";
      searchBtn.style.pointerEvents = hide ? "none" : "auto";
    };

    const onScroll = () => {
      const cur = container.scrollTop;
      const delta = cur - lastScrollTop;

      // Subtitle: position-based, only visible near top
      const subtitle = subtitleRef.current;
      if (subtitle) {
        const p = Math.min(1, Math.max(0, cur / SUBTITLE_FADE_END));
        subtitle.style.opacity = `${1 - p}`;
        subtitle.style.transform = `translate3d(0, -${p * 20}px, 0)`;
      }

      // Search button: direction-aware
      if (Math.abs(delta) < THRESHOLD) return;
      lastScrollTop = cur;
      if (cur <= 10) { setSearchBtnHidden(false); return; }
      setSearchBtnHidden(delta > 0);
    };

    const show = () => {
      lastScrollTop = container.scrollTop;
      setSearchBtnHidden(false);
      const subtitle = subtitleRef.current;
      if (subtitle) {
        subtitle.style.transition = "none";
        subtitle.style.opacity = "1";
        subtitle.style.transform = "translate3d(0, 0, 0)";
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("tab-shown", show);
    window.addEventListener("pageshow", show);

    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("tab-shown", show);
      window.removeEventListener("pageshow", show);
    };
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


  return (
    <div
      id="discover-page-root"
      ref={scrollRef}
      data-scroll-reset
      className="h-[100dvh] overflow-y-auto bg-[#f5f2ef] lg:h-auto lg:overflow-visible lg:min-h-screen"
      style={{ pointerEvents: sheetVisible ? "none" : "auto" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Pull-to-refresh indicator — sits below the Discover title ── */}
      {pullPct > 0.05 && <PullIndicator pullPct={pullPct} />}

      {/* ── Refreshing spinner — below title ── */}
      {refreshing && (
        <div
          className="fixed left-1/2 z-[1200] pointer-events-none"
          style={{ top: `calc(var(--sat, 44px) + 68px)`, transform: "translateX(-50%)" }}
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
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 65%, transparent 100%)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(1px)",
            maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
            height: "100%",
          }}
        />
        <div className="relative" style={{ paddingTop: "var(--tab-title-top)", paddingBottom: "16px" }}>
          {/* Title row — always fixed height, never shifts */}
          <div className="flex items-start justify-between px-4">
            <div className="w-[58px]" />
            <div className="flex-1 text-center">
              <h1
                className="tab-header-title"
                style={{ textShadow: "0 2px 16px rgba(0,0,0,0.65), 0 1px 4px rgba(0,0,0,0.5)" }}
              >
                Discover
              </h1>
              <div className="flex justify-center mt-1 pointer-events-auto" style={{ opacity: searchActive ? 1 : 0, transition: "opacity 0.2s ease" }}>
                <span className="bg-white/90 text-stone-800 text-[11px] font-semibold px-3 py-1 rounded-full truncate max-w-[200px]">
                  {searchQuery || " "}
                </span>
              </div>
            </div>
            <div ref={searchBtnRef} className="pointer-events-auto flex justify-end" style={{ width: "58px", marginTop: "-6px", paddingRight: "8px" }}>
              {searchActive ? (
                <button
                  onClick={() => { void hapticLight(); clearSearch(); }}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white active:bg-white/30 shrink-0"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[20px] h-[20px]">
                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => { void hapticLight(); if (cachedInspirations.length > 0) setSearchChips(pickRandom(cachedInspirations, 3)); setSearchOpen((v) => !v); }}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white active:bg-white/30 shrink-0"
                >
                  <Icon name="search" size={20} className="text-white" />
                </button>
              )}
            </div>
          </div>

          {/* Search bar — slides down from title, fades in with ease-out */}
          <div
            className="pointer-events-auto overflow-hidden"
            style={{ height: searchOpen ? "88px" : "52px", transition: "height 0.38s cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div
              style={{
                transform: searchOpen ? "translateY(0)" : "translateY(-88px)",
                opacity: searchOpen ? 1 : 0,
                transition: searchOpen
                  ? "transform 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease-out"
                  : "transform 0.28s cubic-bezier(0.4,0,1,1), opacity 0.2s ease-in",
                pointerEvents: searchOpen ? "auto" : "none",
              }}
            >
              <SearchBar key={searchOpen ? "open" : "closed"} isOpen={searchOpen} onSearch={handleSearch} onClose={() => setSearchOpen(false)} chips={searchChips} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Search overlay — darkens grid when search bar is open ── */}
      <div
        className="fixed inset-0 z-[1050] lg:hidden"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          opacity: searchOpen ? 1 : 0,
          pointerEvents: searchOpen ? "auto" : "none",
          transition: searchOpen
            ? "opacity 0.3s ease-out"
            : "opacity 0.22s ease-in",
        }}
        onPointerDown={() => setSearchOpen(false)}
      />

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
            <SearchBar isOpen={searchOpen} onSearch={handleSearch} onClose={() => setSearchOpen(false)} chips={searchChips} />
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

      {/* ── Popup dim overlay — opacity-only for GPU compositing ── */}
      <div
        className="fixed inset-0 z-[3400] pointer-events-none lg:hidden"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          opacity: sheetVisible ? 1 : 0,
          transition: sheetVisible
            ? "opacity 420ms cubic-bezier(0.4,0,0.2,1)"
            : "opacity 380ms cubic-bezier(0.64,0,0.78,0)",
          willChange: "opacity",
        }}
      />

      {/* ── Feed ── */}
      <div
        className={`px-3 pb-8 lg:px-10 xl:px-16 lg:!pt-0${sheetVisible ? " discover-blurred" : ""}`}
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
                  <div
                    key={`${gridAnimKey}-${photo.id}`}
                    style={{ animation: "cardIn 0.7s ease both", animationDelay: `${Math.min(colIdx * 2 * 0.06, 0.36)}s` }}
                  >
                    <DiscoverTile
                      photo={photo}
                      aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]}
                      isPriority={colIdx < 4}
                      onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)}
                    />
                  </div>
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => (
                  <SkeletonTile key={`l-sk-${i}`} aspectClass={LEFT_ASPECTS[(leftPhotos.length + i) % LEFT_ASPECTS.length]} />
                ))}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {rightPhotos.map((photo, colIdx) => (
                  <div
                    key={`${gridAnimKey}-${photo.id}`}
                    style={{ animation: "cardIn 0.7s ease both", animationDelay: `${Math.min((colIdx * 2 + 1) * 0.06, 0.36)}s` }}
                  >
                    <DiscoverTile
                      photo={photo}
                      aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]}
                      isPriority={colIdx < 4}
                      onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)}
                    />
                  </div>
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
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]} isPriority={colIdx < 4} onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d0-sk-${i}`} aspectClass={LEFT_ASPECTS[(col0.length + i) % LEFT_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col1.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]} isPriority={colIdx < 4} onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d1-sk-${i}`} aspectClass={RIGHT_ASPECTS[(col1.length + i) % RIGHT_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col2.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={COL2_ASPECTS[colIdx % COL2_ASPECTS.length]} isPriority={colIdx < 4} onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d2-sk-${i}`} aspectClass={COL2_ASPECTS[(col2.length + i) % COL2_ASPECTS.length]} />)}
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {col3.map((photo, colIdx) => (
                  <DiscoverTile key={photo.id} photo={photo} aspectClass={COL3_ASPECTS[colIdx % COL3_ASPECTS.length]} isPriority={colIdx < 4} onOpen={(rect, thumb) => handleTileOpen(photo, rect, thumb)} />
                ))}
                {(loading || searchLoading) && [0, 1, 2].map((i) => <SkeletonTile key={`d3-sk-${i}`} aspectClass={COL3_ASPECTS[(col3.length + i) % COL3_ASPECTS.length]} />)}
              </div>
            </div>
          </>
        )}

        <div ref={sentinelRef} className="h-4" />
        <div className="h-[calc(env(safe-area-inset-bottom,0px)+72px)]" />
      </div>

      <DiscoverPhotoSheet
        photo={sheetPhoto}
        originRect={sheetOriginRect}
        thumbUrl={sheetThumbUrl}
        onCloseStart={() => {}}
        onClose={() => { setSheetVisible(false); setSheetPhoto(null); setSheetOriginRect(null); setSheetThumbUrl(null); }}
      />

    </div>
  );
}
