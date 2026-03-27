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
import type { DiscoverPhoto } from "@/lib/discover-actions";

async function loadPhotos(page: number, seed: number): Promise<DiscoverPhoto[]> {
  const res = await fetch(`/api/discover?page=${page}&seed=${seed}`);
  if (!res.ok) return [];
  return res.json();
}
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight } from "@/lib/haptics";
import type { LightboxPhoto } from "@/types/lightbox";

const Lightbox = dynamicImport(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

/* ─── Tile aspect ratio pattern ───────────────────────────────────────────
   We repeat a pattern of aspect ratios per column to create a natural
   staggered Pinterest feel. Left col and right col have different rhythms
   so they never align at the same height simultaneously.
*/
const LEFT_ASPECTS  = ["aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]", "aspect-square", "aspect-[2/3]"];
const RIGHT_ASPECTS = ["aspect-[2/3]", "aspect-square", "aspect-[3/4]", "aspect-[2/3]", "aspect-[3/4]"];

/* ─── Single tile ─────────────────────────────────────────────────────── */

type TileProps = {
  photo: DiscoverPhoto;
  aspectClass: string;
  onOpen: (rect: DOMRect, thumb: string) => void;
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
    try { return getVariantPublicUrl(photo.storagePath, "sm"); } catch { return photo.url; }
  }, [photo.storagePath, photo.url]);

  const handlePress = useCallback(() => {
    void hapticLight();
    const rect = tileRef.current?.getBoundingClientRect();
    if (rect) onOpen(rect, thumbUrl);
  }, [onOpen, thumbUrl]);

  return (
    <div
      ref={tileRef}
      className={`relative w-full overflow-hidden rounded-xl cursor-pointer group ${aspectClass}`}
      style={{ backgroundColor: "#e0dcd8" }}
      onClick={handlePress}
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
        className="absolute inset-0 w-full h-full object-cover z-[2] group-active:scale-[1.03] transition-transform duration-300 ease-out"
        style={{ opacity: 0 }}
        loading={isPriority ? "eager" : "lazy"}
        fetchPriority={isPriority ? "high" : "auto"}
        onLoad={onImgLoad}
        onError={onImgLoad}
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

/* ─── Skeleton tile ───────────────────────────────────────────────────── */

function SkeletonTile({ aspectClass }: { aspectClass: string }) {
  return (
    <div className={`w-full rounded-xl bg-gray-200 animate-pulse ${aspectClass}`} />
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */

const LOAD_THRESHOLD_PX = 600;

export default function DiscoverClient({
  initialPhotos,
}: {
  initialPhotos: DiscoverPhoto[];
}) {
  // Stable random seed for this session
  const seed = useRef(Math.random()).current;

  const [photos, setPhotos]   = useState<DiscoverPhoto[]>(initialPhotos);
  const [page, setPage]       = useState(initialPhotos.length > 0 ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  // Lightbox
  const [lightboxIndex, setLightboxIndex]   = useState<number | null>(null);
  const [lightboxOrigin, setLightboxOrigin] = useState<{ rect: DOMRect; thumb: string } | null>(null);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial fetch when mounted with no photos (e.g. from TabShell)
  useEffect(() => {
    if (initialPhotos.length === 0 && photos.length === 0 && !loading) {
      void (async () => {
        setLoading(true);
        try {
          const first = await loadPhotos(0, seed);
          if (first.length > 0) {
            setPhotos(first);
            setPage(1);
          }
          if (first.length < 30) setDone(true);
        } finally {
          setLoading(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const next = await loadPhotos(page, seed);
      if (next.length === 0) {
        setDone(true);
      } else {
        setPhotos((prev) => {
          // Deduplicate by id
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...next.filter((p) => !seen.has(p.id))];
        });
        setPage((p) => p + 1);
        if (next.length < 30) setDone(true); // fewer than a full page = exhausted
      }
    } finally {
      setLoading(false);
    }
  }, [loading, done, page, seed]);

  // IntersectionObserver on sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void loadMore(); },
      { rootMargin: `${LOAD_THRESHOLD_PX}px` }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Split photos into two columns with staggered aspect ratios
  const [leftPhotos, rightPhotos] = useMemo(() => {
    const left: DiscoverPhoto[]  = [];
    const right: DiscoverPhoto[] = [];
    photos.forEach((p, i) => {
      if (i % 2 === 0) left.push(p); else right.push(p);
    });
    return [left, right];
  }, [photos]);

  const handleOpen = useCallback(
    (photo: DiscoverPhoto, rect: DOMRect, thumb: string) => {
      const idx = photos.findIndex((p) => p.id === photo.id);
      if (idx !== -1) {
        setLightboxIndex(idx);
        setLightboxOrigin({ rect, thumb });
      }
    },
    [photos]
  );

  // Stub — discover feed is read-only for bookmark toggle (no-op for now)
  const handleBookmarkToggle = useCallback(async (_photo: LightboxPhoto) => {}, []);
  const handleAddToCollection = useCallback(async (_photo: LightboxPhoto) => {}, []);

  // Skeleton tiles while first load
  const showSkeleton = photos.length === 0;

  return (
    <div className="min-h-screen bg-[#f5f2ef]">

      {/* ── Fixed header: gradient + blur + "Discover" title ── */}
      <div
        className="fixed inset-x-0 top-0 z-[1100] pointer-events-none lg:hidden"
        style={{ paddingTop: "var(--sat, 44px)" }}
      >
        {/* Gradient + blur backdrop */}
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
        {/* Title */}
        <div
          className="relative flex items-center justify-center"
          style={{ paddingTop: "var(--sat, 44px)", paddingBottom: "14px" }}
        >
          <h1
            className="text-white font-bold tracking-tight"
            style={{
              fontSize: "clamp(28px, 8vw, 36px)",
              textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              letterSpacing: "-0.02em",
            }}
          >
            Discover
          </h1>
        </div>
      </div>

      {/* ── Feed ── */}
      <div
        className="px-2 pb-8"
        style={{
          paddingTop: "calc(var(--sat, 44px) + 70px)",
        }}
      >
        {showSkeleton ? (
          /* Skeleton two-column grid */
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
                  key={photo.id}
                  photo={photo}
                  aspectClass={LEFT_ASPECTS[colIdx % LEFT_ASPECTS.length]}
                  isPriority={colIdx < 4}
                  onOpen={(rect, thumb) => handleOpen(photo, rect, thumb)}
                />
              ))}
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-2 flex-1">
              {rightPhotos.map((photo, colIdx) => (
                <DiscoverTile
                  key={photo.id}
                  photo={photo}
                  aspectClass={RIGHT_ASPECTS[colIdx % RIGHT_ASPECTS.length]}
                  isPriority={colIdx < 4}
                  onOpen={(rect, thumb) => handleOpen(photo, rect, thumb)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* Loading spinner */}
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-[var(--brand-orange)] rounded-full animate-spin" />
          </div>
        )}

        {/* Bottom nav clearance */}
        <div className="h-[calc(env(safe-area-inset-bottom,0px)+72px)]" />
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          originRect={lightboxOrigin?.rect ?? null}
          originThumb={lightboxOrigin?.thumb ?? null}
          onClose={() => { setLightboxIndex(null); setLightboxOrigin(null); }}
          onBookmarkToggle={handleBookmarkToggle}
          onAddToCollection={handleAddToCollection}
        />
      )}
    </div>
  );
}
