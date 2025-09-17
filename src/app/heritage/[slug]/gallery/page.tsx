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
import Icon from "../../../../components/Icon";
import { createClient } from "../../../../lib/supabaseClient";

// Collections
import { useCollections } from "../../../../components/CollectionsProvider";
import CollectHeart from "../../../../components/CollectHeart";
import AddToCollectionModal from "../../../../components/AddToCollectionModal";

// Universal Lightbox
import { Lightbox } from "../../../../components/ui/Lightbox";
import type { LightboxPhoto } from "../../../../types/lightbox";
import { getSiteGalleryPhotosForLightbox } from "../../../../lib/db/lightbox";
import { useAuthUserId } from "../../../../hooks/useAuthUserId";

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

/** Some backends include intrinsic dimensions on each photo; your LightboxPhoto
 * type doesn't, so we treat them as optional if present. */
type PhotoWithDims = LightboxPhoto & {
  width?: number;
  height?: number;
};

/* ---------- Masonry (row-major) helpers ---------- */

const ROW_PX = 8; // must match auto-rows value
const GAP_PX = 16; // must match gap-4
const FALLBACK_RATIO = 4 / 3;

/** Pre-measure an image off-DOM to get a stable natural ratio before we reveal it. */
function useNaturalRatio(
  src: string | undefined,
  hintRatio?: number
): { ratio: number | undefined; ready: boolean } {
  const [ratio, setRatio] = useState<number | undefined>(hintRatio);
  const [ready, setReady] = useState<boolean>(!!hintRatio);

  useEffect(() => {
    let cancelled = false;
    if (!src) return;

    // If we already have a good ratio, we consider it ready.
    if (hintRatio && hintRatio > 0) {
      setRatio(hintRatio);
      setReady(true);
      return;
    }

    const img = new window.Image();
    // Lower priority helps network contention in large grids
    (img as any).fetchPriority = "low";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0) {
        setRatio(w / h);
      } else {
        setRatio(undefined);
      }
      setReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setRatio(undefined);
      setReady(true);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, hintRatio]);

  return { ratio, ready };
}

function MasonryTile({
  photo,
  onOpen,
  siteId,
}: {
  photo: LightboxPhoto;
  onOpen: () => void;
  siteId: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [span, setSpan] = useState(1);

  // Read optional dims without breaking types
  const dims = photo as PhotoWithDims;
  const ratioFromDims =
    dims.width && dims.height && dims.width > 0 && dims.height > 0
      ? dims.width / dims.height
      : undefined;

  // Pre-measure ratio if not provided
  const { ratio: measuredRatio, ready: ratioReady } = useNaturalRatio(
    photo.url,
    ratioFromDims
  );

  // Chosen ratio: prefer provided → measured → fallback
  const chosenRatio = measuredRatio ?? ratioFromDims ?? FALLBACK_RATIO;

  const recompute = useCallback(() => {
    if (!wrapperRef.current) return;
    const w = wrapperRef.current.clientWidth;
    if (w <= 0) return;
    const imgH = w / chosenRatio;
    const rows = Math.ceil((imgH + GAP_PX) / (ROW_PX + GAP_PX));
    setSpan(rows);
  }, [chosenRatio]);

  // Compute span when ratio is known or container resizes
  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [recompute]);

  // Reveal effects
  const [visible, setVisible] = useState(false);
  const imgReadyRef = useRef(false);

  // IntersectionObserver to only fade in when scrolled into view (optional but smooth)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            // Only show when both ratio is ready & image decoded
            if (ratioReady && imgReadyRef.current) {
              setVisible(true);
            }
          }
        });
      },
      { rootMargin: "100px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ratioReady]);

  return (
    <figure
      className="relative rounded-xl overflow-hidden bg-white shadow-sm"
      style={{ gridRowEnd: `span ${span}` }}
    >
      <div
        ref={wrapperRef}
        className={`
          relative w-full overflow-hidden group rounded-xl
          transition-opacity duration-500 ease-out
          ${visible ? "opacity-100" : "opacity-0"}
        `}
        style={{ aspectRatio: String(chosenRatio) }}
        onClick={onOpen}
        title="Open"
      >
        {/* Lightweight skeleton stays until fade-in */}
        {!visible && (
          <div className="absolute inset-0 bg-gray-100 animate-pulse" />
        )}

        <Image
          src={photo.url}
          alt={photo.caption ?? ""}
          fill
          sizes="(min-width:1536px) 18vw, (min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:768px) 33vw, (min-width:640px) 50vw, 100vw"
          className="object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
          loading="lazy"
          fetchPriority="low"
          // Progressive placeholder if you store a tiny preview; safe fallback otherwise
          placeholder={(photo as any).blurDataURL ? "blur" : "empty"}
          blurDataURL={(photo as any).blurDataURL || undefined}
          onLoad={async (e) => {
            // Ensure bitmap is decoded before we reveal
            try {
              const el = e.currentTarget as HTMLImageElement;
              if ("decode" in el) {
                await (el as any).decode?.();
              }
            } catch {
              /* ignore */
            } finally {
              imgReadyRef.current = true;
              if (ratioReady) setVisible(true);
            }
          }}
        />

        {/* Bookmark heart overlay (click doesn’t open lightbox) */}
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

/** Compact header skeleton with wider tagline loader */
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
          {/* Tagline: widened to better match real content */}
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

/** Simple, uniform grid skeleton for photos (no masonry imitation) */
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
  const params = useParams();
  const slug = (params.slug as string) ?? "";
  const { userId: viewerId } = useAuthUserId();
  const { toggleCollect } = useCollections();
  const supabase = createClient();

  const [site, setSite] = useState<SiteHeaderInfo | null>(null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]);
  const [loading, setLoading] = useState(true);

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

      // Photos for Lightbox (dims may or may not be present)
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

  const categories: string[] = useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) =>
      (p.site?.categories || []).forEach((c) => set.add(c))
    );
    return Array.from(set);
  }, [photos]);

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
      {/* Header: skeleton while loading, content when ready */}
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
                // Above-the-fold avatar: prioritize for better LCP
                priority
                // Optional progressive placeholder if stored
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

      {/* Photos grid: SIMPLE grid skeleton while loading; masonry when ready */}
      {loading ? (
        <GridSkeleton />
      ) : (
        <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pb-10">
          {photos.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-6 text-gray-600">
              No photos uploaded yet for this site.
            </div>
          ) : (
            <div
              className="
                grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4
                auto-rows-[8px] grid-flow-row
              "
            >
              {photos.map((photo, idx) => (
                <MasonryTile
                  key={photo.id}
                  photo={photo}
                  siteId={site!.id}
                  onOpen={() => setLightboxIndex(idx)}
                />
              ))}
            </div>
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
          onClose={() => setCollectionModalOpen(false)}
          image={{
            siteImageId: selectedPhoto.id,
            storagePath: selectedPhoto.storagePath,
            siteId: site!.id,
            altText: selectedPhoto.caption,
            caption: selectedPhoto.caption,
            credit: selectedPhoto.author?.name,
          }}
        />
      )}
    </div>
  );
}
