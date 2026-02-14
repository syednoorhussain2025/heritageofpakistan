// src/lib/photoCollections.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

type ImageIdentity = {
  siteImageId?: string | null;
  storagePath?: string | null;
  imageUrl?: string | null;
  siteId?: string | null;
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;
};

function sb() {
  return createClient();
}

function errToStr(e: any) {
  if (!e) return "Unknown error";
  return e.message ?? String(e);
}

function isUniqueViolation(e: any) {
  const code = e?.code ?? "";
  const msg = String(e?.message ?? "").toLowerCase();
  return code === "23505" || msg.includes("duplicate key");
}

/** Find a collected_images.id for an image identity, or null if not saved yet */
export async function getCollectedIdByIdentity(
  img: ImageIdentity
): Promise<string | null> {
  const s = sb();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) return null;

  const orParts: string[] = [];
  if (img.siteImageId) orParts.push(`site_image_id.eq.${img.siteImageId}`);
  if (img.storagePath) orParts.push(`storage_path.eq.${img.storagePath}`);
  if (img.imageUrl) orParts.push(`image_url.eq.${img.imageUrl}`);
  if (orParts.length === 0) return null;

  const { data, error } = await s
    .from("collected_images")
    .select("id")
    .eq("user_id", user.id)
    .or(orParts.join(","))
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(errToStr(error));
  return data?.id ?? null;
}

/** Ensure an image exists in collected_images; returns collected_id */
export async function ensureCollected(img: ImageIdentity): Promise<string> {
  const s = sb();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) throw new Error("Sign in first.");

  const existing = await getCollectedIdByIdentity(img);
  if (existing) return existing;

  const { data, error } = await s
    .from("collected_images")
    .insert({
      user_id: user.id,
      site_id: img.siteId ?? null,
      site_image_id: img.siteImageId ?? null,
      storage_path: img.storagePath ?? null,
      image_url: img.imageUrl ?? null,
      alt_text: img.altText ?? null,
      caption: img.caption ?? null,
      credit: img.credit ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Another request may have inserted the same dedupe_key already.
    if (isUniqueViolation(error)) {
      const existingAfterConflict = await getCollectedIdByIdentity(img);
      if (existingAfterConflict) return existingAfterConflict;
    }
    throw new Error(errToStr(error));
  }
  return data.id as string;
}

/** List user’s photo collections (albums) with item counts when possible */
export async function listPhotoCollections() {
  const s = sb();
  const { data, error } = await s
    .from("photo_collections")
    .select("id, name, is_public, cover_collected_id, created_at");
  if (error) throw new Error(errToStr(error));

  const collections = data ?? [];

  // counts
  const withCounts = await Promise.all(
    collections.map(async (c) => {
      const { count } = await s
        .from("photo_collection_items")
        .select("id", { head: true, count: "exact" })
        .eq("collection_id", c.id);
      return { ...c, itemCount: count ?? 0 };
    })
  );

  // cover urls
  const resolved = await Promise.all(
    withCounts.map(async (c) => {
      if (!c.cover_collected_id)
        return { ...c, coverUrl: null as string | null };
      const { data: row } = await s
        .from("collected_images")
        .select("storage_path, image_url")
        .eq("id", c.cover_collected_id)
        .maybeSingle();
      if (!row) return { ...c, coverUrl: null as string | null };
      const url = row.storage_path
        ? s.storage.from("site-images").getPublicUrl(row.storage_path).data
            .publicUrl
        : row.image_url;
      return { ...c, coverUrl: url ?? null };
    })
  );

  return resolved;
}

export async function createPhotoCollection(name: string, isPublic = false) {
  const s = sb();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) throw new Error("Sign in first.");
  const { data, error } = await s
    .from("photo_collections")
    .insert({ user_id: user.id, name, is_public: isPublic })
    .select("*")
    .single();
  if (error) throw new Error(errToStr(error));
  return data;
}

export async function deletePhotoCollection(id: string) {
  const s = sb();
  const { error } = await s.from("photo_collections").delete().eq("id", id);
  if (error) throw new Error(errToStr(error));
}

/** Return Set of collection_ids that contain this image */
export async function getCollectionsMembership(
  img: ImageIdentity
): Promise<Set<string>> {
  const s = sb();
  const collectedId = await getCollectedIdByIdentity(img);
  if (!collectedId) return new Set();
  const { data, error } = await s
    .from("photo_collection_items")
    .select("collection_id")
    .eq("collected_id", collectedId);
  if (error) throw new Error(errToStr(error));
  return new Set((data ?? []).map((r: any) => r.collection_id));
}

/** Toggle membership (add/remove) for a given collection */
export async function toggleImageInCollection(
  collectionId: string,
  img: ImageIdentity,
  isMember: boolean
) {
  const s = sb();
  const {
    data: { user },
  } = await s.auth.getUser();
  if (!user) throw new Error("Sign in first.");

  if (isMember) {
    const collectedId = await getCollectedIdByIdentity(img);
    if (!collectedId) return;
    const { error } = await s
      .from("photo_collection_items")
      .delete()
      .match({ collection_id: collectionId, collected_id: collectedId });
    if (error) throw new Error(errToStr(error));
  } else {
    const collectedId = await ensureCollected(img);
    const { error } = await s
      .from("photo_collection_items")
      .insert({
        collection_id: collectionId,
        collected_id: collectedId,
        user_id: user.id,
      });
    // Treat duplicate membership as success (idempotent add).
    if (error && !isUniqueViolation(error)) throw new Error(errToStr(error));
  }
}

/** List items in a collection with resolved publicUrl (ordered by sort_order then created_at) */
export async function listCollectionItems(collectionId: string) {
  const s = sb();
  const { data, error } = await s
    .from("photo_collection_items")
    .select(
      "id, collected_id, sort_order, created_at, collected_images(storage_path, image_url, alt_text, caption, credit, site_id)"
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(errToStr(error));

  return (data ?? []).map((r: any) => {
    const ci = r.collected_images || {};
    const publicUrl = ci.storage_path
      ? s.storage.from("site-images").getPublicUrl(ci.storage_path).data
          .publicUrl
      : ci.image_url;
    return {
      id: r.id,
      collected_id: r.collected_id,
      sort_order: r.sort_order ?? null,
      site_id: ci.site_id ?? null,
      publicUrl,
      alt_text: ci.alt_text ?? null,
      caption: ci.caption ?? null,
      credit: ci.credit ?? null,
    };
  });
}

/** Persist a new order (ids array corresponds to desired visual order, 0..n) */
export async function reorderCollectionItems(
  collectionId: string,
  orderedItemIds: string[]
) {
  const s = sb();
  // batch update: one request per row (simple & reliable)
  const updates = orderedItemIds.map((id, idx) =>
    s.from("photo_collection_items").update({ sort_order: idx }).eq("id", id)
  );
  const results = await Promise.all(updates);
  const firstError = results.find((r: any) => r.error)?.error;
  if (firstError) throw new Error(errToStr(firstError));
}

/** Set collection cover using a collected_id from its items */
export async function setCollectionCover(
  collectionId: string,
  collectedId: string
) {
  const s = sb();
  const { error } = await s
    .from("photo_collections")
    .update({ cover_collected_id: collectedId })
    .eq("id", collectionId);
  if (error) throw new Error(errToStr(error));
}
