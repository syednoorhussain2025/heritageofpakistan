// src/app/heritage/[region]/[slug]/gallery/GalleryClient.ts
"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  memo,
} from "react";
import Image from "next/image";
import dynamicImport from "next/dynamic";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";
import { decode } from "blurhash";

// Collections
import { useCollections } from "@/components/CollectionsProvider";
import CollectHeart from "@/components/CollectHeart";

// Variants helper
import { getVariantPublicUrl } from "@/lib/imagevariants";

// Wishlist
import { getListsContainingSite } from "@/lib/wishlists";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { hapticLight } from "@/lib/haptics";

// Universal Lightbox
const Lightbox = dynamicImport(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

const AddToCollectionModal = dynamicImport(
  () => import("@/components/AddToCollectionModal"),
  { ssr: false }
);

const AddToWishlistModal = dynamicImport(
  () => import("@/components/AddToWishlistModal"),
  { ssr: false }
);

import type { LightboxPhoto } from "@/types/lightbox";
import { useSignedInActions } from "@/hooks/useSignedInActions";

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
  onOpen: (rect: DOMRect, thumbUrl: string) => void;
  siteId: string;
  isPriority: boolean;
  ensureSignedIn: () => boolean | Promise<boolean>;
};

type TileVariant = "feature" | "small";

const MasonryTile = memo(function MasonryTile({
  photo,
  onOpen,
  siteId,
  isPriority,
  ensureSignedIn,
  variant = "small",
}: MasonryTileProps & { variant?: TileVariant }) {
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
    <figure className="relative [content-visibility:auto]">
      {/*
        Small tiles: aspect-square wrapper drives height.
        Feature tiles: aspect-[2/3] wrapper drives height — grid row-span-2
        means the cell is exactly 2× a square row, so aspect-[2/3] fills it
        perfectly when cols are equal width.
        Desktop: always aspect-[4/3].
      */}
      <div
        className={`relative w-full overflow-hidden group cursor-pointer
          ${variant === "feature" ? "aspect-[2/3] md:aspect-[4/3]" : "aspect-[4/3] md:aspect-[4/3]"}
        `}
        ref={tileRef}
        onClick={() => {
          void hapticLight();
          const rect = tileRef.current?.getBoundingClientRect();
          if (rect) onOpen(rect, thumbUrl ?? photo.url ?? "");
        }}
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
          className={`object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-300 ease-out group-hover:scale-105 transition-opacity duration-500 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          sizes="(min-width: 768px) 22vw, 50vw"
          priority={isPriority}
          loading={isPriority ? "eager" : "lazy"}
          fetchPriority={isPriority ? "high" : "low"}
          placeholder={blurDataURL ? "blur" : "empty"}
          blurDataURL={blurDataURL}
          onLoadingComplete={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />

        <div
          className="absolute bottom-0 right-0 z-20 p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-black/25 backdrop-blur-sm rounded-lg p-1">
            <CollectHeart
              variant="overlay"
              siteImageId={photo.id}
              storagePath={photo.storagePath}
              siteId={siteId}
              caption={photo.caption}
              credit={photo.author?.name}
              requireSignedIn={ensureSignedIn}
            />
          </div>
        </div>
      </div>
    </figure>
  );
});

/* ---------- Skeletons ---------- */

function HeaderSkeleton() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-3 sm:pt-8 pb-4">
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
  const router = useRouter();
  const { toggleCollect } = useCollections();
  const { ensureSignedIn } = useSignedInActions();
  const { userId } = useAuthUserId();

  // Save-to-list state
  const [isSaved, setIsSaved] = useState(false);
  const [showWishlistModal, setShowWishlistModal] = useState(false);

  // Check if this site is already in any wishlist
  useEffect(() => {
    if (!userId || !initialSite?.id) return;
    getListsContainingSite(initialSite.id).then((lists) => {
      setIsSaved(Array.isArray(lists) && lists.length > 0);
    }).catch(() => {});
  }, [userId, initialSite?.id]);

  // Slide-in from right on mobile (same pattern as HeritageClient)
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || window.innerWidth >= 768) return;
    el.style.transform = "translateX(100%)";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)";
      el.style.transform = "translateX(0)";
      el.addEventListener("transitionend", () => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.willChange = "";
      }, { once: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const [site] = useState<SiteHeaderInfo | null>(initialSite);
  const [photos, setPhotos] = useState<LightboxPhoto[]>(initialPhotos);
  const [loading] = useState(false);

  const [visibleCount, setVisibleCount] = useState<number>(BATCH_SIZE);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const batchLoadingRef = useRef(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxOrigin, setLightboxOrigin] = useState<{ rect: DOMRect; thumb: string } | null>(null);
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
    batchLoadingRef.current = isBatchLoading;
  }, [isBatchLoading]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;

    if (visibleCount >= photos.length) return;

    let timeoutId: number | undefined;
    let disposed = false;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting || batchLoadingRef.current || disposed) return;

        batchLoadingRef.current = true;
        setIsBatchLoading(true);
        timeoutId = window.setTimeout(() => {
          if (disposed) return;
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, photos.length));
          batchLoadingRef.current = false;
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
      disposed = true;
      batchLoadingRef.current = false;
      observer.disconnect();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [visibleCount, photos.length]);

  const handleBookmarkToggle = useCallback(
    async (photo: LightboxPhoto) => {
      const ok = await ensureSignedIn();
      if (!ok) return;

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
    [ensureSignedIn, toggleCollect]
  );

  const handleOpenCollectionModal = useCallback(
    async (photo: LightboxPhoto) => {
      const ok = await ensureSignedIn();
      if (!ok) return;

      setSelectedPhoto(photo);
      setCollectionModalOpen(true);
    },
    [ensureSignedIn]
  );

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
    <div ref={pageRef} className="min-h-screen bg-white overflow-x-hidden" style={{ willChange: "transform" }}>
      {/* Mobile white header */}
      <MobilePageHeader backgroundColor="transparent" minHeight="0px" className="flex items-center px-3 pb-5" zIndex={2147483648}>
        {/* Gradient + blur background — masked separately so text stays fully opaque */}
        <div className="absolute inset-x-0 top-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_bottom,black_60%,transparent)] [background:linear-gradient(to_bottom,rgba(0,0,0,0.62)_0%,transparent_100%)] pointer-events-none" style={{ height: "120%" }} />
        <div className="relative flex items-center justify-between w-full h-full">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-white/20 transition-colors shrink-0"
          >
            <Icon name="circle-arrow-left" size={30} className="text-white" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[22px] font-bold text-white leading-tight" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>{site?.title ?? ""}</span>
            {site?.location_free && (
              <span className="text-[13px] font-medium text-white/90 leading-tight" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{site.location_free}</span>
            )}
          </div>
          <div className="w-10" />
        </div>
      </MobilePageHeader>
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

      {/* Header — hidden on mobile, shown on desktop */}
      {loading ? (
        <div className="hidden lg:block"><HeaderSkeleton /></div>
      ) : site ? (
        <section className="hidden lg:block w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-3 sm:pt-8 pb-4">
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

                  {/* Save to List button */}
                  <button
                    type="button"
                    onClick={() => setShowWishlistModal(true)}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                      isSaved
                        ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/30"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-transparent",
                    ].join(" ")}
                    aria-label={isSaved ? "Saved to list" : "Save to list"}
                  >
                    <Icon
                      name={isSaved ? "heart" : "heart"}
                      size={14}
                      className={isSaved ? "text-[var(--brand-orange)]" : "text-gray-500"}
                    />
                    <span>{isSaved ? "Saved" : "Save"}</span>
                  </button>

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
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-3 sm:pt-8 pb-4">
          <div className="p-6 text-gray-600">Not found.</div>
        </section>
      )}

      {/* Photos grid */}
      {loading ? (
        <GridSkeleton />
      ) : (
        <section className="w-full md:max-w-7xl md:mx-auto md:px-6 lg:px-16 xl:px-24 pb-10">
          {photos.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-6 text-gray-600 mx-4">
              No photos uploaded yet for this site.
            </div>
          ) : (
            <>
              {/* ── MOBILE: editorial alternating groups of 3 ── */}
              {/* Each group: 1 tall feature + 2 square smalls side by side in two flex cols */}
              <div className="md:hidden flex flex-col gap-[2px]">
                {Array.from({ length: Math.ceil(visiblePhotos.length / 3) }).map((_, groupIdx) => {
                  const base = groupIdx * 3;
                  const group = visiblePhotos.slice(base, base + 3);
                  if (group.length === 0) return null;

                  const featureOnLeft = groupIdx % 2 === 0;
                  const feature = group[0];
                  const smalls = group.slice(1);

                  const featureEl = feature ? (
                    <div key={feature.id} className="flex-shrink-0 w-1/2">
                      <MasonryTile
                        photo={feature}
                        siteId={site!.id}
                        onOpen={(rect, thumb) => { setLightboxOrigin({ rect, thumb }); setLightboxIndex(base); }}
                        isPriority={base < TOP_PRIORITY_COUNT}
                        ensureSignedIn={ensureSignedIn}
                        variant="feature"
                      />
                    </div>
                  ) : null;

                  const smallsEl = (
                    <div key="smalls" className="flex-shrink-0 w-1/2 flex flex-col gap-[2px]">
                      {smalls.map((p, si) => (
                        <MasonryTile
                          key={p.id}
                          photo={p}
                          siteId={site!.id}
                          onOpen={(rect, thumb) => { setLightboxOrigin({ rect, thumb }); setLightboxIndex(base + 1 + si); }}
                          isPriority={base + 1 + si < TOP_PRIORITY_COUNT}
                          ensureSignedIn={ensureSignedIn}
                          variant="small"
                        />
                      ))}
                    </div>
                  );

                  return (
                    <div key={groupIdx} className="flex gap-[2px]">
                      {featureOnLeft ? <>{featureEl}{smallsEl}</> : <>{smallsEl}{featureEl}</>}
                    </div>
                  );
                })}
              </div>

              {/* ── DESKTOP: uniform grid ── */}
              <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-5 gap-4">
                {visiblePhotos.map((photo, idx) => (
                  <MasonryTile
                    key={photo.id}
                    photo={photo}
                    siteId={site!.id}
                    onOpen={(rect, thumb) => { setLightboxOrigin({ rect, thumb }); setLightboxIndex(idx); }}
                    isPriority={idx < TOP_PRIORITY_COUNT}
                    ensureSignedIn={ensureSignedIn}
                    variant="small"
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
          originRect={lightboxOrigin?.rect ?? null}
          originThumb={lightboxOrigin?.thumb ?? null}
          onClose={() => { setLightboxIndex(null); setLightboxOrigin(null); }}
          onBookmarkToggle={handleBookmarkToggle}
          onAddToCollection={handleOpenCollectionModal}
        />
      )}

      {/* Save to Wishlist Modal */}
      {showWishlistModal && site && (
        <AddToWishlistModal
          siteId={site.id}
          onClose={() => {
            setShowWishlistModal(false);
            // Re-check saved state after modal closes
            if (userId && site.id) {
              getListsContainingSite(site.id).then((lists) => {
                setIsSaved(Array.isArray(lists) && lists.length > 0);
              }).catch(() => {});
            }
          }}
          site={{
            name: site.title,
            imageUrl: circlePreview !== "/placeholder.png" ? circlePreview : undefined,
            location: site.location_free ?? undefined,
          }}
        />
      )}

      {/* Add to Collection Modal */}
      {collectionModalOpen && selectedPhoto && (
        <AddToCollectionModal
          image={{
            siteImageId: selectedPhoto.id,
            storagePath: selectedPhoto.storagePath ?? null,
            imageUrl: selectedPhoto.url ?? null,
            siteId: site?.id ?? selectedPhoto.site?.id ?? null,
            altText: selectedPhoto.caption ?? null,
            caption: selectedPhoto.caption ?? null,
            credit: selectedPhoto.author?.name ?? null,

            // ✅ ADDED: pass through site title + location for preview
            siteName: selectedPhoto.site?.name ?? site?.title ?? null,
            locationText:
              (selectedPhoto as any)?.site?.location ??
              site?.location_free ??
              null,
          }}
          onClose={() => setCollectionModalOpen(false)}
        />
      )}
    </div>
  );
}

