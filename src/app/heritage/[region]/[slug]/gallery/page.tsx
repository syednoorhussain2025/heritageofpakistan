// src/app/heritage/[region]/[slug]/gallery/page.tsx
"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  memo,
} from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabaseClient";
import { decode } from "blurhash";

// Collections
import { useCollections } from "@/components/CollectionsProvider";
import CollectHeart from "@/components/CollectHeart";

// Universal Lightbox (code split to reduce initial bundle)
const Lightbox = dynamic(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

const AddToCollectionModal = dynamic(
  () => import("@/components/AddToCollectionModal"),
  { ssr: false }
);

import type { LightboxPhoto } from "@/types/lightbox";
import { getSiteGalleryPhotosForLightbox } from "@/lib/db/lightbox";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/* ---------- Types ---------- */

type SiteHeaderInfo = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tagline?: string | null;
};

/** LightboxPhoto plus optional server-provided extras. */
type PhotoWithExtras = LightboxPhoto & {
  width?: number | null;
  height?: number | null;
  blurHash?: string | null;
  blurDataURL?: string | null;
};

/* ---------- Grid / loading helpers ---------- */

/**
 * How many photos to show at a time in the grid.
 * First batch renders immediately, later batches stream in while scrolling.
 */
const BATCH_SIZE = 20;

/**
 * On mobile you have a 3-column grid. Top 3 rows = 9 images.
 * These are prioritized to be fetched and displayed early.
 */
const MOBILE_COLS = 3;
const MOBILE_TOP_ROWS = 3;
const TOP_ROWS_PRIORITY_COUNT = MOBILE_COLS * MOBILE_TOP_ROWS; // 9

/* ---------- Blurhash Placeholder ---------- */
/**
 * Runs decode work in requestIdleCallback or a timeout so it does not block
 * initial render. This helps TBT when many tiles are on screen.
 */
function BlurhashPlaceholder({ hash }: { hash: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!hash || !canvasRef.current) return;

    const draw = () => {
      const width = 32;
      const height = 32;
      const pixels = decode(hash, width, height);
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.createImageData(width, height);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    };

    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(draw);
    } else {
      timeoutId = window.setTimeout(draw, 0);
    }

    return () => {
      if (idleId !== null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hash]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      width={32}
      height={32}
    />
  );
}

type MasonryTileProps = {
  photo: LightboxPhoto;
  onOpen: () => void;
  siteId: string;
  /** Uses Next Image priority + high fetchPriority for top-of-grid images */
  isPriority: boolean;
  /** Only first N tiles use blurhash to avoid heavy decode on all tiles */
  useBlurhash: boolean;
};

const MasonryTile = memo(function MasonryTile({
  photo,
  onOpen,
  siteId,
  isPriority,
  useBlurhash,
}: MasonryTileProps) {
  const extras = photo as PhotoWithExtras;

  // Blur data from DB if present and enabled
  const blurHash = useBlurhash ? extras.blurHash : undefined;
  const blurDataURL = extras.blurDataURL ?? undefined;

  // Only care whether the image has loaded
  const [loaded, setLoaded] = useState(false);

  return (
    <figure className="relative [content-visibility:auto] [contain-intrinsic-size:300px_225px]">
      <div
        className="relative w-full overflow-hidden group rounded-xl aspect-[4/3]"
        onClick={onOpen}
        title="Open"
      >
        {/* Placeholder layer:
            stays mounted, fades out when the image is ready
        */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ease-out ${
            loaded ? "opacity-0" : "opacity-100"
          }`}
        >
          {blurHash ? (
            <BlurhashPlaceholder hash={blurHash} />
          ) : (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          )}
        </div>

        {/* Small grey spinner while image is loading */}
        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin shadow-sm" />
          </div>
        )}

        {/* Actual image, fading in over the placeholder */}
        <Image
          src={photo.url}
          alt={photo.caption ?? ""}
          fill
          className={`object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110 transition-opacity duration-500 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          /*
            Sizes aligned to your grid:
            - <640px: 3 columns -> each around 32vw
            - ≥640px: still 3 columns, inside padded container -> about 30vw
            - ≥768px (md, 4 cols): ~22vw
            - ≥1024px (lg, 5 cols): ~18vw
            - ≥1280px (xl, 5 cols in max-w container): ~16vw
          */
          sizes="
            (min-width: 1280px) 16vw,
            (min-width: 1024px) 18vw,
            (min-width: 768px) 22vw,
            (min-width: 640px) 30vw,
            32vw
          "
          priority={isPriority}
          loading={isPriority ? "eager" : "lazy"}
          fetchPriority={isPriority ? "high" : "low"}
          placeholder={blurDataURL ? "blur" : "empty"}
          blurDataURL={blurDataURL}
          onLoadingComplete={() => {
            setLoaded(true);
          }}
        />

        {/* Bookmark heart overlay (click does not open lightbox) */}
        <div
          className="absolute top-2 right-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <CollectHeart
            variant="overlay"
            siteImageId={photo.id}
            storagePath={photo.storagePath}
            siteId={siteId}
            caption={photo.caption}
            credit={photo.author?.name}
          />
        </div>
      </div>
    </figure>
  );
});

/* ---------- Skeletons ---------- */

function HeaderSkeleton() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-8 pb-4">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 animate-pulse">
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-orange-300/40 bg-gray-200" />
        <div className="flex-1 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-7 w-56 rounded bg-gray-200" />
            <div className="h-6 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="mt-2 h-4 w-220 max-w-full rounded bg-gray-200" />
          <div className="mt-2 h-3 w-220 max-w-full rounded bg-gray-200" />
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 w-25 rounded-full bg-gray-200" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GridSkeleton() {
  const placeholders = Array.from({ length: 15 });
  return (
    <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pb-10">
      <div
        className="
          grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5
          gap-2 sm:gap-4
        "
      >
        {placeholders.map((_, i) => (
          <div
            key={i}
            className="w-full aspect-[4/3] rounded-xl bg-gray-200 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}

/* ---------- Page ---------- */

export default function SiteGalleryPage() {
  const params = useParams() as { region?: string; slug?: string };
  // region param exists in the new route but we only need slug to load the site
  const slug = (params.slug as string) ?? "";
  const { userId: viewerId } = useAuthUserId();
  const { toggleCollect } = useCollections();
  const supabase = createClient();

  const [site, setSite] = useState<SiteHeaderInfo | null>(null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  // Incremental grid state
  const [visibleCount, setVisibleCount] = useState<number>(BATCH_SIZE);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Lightbox and modal state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<LightboxPhoto | null>(
    null
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Site info for compact header
      const { data: siteData, error: sErr } = await supabase
        .from("sites")
        .select(
          "id, slug, title, cover_photo_url, location_free, latitude, longitude, tagline"
        )
        .eq("slug", slug)
        .single();
      if (sErr) throw sErr;
      if (!siteData) throw new Error("Site not found.");
      setSite(siteData as SiteHeaderInfo);

      // Photos for Lightbox
      const photoData = await getSiteGalleryPhotosForLightbox(
        siteData.id,
        viewerId
      );
      setPhotos(photoData);
    } catch (error) {
      console.error("Failed to load gallery:", error);
    } finally {
      setLoading(false);
    }
  }, [slug, viewerId, supabase]);

  useEffect(() => {
    if (slug) loadData();
  }, [slug, loadData]);

  // Reset visibleCount when a new photo set loads
  useEffect(() => {
    if (!loading) {
      setVisibleCount(BATCH_SIZE);
    }
  }, [loading]);

  const categories: string[] = useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) =>
      (p.site?.categories || []).forEach((c) => set.add(c))
    );
    return Array.from(set);
  }, [photos]);

  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount]
  );

  // Incremental loading on scroll using IntersectionObserver
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    if (visibleCount >= photos.length) return;

    let timeoutId: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;

        // Trigger next batch load with a small delay
        setIsBatchLoading(true);
        timeoutId = window.setTimeout(() => {
          setVisibleCount((prev) =>
            Math.min(prev + BATCH_SIZE, photos.length)
          );
          setIsBatchLoading(false);
        }, 250);
      },
      {
        root: null,
        rootMargin: "200px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [visibleCount, photos.length]);

  const handleBookmarkToggle = useCallback(
    async (photo: LightboxPhoto) => {
      if (!viewerId) return alert("Please sign in to save photos..");
      await toggleCollect({
        siteImageId: photo.id,
        storagePath: photo.storagePath,
      });
      setPhotos((arr) =>
        arr.map((p) =>
          p.id === photo.id ? { ...p, isBookmarked: !p.isBookmarked } : p
        )
      );
    },
    [viewerId, toggleCollect]
  );

  const handleOpenCollectionModal = useCallback((photo: LightboxPhoto) => {
    setSelectedPhoto(photo);
    setCollectionModalOpen(true);
  }, []);

  const hasGps = !!(site?.latitude && site?.longitude);
  const googleMapsUrl = hasGps
    ? `https://www.google.com/maps/search/?api=1&query=${site?.latitude},${site?.longitude}`
    : null;

  const circlePreview =
    site?.cover_photo_url || photos[0]?.url || "/placeholder.png";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : site ? (
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-8 pb-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-orange-400/80 shadow-md flex-shrink-0">
              <Image
                src={circlePreview}
                alt={site.title}
                fill
                className="object-cover"
                sizes="112px"
                priority
                placeholder={(site as any).cover_blurDataURL ? "blur" : "empty"}
                blurDataURL={(site as any).cover_blurDataURL || undefined}
              />
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold">{site.title}</h1>
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition"
                    title="Open in Google Maps"
                  >
                    <Icon name="map-marker-alt" />
                    <span>GPS</span>
                  </a>
                )}
              </div>

              {site.location_free && (
                <div className="mt-1 text-gray-600">{site.location_free}</div>
              )}

              {site.tagline && (
                <div className="mt-2 text-sm text-gray-700">
                  {site.tagline}
                </div>
              )}

              {categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-center sm:justify-start">
                  {categories.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-8 pb-4">
          <div className="p-6 text-gray-600">Not found.</div>
        </section>
      )}

      {/* Photos grid */}
      {loading ? (
        <GridSkeleton />
      ) : (
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pb-10">
          {photos.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-6 text-gray-600">
              No photos uploaded yet for this site.
            </div>
          ) : (
            <>
              <div
                className="
                  grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5
                  gap-2 sm:gap-4
                "
              >
                {visiblePhotos.map((photo, idx) => (
                  <MasonryTile
                    key={photo.id}
                    photo={photo}
                    siteId={site!.id}
                    onOpen={() => setLightboxIndex(idx)}
                    // Prioritize top rows (first 9 items based on mobile 3x3)
                    isPriority={idx < TOP_ROWS_PRIORITY_COUNT}
                    // Only first tiles use blurhash decode
                    useBlurhash={idx < TOP_ROWS_PRIORITY_COUNT + 3}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel + spinner */}
              {visiblePhotos.length > 0 &&
                visiblePhotos.length < photos.length && (
                  <div
                    ref={loaderRef}
                    className="mt-6 flex justify-center items-center py-4"
                  >
                    {isBatchLoading && (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <span className="inline-flex h-5 w-5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                        <span>Loading more photos</span>
                      </div>
                    )}
                  </div>
                )}
            </>
          )}
        </section>
      )}

      {/* Universal Lightbox */}
      {!loading && lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onBookmarkToggle={viewerId ? handleBookmarkToggle : undefined}
          onAddToCollection={viewerId ? handleOpenCollectionModal : undefined}
        />
      )}

      {/* Add to Collection Modal */}
      {!loading && collectionModalOpen && selectedPhoto && (
        <AddToCollectionModal
          open={collectionModalOpen}
          onClose={() => setCollectionModalOpen(false)}
          onInsert={(_items) => {
            setCollectionModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
