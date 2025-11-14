// src/app/dashboard/mywishlists/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { deleteWishlist } from "@/lib/wishlists";

type WishlistCard = {
  id: string;
  name: string;
  is_public: boolean;
  cover_image_url?: string | null;
  wishlist_items?: { count: number }[];
};

export default function MyWishlistsPage() {
  const supabase = createClient();

  const [lists, setLists] = useState<WishlistCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("wishlists")
        .select("id, name, is_public, cover_image_url, wishlist_items(count)")
        .order("created_at", { ascending: true });
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
    if (!confirm(`Delete list “${name}”? This cannot be undone.`)) return;
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

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Wishlists</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse"
            >
              <div className="w-16 h-16 rounded-full bg-gray-200 mb-4" />
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : lists.length === 0 ? (
        <div className="text-gray-600">
          You have no wishlists yet. Create one from a site using “Add to
          Wishlist”.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {lists.map((w) => {
            const count = w.wishlist_items?.[0]?.count ?? 0;
            return (
              <Link
                key={w.id}
                href={`/dashboard/mywishlists/${w.id}`}
                className="group relative block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                {/* Delete X (stop click-through) */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(w.id, w.name);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Delete list"
                  title="Delete list"
                >
                  {deletingId === w.id ? (
                    <span className="inline-block rounded-full border-2 border-gray-300 border-t-transparent animate-spin w-4 h-4" />
                  ) : (
                    <Icon name="times" />
                  )}
                </button>

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full ring-1 ring-black/5 flex items-center justify-center overflow-hidden bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                    {w.cover_image_url ? (
                      <img
                        src={w.cover_image_url}
                        alt={w.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon name="list-ul" size={20} />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-semibold group-hover:text-[var(--brand-orange)] transition-colors">
                      {w.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {w.is_public ? "public" : "private"} • {count} items
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
