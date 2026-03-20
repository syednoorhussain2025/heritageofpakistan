// src/app/dashboard/mycollections/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Icon from "@/components/Icon";
import { listCollectionItems } from "@/lib/photoCollections";
import { createClient } from "@/lib/supabase/browser";
import { hapticLight, hapticHeavy } from "@/lib/haptics";
import type { LightboxPhoto } from "@/types/lightbox";

const Lightbox = dynamic(
  () => import("@/components/ui/Lightbox").then((m) => m.Lightbox),
  { ssr: false }
);

type CollectionItem = {
  id: string;
  collected_id: string;
  publicUrl: string | null;
  alt_text: string | null;
  caption: string | null;
  credit: string | null;
  site_id: string | null;
};

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
      ))}
    </div>
  );
}

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [lbIndex, setLbIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: c } = await supabase
          .from("photo_collections")
          .select("name")
          .eq("id", id)
          .maybeSingle();
        setName(c?.name ?? "Collection");
        setItems(await listCollectionItems(id));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function removeItem(itemId: string) {
    void hapticHeavy();
    setRemovingId(itemId);
    try {
      await supabase.from("photo_collection_items").delete().eq("id", itemId);
      setItems((prev) => prev.filter((x) => x.id !== itemId));
    } finally {
      setRemovingId(null);
    }
  }

  const openLightbox = useCallback((idx: number) => {
    void hapticLight();
    setLbIndex(idx);
  }, []);

  const lightboxPhotos: LightboxPhoto[] = items.map((it) => ({
    id: it.id,
    url: it.publicUrl ?? "",
    caption: it.caption ?? it.alt_text ?? null,
    author: { name: it.credit ?? "Heritage of Pakistan" },
    site: {
      id: it.site_id ?? "unknown",
      name: "",
      location: "",
      latitude: null,
      longitude: null,
      region: "",
      categories: [],
    },
    isBookmarked: false,
    storagePath: "",
  }));

  if (loading) return <GridSkeleton />;

  return (
    <>
      {/* Item count */}
      <div className="px-1 pb-2">
        <span className="text-xs text-gray-400 font-medium">
          {items.length} {items.length === 1 ? "photo" : "photos"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          No photos in this collection yet.
        </div>
      ) : (
        /* Instagram-style 3-column grid */
        <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
          {items.map((it, idx) => (
            <div
              key={it.id}
              className="relative aspect-square bg-gray-100 cursor-pointer group"
              onClick={() => openLightbox(idx)}
            >
              {it.publicUrl ? (
                <img
                  src={it.publicUrl}
                  alt={it.alt_text ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Icon name="image" size={24} />
                </div>
              )}

              {/* Red trash — shown on tap overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeItem(it.id);
                }}
                disabled={removingId === it.id}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-red-400 active:bg-red-600 active:text-white transition-colors disabled:opacity-50"
                aria-label="Remove photo"
              >
                {removingId === it.id ? (
                  <span className="inline-block rounded-full border-2 border-white border-t-transparent animate-spin w-3 h-3" />
                ) : (
                  <Icon name="trash" size={11} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
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
