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

// Variants helper
import { getVariantPublicUrl } from "@/lib/imagevariants";

// Universal Lightbox
const Lightbox = dynamicImport(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

const AddToCollectionModal = dynamicImport(
  () => import("@/components/AddToCollectionModal"),
  { ssr: false }
);

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
  initialSite: SiteHeaderInfo | null;
  initialPhotos: LightboxPhoto[];
};

/* ---------- Helpers ---------- */

const BATCH_SIZE = 20;
const TOP_PRIORITY_COUNT = 4;

/* ---------- Blurhash ---------- */

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

/* ---------- Masonry Tile ---------- */

type MasonryTileProps = {
  photo: LightboxPhoto;
  onOpen: () => void;
  siteId: string;
  isPriority: boolean;
};

const MasonryTile = memo(function MasonryTile({
  photo,
  onOpen,
  siteId,
  isPriority,
}: MasonryTileProps) {
  const extras = photo as PhotoWithExtras;

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
    return () => observer.disconnect();
  }, []);

  const blurHash =
    isNearViewport && extras.blurHash ? extras.blurHash : undefined;
  const blurDataURL = extras.blurDataURL ?? undefined;

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

  const [loaded, setLoaded] = useState(false);

  return (
    <figure className="relative [content-visibility:auto] [contain-intrinsic-size:300px_225px]">
      <div
        ref={tileRef}
        className="relative w-full overflow-hidden group rounded-xl aspect-[4/3] cursor-pointer"
        onClick={onOpen}
        title="Open"
      >
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

        {!loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="h-5 w-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin shadow-sm" />
          </div>
        )}

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
          }}
        />

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
      <div className="animate-pulse flex items-center gap-4">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-72 bg-gray-200 rounded" />
          <div className="h-4 w-40 bg-gray-200 rounded" />
        </div>
      </div>
    </section>
  );
}

function GridSkeleton() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pb-10">
      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-2 sm:gap-4 animate-pulse">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] bg-gray-200 rounded-xl" />
        ))}
      </div>
    </section>
  );
}

/* ---------- Page Component ---------- */

export default function GalleryClient({
  region,
  slug,
  initialSite,
  initialPhotos,
}: GalleryClientProps) {
  const { userId: viewerId } = useAuthUserId();
  const { toggleCollect } = useCollections();

  const [site] = useState<SiteHeaderInfo | null>(initialSite);
  const [photos, setPhotos] = useState<LightboxPhoto[]>(initialPhotos);
  const [loading] = useState(false);

  const [visibleCount, setVisibleCount] = useState<number>(BATCH_SIZE);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<LightboxPhoto | null>(
    null
  );

  /* Reset pagination on slug change */
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [slug]);

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

  /* Pagination observer */
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;

    if (visibleCount >= photos.length) return;

    let timeoutId: number | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;

        setIsBatchLoading(true);
        timeoutId = window.setTimeout(() => {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, photos.length));
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

  const circlePreview = useMemo(() => {
    if (photos[0]?.storagePath) {
      try {
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
      {/* -------------------------------------------------------------
         JSON-LD Structured Data for SEO (ImageGallery Schema)
      -------------------------------------------------------------- */}
      {site && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ImageGallery",
              name: `${site.title} Photo Gallery`,
              description:
                site.tagline ||
                `A curated gallery of high quality photographs of ${site.title}.`,
              url: `https://heritageofpakistan.com/heritage/${region}/${slug}/gallery`,
              about: {
                "@type": "Place",
                name: site.title,
                address: site.location_free || undefined,
                geo: hasGps
                  ? {
                      "@type": "GeoCoordinates",
                      latitude: site.latitude,
                      longitude: site.longitude,
                    }
                  : undefined,
              },
              image: photos.map((p) => ({
                "@type": "ImageObject",
                contentUrl: p.url,
                caption: p.caption || `${site.title} photo`,
              })),
            }),
          }}
        />
      )}

      {/* Header */}
      {loading ? (
        <HeaderSkeleton />
      ) : site ? (
        /* Header content unchanged */
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
              <div className="flex items-center justify-center sm:justify-between gap-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    <a
                      href={`/heritage/${region}/${slug}`}
                      className="hover:text-blue-900 transition"
                    >
                      {site.title}
                    </a>
                  </h1>

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

                <a
                  href={`/heritage/${region}/${slug}`}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-gray-100 hover:bg-gray-200 transition"
                >
                  <Icon name="arrow-left" />
                  <span>Back to Article</span>
                </a>
              </div>

              {site.location_free && (
                <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-gray-600">
                  <a
                    href={`/heritage/${region}/${slug}`}
                    className="inline-flex sm:hidden items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-gray-100 hover:bg-gray-200 transition"
                  >
                    <Icon name="arrow-left" />
                    <span>Back to Article</span>
                  </a>
                  <span>{site.location_free}</span>
                </div>
              )}

              {site.tagline && (
                <div className="mt-2 text-sm text-gray-700">{site.tagline}</div>
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
                    isPriority={idx < TOP_PRIORITY_COUNT}
                  />
                ))}
              </div>

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
