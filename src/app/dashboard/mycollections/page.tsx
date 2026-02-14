// src/app/dashboard/mycollections/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamicImport from "next/dynamic";
import Link from "next/link";
import Icon from "@/components/Icon";
import CollectHeart from "@/components/CollectHeart";
import { useCollections } from "@/components/CollectionsProvider";
import {
  listPhotoCollections,
  deletePhotoCollection,
} from "@/lib/photoCollections";
import {
  listCollections as listCollectedPhotos,
  makeCollectKeyFromRow,
} from "@/lib/collections";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { createClient } from "@/lib/supabase/browser";
import type { LightboxPhoto } from "@/types/lightbox";

const Lightbox = dynamicImport(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

const AddToCollectionModal = dynamicImport(
  () => import("@/components/AddToCollectionModal"),
  { ssr: false }
);

type Album = {
  id: string;
  name: string;
  is_public: boolean;
  coverUrl?: string | null;
  itemCount?: number;
};

type CollectedPhotoRow = {
  id: string;
  site_image_id: string | null;
  storage_path: string | null;
  image_url: string | null;
  site_id: string | null;
  alt_text: string | null;
  caption: string | null;
  credit: string | null;
  publicUrl: string | null;
};

type SiteLite = {
  id: string;
  title: string;
  location_free: string | null;
  latitude: number | null;
  longitude: number | null;
};

type DashboardLightboxPhoto = LightboxPhoto & {
  siteImageId?: string | null;
};

export default function MyCollectionsDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { collected, isLoaded: collectedLoaded } = useCollections();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<CollectedPhotoRow[]>([]);
  const [siteById, setSiteById] = useState<Record<string, SiteLite>>({});
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedPhoto, setSelectedPhoto] =
    useState<DashboardLightboxPhoto | null>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingAlbums(true);
      try {
        setAlbums(await listPhotoCollections());
      } finally {
        setLoadingAlbums(false);
      }
    })();

    (async () => {
      setLoadingPhotos(true);
      try {
        setPhotos((await listCollectedPhotos(200)) as CollectedPhotoRow[]);
      } finally {
        setLoadingPhotos(false);
      }
    })();
  }, []);

  const siteIds = useMemo(
    () =>
      Array.from(
        new Set(
          photos
            .map((p) => p.site_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      ),
    [photos]
  );

  const siteIdsKey = siteIds.join("|");

  useEffect(() => {
    let active = true;

    (async () => {
      if (!siteIds.length) {
        setSiteById({});
        return;
      }

      const { data, error } = await supabase
        .from("sites")
        .select("id, title, location_free, latitude, longitude")
        .in("id", siteIds);

      if (!active) return;
      if (error) {
        console.error("[mycollections] failed to load site metadata:", error);
        setSiteById({});
        return;
      }

      const next: Record<string, SiteLite> = {};
      for (const site of (data ?? []) as SiteLite[]) {
        next[site.id] = site;
      }
      setSiteById(next);
    })();

    return () => {
      active = false;
    };
  }, [siteIdsKey, siteIds, supabase]);

  useEffect(() => {
    if (!collectedLoaded) return;

    setPhotos((prev) =>
      prev.filter((p) => {
        try {
          const key = makeCollectKeyFromRow({
            site_image_id: p.site_image_id,
            storage_path: p.storage_path,
            image_url: p.image_url,
          });
          return collected.has(key);
        } catch {
          return false;
        }
      })
    );
  }, [collected, collectedLoaded]);

  async function deleteAlbum(id: string, name: string) {
    if (!confirm(`Delete collection "${name}"? This will not affect your library.`))
      return;

    setDeletingId(id);
    try {
      await deletePhotoCollection(id);
      setAlbums((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const openLightbox = useCallback((idx: number) => {
    setLightboxIndex(idx);
  }, []);

  const handleOpenCollectionModal = useCallback((photo: LightboxPhoto) => {
    setSelectedPhoto(photo as DashboardLightboxPhoto);
    setCollectionModalOpen(true);
  }, []);

  const tileUrl = useCallback((photo: CollectedPhotoRow) => {
    if (photo.storage_path) {
      try {
        return getVariantPublicUrl(photo.storage_path, "thumb");
      } catch {
        return photo.publicUrl || photo.image_url || "";
      }
    }
    return photo.publicUrl || photo.image_url || "";
  }, []);

  const lightboxPhotos = useMemo<DashboardLightboxPhoto[]>(
    () =>
      photos.map((p) => {
        const site = p.site_id ? siteById[p.site_id] : undefined;
        const url = p.publicUrl || p.image_url || "";

        return {
          id: p.id,
          siteImageId: p.site_image_id ?? null,
          url,
          caption: p.caption ?? p.alt_text ?? null,
          author: {
            name: p.credit || "Heritage of Pakistan",
          },
          site: {
            id: p.site_id ?? "unknown-site",
            name: site?.title ?? "Collected Photo",
            location: site?.location_free ?? "",
            latitude: site?.latitude ?? null,
            longitude: site?.longitude ?? null,
            region: "Unknown Region",
            categories: [],
          },
          isBookmarked: true,
          storagePath: p.storage_path ?? "",
        };
      }),
    [photos, siteById]
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    if (lightboxPhotos.length === 0) {
      setLightboxIndex(null);
      return;
    }
    if (lightboxIndex >= lightboxPhotos.length) {
      setLightboxIndex(lightboxPhotos.length - 1);
    }
  }, [lightboxIndex, lightboxPhotos.length]);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">My Collections</h1>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Collections</h2>
        </div>

        {loadingAlbums ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse h-28"
              />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="text-gray-600">
            You have no collections. Use Add to Collection from a photo.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {albums.map((a) => (
              <Link
                key={a.id}
                href={`/dashboard/mycollections/${a.id}`}
                className="group relative block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteAlbum(a.id, a.name);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Delete collection"
                >
                  {deletingId === a.id ? (
                    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                  ) : (
                    <Icon name="times" />
                  )}
                </button>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full ring-1 ring-black/5 flex items-center justify-center overflow-hidden bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                    {a.coverUrl ? (
                      <img
                        src={a.coverUrl}
                        alt={a.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon name="images" size={20} />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-semibold group-hover:text-[var(--brand-orange)] transition-colors">
                      {a.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {a.is_public ? "public" : "private"} • {a.itemCount ?? 0} items
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Collected Photos</h2>

        {loadingPhotos ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-gray-200 h-40 animate-pulse"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-gray-600">
            No photos yet. Tap the heart on any image to save it.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {photos.map((it, idx) => (
              <div
                key={it.id}
                className="relative group rounded-xl overflow-hidden bg-gray-100 ring-1 ring-black/5 cursor-zoom-in aspect-[4/3]"
                onClick={() => openLightbox(idx)}
                title="Open"
              >
                <img
                  src={tileUrl(it)}
                  alt={it.alt_text || ""}
                  className="w-full h-full object-cover select-none transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover:scale-110"
                  draggable={false}
                />

                <div
                  className="absolute top-2 right-2 z-20"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <CollectHeart
                    variant="overlay"
                    siteImageId={it.site_image_id}
                    storagePath={it.storage_path}
                    imageUrl={it.image_url}
                    siteId={it.site_id}
                    altText={it.alt_text}
                    caption={it.caption}
                    credit={it.credit}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <Lightbox
          photos={lightboxPhotos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onAddToCollection={handleOpenCollectionModal}
        />
      )}

      {collectionModalOpen && selectedPhoto && (
        <AddToCollectionModal
          image={{
            siteImageId: selectedPhoto.siteImageId ?? null,
            storagePath: selectedPhoto.storagePath ?? null,
            imageUrl: selectedPhoto.url ?? null,
            siteId: selectedPhoto.site?.id ?? null,
            altText: selectedPhoto.caption ?? null,
            caption: selectedPhoto.caption ?? null,
            credit: selectedPhoto.author?.name ?? null,
            siteName: selectedPhoto.site?.name ?? null,
            locationText: selectedPhoto.site?.location ?? null,
          }}
          onClose={() => setCollectionModalOpen(false)}
        />
      )}
    </div>
  );
}
