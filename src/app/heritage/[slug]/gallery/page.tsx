"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { createClient } from "../../../../lib/supabaseClient";

// Your existing, working collection components
import { useCollections } from "../../../../components/CollectionsProvider";
import CollectHeart from "../../../../components/CollectHeart";
import AddToCollectionModal from "../../../../components/AddToCollectionModal";

// --- The New Universal Lightbox System ---
import { Lightbox } from "../../../../components/ui/Lightbox";
import { LightboxPhoto } from "../../../../types/lightbox";
import { getSiteGalleryPhotosForLightbox } from "../../../../lib/db/lightbox";
import { useAuthUserId } from "../../../../hooks/useAuthUserId";

// A simpler type for just the page header
type SiteHeaderInfo = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
};

export default function SiteGalleryPage() {
  const params = useParams();
  const slug = (params.slug as string) ?? "";
  const { userId: viewerId } = useAuthUserId(); // The person viewing the page
  const { toggleCollect } = useCollections(); // The global collection handler
  const supabase = createClient();

  const [site, setSite] = useState<SiteHeaderInfo | null>(null);
  const [photos, setPhotos] = useState<LightboxPhoto[]>([]); // Use the universal type
  const [loading, setLoading] = useState(true);

  // --- State for Modals ---
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<LightboxPhoto | null>(
    null
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // 1. Fetch basic site info for the header
      const { data: siteData } = await supabase
        .from("sites")
        .select("id, slug, title, cover_photo_url")
        .eq("slug", slug)
        .single();
      if (!siteData) throw new Error("Site not found.");
      setSite(siteData);

      // 2. Use our new data fetcher to get perfectly formatted lightbox photos
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
    if (slug) {
      loadData();
    }
  }, [slug, loadData]);

  // --- Handlers for Lightbox Actions ---

  // Toggles the "heart" icon by calling the global context function
  const handleBookmarkToggle = useCallback(
    async (photo: LightboxPhoto) => {
      if (!viewerId) return alert("Please sign in to save photos.");

      // We call the global toggleCollect, which handles optimistic UI and toasts
      await toggleCollect({
        siteImageId: photo.id,
        storagePath: photo.storagePath,
      });

      // We also update our local state to match, so the lightbox UI is in sync
      setPhotos((currentPhotos) =>
        currentPhotos.map((p) =>
          p.id === photo.id ? { ...p, isBookmarked: !p.isBookmarked } : p
        )
      );
    },
    [viewerId, toggleCollect]
  );

  // Opens the "Add to Collection" modal
  const handleOpenCollectionModal = useCallback((photo: LightboxPhoto) => {
    setSelectedPhoto(photo);
    setCollectionModalOpen(true);
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!site) return <div className="p-6">Not found.</div>;

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* Header (unchanged) */}
      <div className="relative w-full h-64 md:h-80">
        {site.cover_photo_url ? (
          <Image
            src={site.cover_photo_url}
            alt={site.title}
            layout="fill"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-7xl mx-auto px-4 pb-4 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-white text-2xl md:text-3xl font-bold">
              Photo Gallery — {site.title}
            </h1>
            <Link
              href={`/heritage/${site.slug}`}
              className="inline-block px-4 py-2 rounded-lg bg-white text-black text-sm font-medium"
            >
              ← Back to main article
            </Link>
          </div>
        </div>
      </div>

      {/* Masonry grid (now uses `LightboxPhoto[]`) */}
      <div className="w-full max-w-7xl mx-auto px-4 py-6">
        {photos.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-gray-600">
            No photos uploaded yet for this site.
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
            {photos.map((photo, idx) => (
              <figure
                key={photo.id}
                className="relative mb-4 break-inside-avoid rounded-xl shadow-sm bg-white overflow-hidden cursor-pointer group"
                onClick={() => setLightboxIndex(idx)}
                title="Open"
              >
                <Image
                  src={photo.url}
                  alt={photo.caption || ""}
                  width={500}
                  height={500}
                  className="w-full h-auto object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <CollectHeart
                  variant="overlay"
                  siteImageId={photo.id}
                  storagePath={photo.storagePath}
                  siteId={site.id}
                  caption={photo.caption}
                  credit={photo.author.name}
                />
              </figure>
            ))}
          </div>
        )}
      </div>

      {/* --- The NEW, Universal Lightbox --- */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          // Only provide the action handlers if a user is logged in
          onBookmarkToggle={viewerId ? handleBookmarkToggle : undefined}
          onAddToCollection={viewerId ? handleOpenCollectionModal : undefined}
        />
      )}

      {/* "Add to Collection" Modal (unchanged logic) */}
      {collectionModalOpen && selectedPhoto && (
        <AddToCollectionModal
          onClose={() => setCollectionModalOpen(false)}
          image={{
            siteImageId: selectedPhoto.id,
            storagePath: selectedPhoto.storagePath,
            siteId: selectedPhoto.site.id,
            altText: selectedPhoto.caption,
            caption: selectedPhoto.caption,
            credit: selectedPhoto.author.name,
          }}
        />
      )}
    </div>
  );
}
