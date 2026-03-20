// src/app/dashboard/mycollections/photos/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import CollectHeart from "@/components/CollectHeart";
import { listCollections as listCollectedPhotos, makeCollectKeyFromRow } from "@/lib/collections";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { useCollections } from "@/components/CollectionsProvider";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight } from "@/lib/haptics";
import type { LightboxPhoto } from "@/types/lightbox";

const Lightbox = dynamic(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

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

export default function CollectedPhotosPage() {
  const supabase = createClient();
  const { collected, isLoaded: collectedLoaded } = useCollections();

  const [photos, setPhotos] = useState<CollectedPhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lbIndex, setLbIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setPhotos((await listCollectedPhotos(200)) as CollectedPhotoRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Sync with global collected state (removes uncollected photos reactively)
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

  const tileUrl = useCallback((photo: CollectedPhotoRow) => {
    if (photo.storage_path) {
      try { return getVariantPublicUrl(photo.storage_path, "thumb"); }
      catch { return photo.publicUrl || photo.image_url || ""; }
    }
    return photo.publicUrl || photo.image_url || "";
  }, []);

  const lightboxPhotos = useMemo<LightboxPhoto[]>(
    () =>
      photos.map((p) => ({
        id: p.id,
        url: p.publicUrl || p.image_url || "",
        caption: p.caption ?? p.alt_text ?? null,
        author: { name: p.credit || "Heritage of Pakistan" },
        site: {
          id: p.site_id ?? "unknown",
          name: "",
          location: "",
          latitude: null,
          longitude: null,
          region: "",
          categories: [],
        },
        isBookmarked: true,
        storagePath: p.storage_path ?? "",
      })),
    [photos]
  );

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm px-4">
        No collected photos yet. Tap the heart on any image to save it.
      </div>
    );
  }

  return (
    <>
      <div className="px-1 pb-2">
        <span className="text-xs text-gray-400 font-medium">
          {photos.length} {photos.length === 1 ? "photo" : "photos"}
        </span>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
        {photos.map((it, idx) => (
          <div
            key={it.id}
            className="relative aspect-square bg-gray-100 cursor-pointer group"
            onClick={() => { void hapticLight(); setLbIndex(idx); }}
          >
            <img
              src={tileUrl(it)}
              alt={it.alt_text || ""}
              className="w-full h-full object-cover select-none"
              draggable={false}
            />
            {/* Heart overlay */}
            <div
              className="absolute top-1.5 right-1.5 z-10"
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

      {lbIndex !== null && lightboxPhotos.length > 0 && (
        <Lightbox
          photos={lightboxPhotos}
          startIndex={lbIndex}
          onClose={() => setLbIndex(null)}
        />
      )}
    </>
  );
}
