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

async function loadPhotos(page: number, cycle: number): Promise<DiscoverPhoto[]> {
  const res = await fetch(`/api/discover?page=${page}&cycle=${cycle}`);
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
        className="absolute inset-0 w-full h-full object-cover z-[2] transition-transform duration-500 ease-in-out"
        style={{ transform: pressed ? "scale(1.06)" : "scale(1)" }}
        style={{ opacity: 0 }}
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

/* ─── Main component ───────────────────────────────────────────────────── */

const LOAD_THRESHOLD_PX = 1500;

export default function DiscoverClient({
  initialPhotos,
}: {
  initialPhotos: DiscoverPhoto[];
}) {
  const [photos, setPhotos]   = useState<DiscoverPhoto[]>(initialPhotos);
  const [loading, setLoading] = useState(false);
  const pageRef  = useRef(initialPhotos.length > 0 ? 1 : 0);
  const cycleRef = useRef(0);

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
      const next = await loadPhotos(pageRef.current, cycleRef.current);
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

  useEffect(() => {
    if (initialPhotos.length === 0) void loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const [leftPhotos, rightPhotos] = useMemo(() => {
    const left: DiscoverPhoto[]  = [];
    const right: DiscoverPhoto[] = [];
    photos.forEach((p, i) => {
      if (i % 2 === 0) left.push(p); else right.push(p);
    });
    return [left, right];
  }, [photos]);

  const showSkeleton = photos.length === 0;

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
          className="relative flex items-center justify-center"
          style={{ paddingTop: "calc(var(--sat, 44px) + 4px)", paddingBottom: "12px" }}
        >
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
        </div>
      </div>

      {/* ── Feed ── */}
      <div
        className="px-2 pb-8"
        style={{ paddingTop: "calc(var(--sat, 44px) + 70px)" }}
      >
        {showSkeleton ? (
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
    </div>
  );
}
