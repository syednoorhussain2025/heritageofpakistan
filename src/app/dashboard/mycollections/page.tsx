// src/app/dashboard/mycollections/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { listPhotoCollections, deletePhotoCollection } from "@/lib/photoCollections";
import { createClient } from "@/lib/supabase/browser";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import { hapticLight, hapticHeavy, hapticMedium } from "@/lib/haptics";

type Album = {
  id: string;
  name: string;
  is_public: boolean;
  coverUrl?: string | null;
  itemCount?: number;
  // first item thumb fetched separately
  firstPhotoUrl?: string | null;
};

export default function MyCollectionsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cols = await listPhotoCollections();
        // For each album, fetch the first photo to use as preview
        const withPreviews = await Promise.all(
          cols.map(async (c) => {
            // Try cover first
            if (c.coverUrl) return { ...c, firstPhotoUrl: c.coverUrl };
            // Otherwise fetch first item's storage_path
            const { data } = await supabase
              .from("photo_collection_items")
              .select("collected_images(storage_path, image_url)")
              .eq("collection_id", c.id)
              .order("sort_order", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const ci = (data as any)?.collected_images;
            if (!ci) return { ...c, firstPhotoUrl: null };
            const url = ci.storage_path
              ? (() => { try { return getVariantPublicUrl(ci.storage_path, "thumb"); } catch { return supabase.storage.from("site-images").getPublicUrl(ci.storage_path).data.publicUrl; } })()
              : ci.image_url ?? null;
            return { ...c, firstPhotoUrl: url };
          })
        );
        setAlbums(withPreviews);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete collection "${name}"? This will not affect your library.`)) return;
    setDeletingId(id);
    try {
      await deletePhotoCollection(id);
      setAlbums((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Album list */}
      {loading ? (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
              <div className="w-14 h-14 rounded-xl bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : albums.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-500 text-sm">
          No collections yet. Use "Add to Collection" from any photo.
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          {albums.map((a, i) => (
            <div key={a.id} className="relative">
              {i > 0 && <span className="absolute top-0 right-0 left-[68px] h-px bg-gray-100" />}
              <Link
                href={`/dashboard/mycollections/${a.id}`}
                onTouchStart={() => void hapticLight()}
                className="flex items-center gap-4 px-4 py-4 active:bg-gray-50 transition-colors"
              >
                {/* Square rounded preview with camera badge */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 ring-1 ring-black/5">
                  {a.firstPhotoUrl ? (
                    <img src={a.firstPhotoUrl} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Icon name="images" size={20} />
                    </div>
                  )}
                  {/* Camera badge top-right */}
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                    <Icon name="camera" size={9} className="text-white" />
                  </div>
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-[#1a1a1a] truncate">{a.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.is_public ? "public" : "private"} · {a.itemCount ?? 0} {(a.itemCount ?? 0) === 1 ? "photo" : "photos"}
                  </div>
                </div>

                {/* Chevron */}
                <Icon name="chevron-right" size={13} className="text-[#c8c8c8] shrink-0 mr-1" />

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void hapticHeavy();
                    void handleDelete(a.id, a.name);
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 active:bg-red-50 active:text-red-500 transition-colors shrink-0"
                  aria-label="Delete collection"
                >
                  {deletingId === a.id ? (
                    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                  ) : (
                    <Icon name="times" size={14} />
                  )}
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Fixed "See all Collected Photos" button */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[500] bg-white border-t border-gray-100 px-4 py-3"
        style={{ paddingBottom: "calc(52px + var(--safe-bottom, 0px) + 12px)" }}>
        <button
          type="button"
          onClick={() => { void hapticMedium(); router.push("/dashboard/mycollections/photos"); }}
          className="w-full rounded-full py-3.5 font-bold text-white active:opacity-80 transition"
          style={{ backgroundColor: "#00b78b" }}
        >
          See all Collected Photos
        </button>
      </div>
      {/* Desktop link */}
      <div className="hidden lg:block pt-4">
        <Link
          href="/dashboard/mycollections/photos"
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white active:opacity-80"
          style={{ backgroundColor: "#00b78b" }}
        >
          <Icon name="images" size={16} />
          See all Collected Photos
        </Link>
      </div>
    </>
  );
}
