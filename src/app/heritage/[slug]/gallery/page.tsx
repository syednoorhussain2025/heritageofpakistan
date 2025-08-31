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

/* ---------- Masonry (row-major) helpers ---------- */

const ROW_PX = 8; // must match auto-rows height
const GAP_PX = 16; // must match gap-4
const FALLBACK_RATIO = 4 / 3;

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
  const ratioRef = useRef(
    photo.width && photo.height && photo.width > 0 && photo.height > 0
      ? photo.width / photo.height
      : FALLBACK_RATIO
  );
  const [span, setSpan] = useState(1);

  const recompute = useCallback(() => {
    if (!wrapperRef.current) return;
    const w = wrapperRef.current.clientWidth;
    if (w <= 0) return;
    const imgH = w / ratioRef.current;
    const rows = Math.ceil((imgH + GAP_PX) / (ROW_PX + GAP_PX));
    setSpan(rows);
  }, []);

  // Reserve correct height before paint when we already know ratio
  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  // Recompute on resize
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

  return (
    <figure
      className="relative rounded-xl overflow-hidden bg-white shadow-sm cursor-zoom-in"
      style={{ gridRowEnd: `span ${span}` }}
    >
      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden group rounded-xl"
        style={{ aspectRatio: ratioRef.current }}
        onClick={onOpen}
        title="Open"
      >
        <Image
          src={photo.url}
          alt={photo.caption ?? ""}
          fill
          quality={85}
          sizes="(min-width:1536px) 18vw, (min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:768px) 33vw, (min-width:640px) 50vw, 100vw"
          className="object-cover w-full h-full transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
          loading="lazy"
          onLoadingComplete={(img) => {
            // If width/height were missing, correct ratio once and recompute
            const naturalRatio =
              img.naturalWidth / img.naturalHeight || FALLBACK_RATIO;
            if (Math.abs(naturalRatio - ratioRef.current) > 0.005) {
              ratioRef.current = naturalRatio;
              // Update aspect-ratio style immediately (no reflow flash)
              if (wrapperRef.current) {
                (wrapperRef.current.style as any).aspectRatio =
                  String(naturalRatio);
              }
              recompute();
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

      // 1) Site info for compact header
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

      // 2) Photos for universal Lightbox (include width/height if possible)
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

  // Unique categories derived from photo metadata
  const categories: string[] = useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) =>
      (p.site?.categories || []).forEach((c) => set.add(c))
    );
    return Array.from(set);
  }, [photos]);

  // Lightbox actions (bookmark toggle stays enabled)
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

  if (loading) return <div className="p-6">Loading…</div>;
  if (!site) return <div className="p-6">Not found.</div>;

  const hasGps = !!(site.latitude && site.longitude);
  const googleMapsUrl = hasGps
    ? `https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`
    : null;

  const circlePreview =
    site.cover_photo_url || photos[0]?.url || "/placeholder.png";

  return (
    <div className="min-h-screen bg-white">
      {/* Compact site header — now with clearer side padding */}
      <section className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 xl:px-24 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Circular image */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-orange-400/80 shadow-md flex-shrink-0">
            <Image
              src={circlePreview}
              alt={site.title}
              fill
              className="object-cover"
              sizes="112px"
            />
          </div>

          {/* Textual meta */}
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

      {/* 5-column masonry grid (row-major, stable while loading) */}
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
                siteId={site.id}
                onOpen={() => setLightboxIndex(idx)}
              />
            ))}
          </div>
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
          onClose={() => setCollectionModalOpen(false)}
          image={{
            siteImageId: selectedPhoto.id,
            storagePath: selectedPhoto.storagePath,
            siteId: site.id,
            altText: selectedPhoto.caption,
            caption: selectedPhoto.caption,
            credit: selectedPhoto.author?.name,
          }}
        />
      )}
    </div>
  );
}
