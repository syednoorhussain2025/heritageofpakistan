// src/lib/wishlists.ts
"use client";

import { createClient } from "@/lib/supabase/browser";
import { withTimeout } from "@/lib/async/withTimeout";

const WISHLISTS_QUERY_TIMEOUT_MS = 10000;

function humanError(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function supa() {
  return createClient();
}

export async function getWishlists() {
  const supabase = supa();
  const { data: lists, error: listErr } = await withTimeout(
    supabase
      .from("wishlists")
      .select(
        "id, name, is_public, cover_image_url, notes, created_at, updated_at"
      )
      .order("created_at", { ascending: true }),
    WISHLISTS_QUERY_TIMEOUT_MS,
    "wishlists.list"
  );

  if (listErr) throw new Error(humanError(listErr));

  const baseLists = (lists ?? []) as any[];
  if (!baseLists.length) return [];

  const ids = baseLists.map((w) => w.id).filter(Boolean);
  if (!ids.length) {
    return baseLists.map((w) => ({ ...w, wishlist_items: [{ count: 0 }] }));
  }

  try {
    // One batched query is much more predictable than per-list count queries.
    const { data: itemRows, error: itemsErr } = await withTimeout(
      supabase.from("wishlist_items").select("wishlist_id").in("wishlist_id", ids),
      WISHLISTS_QUERY_TIMEOUT_MS,
      "wishlists.items"
    );

    if (itemsErr) {
      console.warn("[wishlists] item count query failed", itemsErr);
      return baseLists.map((w) => ({ ...w, wishlist_items: [{ count: 0 }] }));
    }

    const counts = new Map<string, number>();
    for (const row of (itemRows ?? []) as { wishlist_id: string }[]) {
      counts.set(row.wishlist_id, (counts.get(row.wishlist_id) ?? 0) + 1);
    }

    return baseLists.map((w) => ({
      ...w,
      wishlist_items: [{ count: counts.get(w.id) ?? 0 }],
    }));
  } catch (error) {
    console.warn("[wishlists] item count query timed out", error);
    return baseLists.map((w) => ({ ...w, wishlist_items: [{ count: 0 }] }));
  }
}

export async function createWishlist(name: string, isPublic: boolean) {
  const supabase = supa();
  const { data: sessionData, error: sessErr } =
    await supabase.auth.getSession();
  if (sessErr) throw new Error(humanError(sessErr));
  const uid = sessionData?.session?.user?.id;
  if (!uid) throw new Error("You need to sign in to create wishlists.");

  const { data, error } = await supabase
    .from("wishlists")
    .insert([{ name, is_public: isPublic, user_id: uid }])
    .select()
    .single();

  if (error) throw new Error(humanError(error));
  return data;
}

export async function addItemToWishlist(wishlistId: string, siteId: string) {
  const supabase = supa();
  const { error } = await supabase
    .from("wishlist_items")
    .upsert([{ wishlist_id: wishlistId, site_id: siteId }], {
      onConflict: "wishlist_id,site_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(humanError(error));
}

export async function removeItemFromWishlist(
  wishlistId: string,
  siteId: string
) {
  const supabase = supa();
  const { error } = await supabase
    .from("wishlist_items")
    .delete()
    .match({ wishlist_id: wishlistId, site_id: siteId });
  if (error) throw new Error(humanError(error));
}

export async function getListsContainingSite(
  siteId: string
): Promise<string[]> {
  const supabase = supa();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("wishlist_id")
    .eq("site_id", siteId);

  if (error) throw new Error(humanError(error));
  return (data ?? []).map((r: any) => r.wishlist_id);
}

export async function getWishlistItems(wishlistId: string) {
  const supabase = supa();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("id, site_id, sites(title, slug, cover_photo_url)")
    .eq("wishlist_id", wishlistId);
  if (error) throw new Error(humanError(error));
  return data ?? [];
}

export async function deleteWishlist(wishlistId: string) {
  const supabase = supa();
  const { error } = await supabase
    .from("wishlists")
    .delete()
    .eq("id", wishlistId);
  if (error) throw new Error(humanError(error));
}

/** Update cover image URL directly (used by image selector) */
export async function updateWishlistCoverURL(
  wishlistId: string,
  publicUrl: string
) {
  const supabase = supa();
  const { error } = await supabase
    .from("wishlists")
    .update({ cover_image_url: publicUrl })
    .eq("id", wishlistId);
  if (error) throw new Error(humanError(error));
}

/** Save personal notes for a wishlist */
export async function updateWishlistNotes(wishlistId: string, notes: string) {
  const supabase = supa();
  const { error } = await supabase
    .from("wishlists")
    .update({ notes })
    .eq("id", wishlistId);
  if (error) throw new Error(humanError(error));
}
