// src/app/heritage/[region]/[slug]/gallery/GalleryClient.tsx
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
import dynamicImport from "next/dynamic";
import Icon from "@/components/Icon";
import { decode } from "blurhash";

// Collections
import { useCollections } from "@/components/CollectionsProvider";
import CollectHeart from "@/components/CollectHeart";

// Variants helper (centralized module)
import { getVariantPublicUrl } from "@/lib/imagevariants";

import type { LightboxPhoto } from "@/types/lightbox";
import { useAuthUserId } from "@/hooks/useAuthUserId";

/* ---------- Types ---------- */

export type SiteHeaderInfo = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tagline?: string | null;
};

type PhotoWithExtras = LightboxPhoto & {
  width?: number | null;
  height?: number | null;
  blurHash?: string | null;
  blurDataURL?: string | null;
};

type GalleryClientProps = {
  region: string;
  slug: string;
  initialSite: SiteHeaderInfo;
  initialPhotos: LightboxPhoto[];
};

// Universal Lightbox (code split to reduce initial bundle)
const Lightbox = dynamicImport(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

const AddToCollectionModal = dynamicImport(
  () => import("@/components/AddToCollectionModal"),
  { ssr: false }
);

/* ---------- Grid / loading helpers ---------- */

/**
 * How many photos to show at a time in the grid.
 * First batch renders immediately, later batches stream in while scrolling.
 */
const BATCH_SIZE = 20;

/**
 * Limit how many tiles are treated as high priority.
 * This avoids many concurrent high priority fetches.
 */
const TOP_PRIORITY_COUNT = 4;

/* ---------- Blurhash Placeholder ---------- */

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
  /** Uses Next Image priority and high fetchPriority for top of grid images */
  isPriority: boolean;
  /** Notifies parent once when this image has fully loaded */
  onLoaded: () => void;
};

const MasonryTile = memo(function MasonryTile({
  photo,
  onOpen,
  siteId,
  isPriority,
  onLoaded,
}: MasonryTileProps) {
  const extras = photo as PhotoWithExtras;

  // Visibility based gating for blurhash decode
  const [isNearViewport, setIsNearViewport] = useState(false);
  const tileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "300px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Blur data from DB if present and tile is near viewport
  const blurHash =
    isNearViewport && extras.blurHash ? extras.blurHash : undefined;
  const blurDataURL = extras.blurDataURL ?? undefined;

  // Use stored thumbnail variant through centralized helper
  const thumbUrl = useMemo(() => {
    if (photo.storagePath) {
      try {
        return getVariantPublicUrl(photo.storagePath, "thumb");
      } catch {
        return photo.url;
      }
    }
    return photo.url;
  }, [photo.storagePath, photo.url]);

  // Only care whether the image has loaded
  const [loaded, setLoaded] = useState(false);
  const reportedLoadedRef = useRef(false);

  return (
    <figure className="relative [content-visibility:auto] [contain-intrinsic-size:300px_225px]">
      <div
        ref={tileRef}
        className="relative w-full overflow-hidden group rounded-xl aspect-[4/3]"
        onClick={onOpen}
        title="Open"
      >
        {/* Placeholder layer, fades out when the image is ready */}
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
          src={thumbUrl}
          alt={photo.caption ?? ""}
          fill
          unoptimized
          className={`object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110 transition-opacity duration-500 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
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
            if (!reportedLoadedRef.current) {
              reportedLoadedRef.current = true;
              onLoaded();
            }
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

export default function GalleryClient({
  region,
  slug,
  initialSite,
  initialPhotos,
}: GalleryClientProps) {
  const { userId: viewerId } = useAuthUserId();
  const { toggleCollect } = useCollections();

  // Base state comes from server rendered HTML
  const [site] = useState<SiteHeaderInfo | null>(initialSite ?? null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>(initialPhotos);

  // Incremental grid state
  const [visibleCount, setVisibleCount] = useState<number>(BATCH_SIZE);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Tracks how many tiles in the current batch have fully loaded
  const [loadedInBatch, setLoadedInBatch] = useState(0);

  // Lightbox and modal state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<LightboxPhoto | null>(
    null
  );

  // Reset visible photos when slug changes
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    setLoadedInBatch(0);
  }, [slug]);

  useEffect(() => {
    setLoadedInBatch(0);
  }, [visibleCount]);

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

  const handleTileLoaded = useCallback(() => {
    setLoadedInBatch((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    if (visibleCount >= photos.length) return;

    let timeoutId: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;

        const batchStart = visibleCount - BATCH_SIZE;
        const imagesInThisBatch = photos.slice(
          Math.max(0, batchStart),
          visibleCount
        ).length;

        if (loadedInBatch < imagesInThisBatch) {
          return;
        }

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
  }, [visibleCount, photos.length, loadedInBatch, photos]);

  const handleBookmarkToggle = useCallback(
    async (photo: LightboxPhoto) => {
      if (!viewerId) {
        alert("Please sign in to save photos.");
        return;
      }

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

  // Header circle preview:
  // prefer a stored gallery image variant, then fall back to cover_photo_url, then placeholder
  const circlePreview = useMemo(() => {
    if (photos[0]?.storagePath) {
      try {
        // use the thumbnail variant for the circle
        return getVariantPublicUrl(photos[0].storagePath, "thumb");
      } catch {
        return photos[0].url;
      }
    }
    if (site?.cover_photo_url) return site.cover_photo_url;
    return "/placeholder.png";
  }, [photos, site?.cover_photo_url]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      {site ? (
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-8 pb-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-orange-400/80 shadow-md flex-shrink-0">
              <Image
                src={circlePreview}
                alt={site.title}
                fill
                unoptimized
                className="object-cover"
                sizes="112px"
                loading="lazy"
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
                  isPriority={idx < TOP_PRIORITY_COUNT}
                  onLoaded={handleTileLoaded}
                />
              ))}
            </div>

            {/* Infinite scroll sentinel and spinner */}
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

      {/* Universal Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onBookmarkToggle={viewerId ? handleBookmarkToggle : undefined}
          onAddToCollection={viewerId ? handleOpenCollectionModal : undefined}
        />
      )}

      {/* Add to Collection Modal */}
      {collectionModalOpen && selectedPhoto && (
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
