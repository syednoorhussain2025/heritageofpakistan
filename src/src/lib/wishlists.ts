// src/lib/wishlists.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

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
  const res = await supabase
    .from("wishlists")
    .select(
      "id, name, is_public, cover_image_url, notes, created_at, updated_at, wishlist_items(count)"
    )
    .order("created_at", { ascending: true });

  if (!res.error && res.data) return res.data;

  const flat = await supabase
    .from("wishlists")
    .select(
      "id, name, is_public, cover_image_url, notes, created_at, updated_at"
    )
    .order("created_at", { ascending: true });

  if (flat.error) throw new Error(humanError(flat.error));
  const lists = flat.data ?? [];

  const withCounts = await Promise.all(
    lists.map(async (w) => {
      const { count, error } = await supabase
        .from("wishlist_items")
        .select("id", { head: true, count: "exact" })
        .eq("wishlist_id", w.id);
      if (error) console.warn("[wishlist_items count]", error);
      return { ...w, wishlist_items: [{ count: count ?? 0 }] };
    })
  );

  return withCounts;
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
