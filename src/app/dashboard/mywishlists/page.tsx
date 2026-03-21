// src/app/dashboard/mywishlists/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { deleteWishlist } from "@/lib/wishlists";
import { hapticLight, hapticHeavy } from "@/lib/haptics";
import { useSearchQ } from "../SearchContext";

type WishlistCard = {
  id: string;
  name: string;
  is_public: boolean;
  wishlist_items?: {
    count: number;
    sites?: { cover_photo_url: string | null } | null;
  }[];
};

export default function MyWishlistsPage() {
  const supabase = createClient();
  const [lists, setLists] = useState<WishlistCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const q = useSearchQ();

  async function load() {
    setLoading(true);
    try {
      // Fetch lists + count + the first item's site cover photo in one query
      const { data, error } = await supabase
        .from("wishlists")
        .select(`
          id, name, is_public,
          wishlist_items(count),
          first_item:wishlist_items(sites(cover_photo_thumb_url, cover_photo_url))
        `)
        .order("created_at", { ascending: true })
        .limit(1, { foreignTable: "first_item" });
      if (error) throw error;
      setLists((data as any[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete list "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteWishlist(id);
      setLists((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert("Could not delete list.");
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() =>
    q.trim() ? lists.filter(w => w.name.toLowerCase().includes(q.trim().toLowerCase())) : lists,
    [lists, q]
  );

  // Extract first-item cover photo from the aliased query result
  function getCoverUrl(w: any): string | null {
    const firstItem = w.first_item?.[0];
    const site = firstItem?.sites;
    return site?.cover_photo_thumb_url ?? site?.cover_photo_url ?? null;
  }

  if (loading) {
    return (
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 animate-pulse">
            <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-500 text-sm">
        No saved lists yet. Add a site to a list to get started.
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
      {filtered.map((w, i) => {
        const count = (w as any).wishlist_items?.[0]?.count ?? 0;
        const cover = getCoverUrl(w);
        return (
          <div key={w.id} className="relative">
            {/* Indented divider */}
            {i > 0 && <span className="absolute top-0 right-0 left-[68px] h-px bg-gray-100" />}
            <Link
              href={`/dashboard/mywishlists/${w.id}`}
              onClick={() => void hapticLight()}
              className="flex items-center gap-4 px-4 py-4 active:bg-gray-50 transition-colors"
            >
              {/* Circular preview from first item's cover */}
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center ring-1 ring-black/5">
                {cover ? (
                  <img src={cover} alt={w.name} className="w-full h-full object-cover" />
                ) : (
                  <Icon name="layout-list" size={18} className="text-gray-400" />
                )}
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-[#1a1a1a] truncate">{w.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {w.is_public ? "public" : "private"} · {count} {count === 1 ? "site" : "sites"}
                </div>
              </div>

              {/* Chevron */}
              <Icon name="chevron-right" size={13} className="text-[#c8c8c8] shrink-0 mr-1" />

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void hapticHeavy();
                  void handleDelete(w.id, w.name);
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 active:bg-red-50 active:text-red-500 transition-colors shrink-0"
                aria-label="Delete list"
              >
                {deletingId === w.id ? (
                  <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                ) : (
                  <Icon name="times" size={14} />
                )}
              </button>
            </Link>
          </div>
        );
      })}
    </div>

    {filtered.length === 0 && !loading && q.trim() && (
      <p className="text-center text-sm text-gray-400 py-6">No lists match "{q}"</p>
    )}
    </>
  );
}
