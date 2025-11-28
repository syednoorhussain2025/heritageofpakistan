// src/app/heritage/[region]/[slug]/gallery/page.tsx
"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabaseClient";
import { decode } from "blurhash";

// Collections
import { useCollections } from "@/components/CollectionsProvider";
import CollectHeart from "@/components/CollectHeart";
import AddToCollectionModal from "@/components/AddToCollectionModal";

// Universal Lightbox
import { Lightbox } from "@/components/ui/Lightbox";
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

/* ---------- Masonry (row-major) helpers ---------- */

const ROW_PX = 8; // must match auto-rows value
const GAP_PX = 16; // must match gap-4
const FALLBACK_RATIO = 4 / 3;

/**
 * How many photos to show at a time in the grid.
 * First batch renders immediately, later batches stream in while scrolling.
 */
const BATCH_SIZE = 20;

/* ---------- Blurhash Placeholder ---------- */

function BlurhashPlaceholder({ hash }: { hash: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!hash || !canvasRef.current) return;

    const width = 32;
    const height = 32;
    const pixels = decode(hash, width, height);
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
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
  isPriority: boolean;
};

function MasonryTile({ photo, onOpen, siteId, isPriority }: MasonryTileProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [span, setSpan] = useState(1);

  const extras = photo as PhotoWithExtras;

  // Prefer server-cached dimensions if available
  const initialRatio =
    extras.width && extras.height && extras.width > 0 && extras.height > 0
      ? extras.width / extras.height
      : FALLBACK_RATIO;

  const [aspectRatio, setAspectRatio] = useState(initialRatio);

  // Blur data from DB if present
  const blurHash = extras.blurHash;
  const blurDataURL = extras.blurDataURL ?? undefined;

  const recomputeSpan = useCallback(() => {
    if (!wrapperRef.current || !aspectRatio) return;
    const w = wrapperRef.current.clientWidth;
    if (w <= 0) return;

    const imgH = w / aspectRatio;
    const rows = Math.ceil((imgH + GAP_PX) / (ROW_PX + GAP_PX));
    setSpan(rows);
  }, [aspectRatio]);

  // Initial + whenever aspectRatio changes
  useLayoutEffect(() => {
    recomputeSpan();
  }, [recomputeSpan]);

  // Recompute on wrapper resize and window resize
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => recomputeSpan());
    ro.observe(el);

    const onResize = () => recomputeSpan();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [recomputeSpan]);

  // Only care whether the image has loaded
  const [loaded, setLoaded] = useState(false);

  return (
    <figure className="relative" style={{ gridRowEnd: `span ${span}` }}>
      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden group rounded-xl"
        style={{ aspectRatio: String(aspectRatio) }}
        onClick={onOpen}
        title="Open"
      >
        {/* Placeholder layer:
            - stays mounted, fades out when the image is ready
        */}
        <div
          className={`
            absolute inset-0 pointer-events-none
            transition-opacity duration-500 ease-out
            ${loaded ? "opacity-0" : "opacity-100"}
          `}
        >
          {blurHash ? (
            <BlurhashPlaceholder hash={blurHash} />
          ) : (
            <div className="w-full h-full bg-gray-100 animate-pulse" />
          )}
        </div>

        {/* Actual image, fading in over the placeholder */}
        <Image
          src={photo.url}
          alt={photo.caption ?? ""}
          fill
          className={`
            object-cover w-full h-full transform-gpu will-change-transform
            transition-transform duration-200 ease-out group-hover:scale-110
            transition-opacity duration-500 ease-out
            ${loaded ? "opacity-100" : "opacity-0"}
          `}
          sizes="
            (min-width: 1600px) 18vw,
            (min-width: 1280px) 22vw,
            (min-width: 1024px) 28vw,
            (min-width: 768px)  34vw,
            (min-width: 640px)  48vw,
            100vw
          "
          priority={isPriority}
          loading={isPriority ? "eager" : "lazy"}
          fetchPriority={isPriority ? "high" : "low"}
          placeholder={blurDataURL ? "blur" : "empty"}
          blurDataURL={blurDataURL}
          onLoadingComplete={(img) => {
            // Only recompute ratio if we did not already have good server dimensions
            if (
              (!extras.width || !extras.height) &&
              img.naturalWidth > 0 &&
              img.naturalHeight > 0
            ) {
              setAspectRatio(img.naturalWidth / img.naturalHeight);
            }
            setLoaded(true);
          }}
        />

        {/* Bookmark heart overlay (click does not open lightbox) */}
        <div
          className="absolute top-2 right-2 z-10"
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
}

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
          grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
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

  // Lightbox & modal state
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
      if (!viewerId) return alert("Please sign in to save photos.");
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
                  grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
                  auto-rows-[8px] grid-flow-row
                "
              >
                {visiblePhotos.map((photo, idx) => (
                  <MasonryTile
                    key={photo.id}
                    photo={photo}
                    siteId={site!.id}
                    onOpen={() => setLightboxIndex(idx)}
                    // First N images eager/high priority for snappy above-the-fold feel
                    isPriority={idx < 6}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel + spinner */}
              {visiblePhotos.length > 0 && visiblePhotos.length < photos.length && (
                <div
                  ref={loaderRef}
                  className="mt-6 flex justify-center items-center py-4"
                >
                  {isBatchLoading && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <span className="inline-flex h-5 w-5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
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
          // Adjust bucket if your component expects a specific one; or omit if not needed
          // bucket="site-images"
          onInsert={(_items) => {
            // You can integrate with your collections system here,
            // using `selectedPhoto` and whatever data `_items` holds.
            setCollectionModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
