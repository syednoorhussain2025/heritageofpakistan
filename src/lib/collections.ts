// src/lib/collections.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

/** What uniquely identifies a photo for a user */
export type CollectInput = {
  siteImageId?: string; // UUID from site_images (preferred)
  storagePath?: string; // Supabase storage path
  imageUrl?: string; // Absolute URL fallback
  siteId?: string; // optional, for metadata
  altText?: string | null;
  caption?: string | null;
  credit?: string | null;
};

/** Mirrors the DB generated column: coalesce(site_image_id::text, storage_path, image_url) */
export function computeDedupeKey(input: CollectInput): string {
  if (input.siteImageId && input.siteImageId.trim())
    return input.siteImageId.trim();
  if (input.storagePath && input.storagePath.trim())
    return input.storagePath.trim();
  if (input.imageUrl && input.imageUrl.trim()) return input.imageUrl.trim();
  throw new Error(
    "computeDedupeKey: provide at least one of siteImageId, storagePath, or imageUrl"
  );
}

/** Return the current user id or throw */
async function requireUserId(supabase = createClient()) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/** Server-side idempotent toggle via RPC (recommended) */
async function rpcToggle(input: CollectInput): Promise<"added" | "removed"> {
  const supabase = createClient();
  // The RPC uses auth.uid() internally; no user_id needs to be sent.
  const { data, error } = await supabase.rpc("toggle_collect_image", {
    p_site_image_id: input.siteImageId ?? null,
    p_storage_path: input.storagePath ?? null,
    p_image_url: input.imageUrl ?? null,
    p_site_id: input.siteId ?? null,
    p_alt_text: input.altText ?? null,
    p_caption: input.caption ?? null,
    p_credit: input.credit ?? null,
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message ?? "Toggle failed");
  return data.mode === "removed" ? "removed" : "added";
}

/** Idempotent insert (ensure "collected"); uses UPSERT on (user_id, dedupe_key) */
export async function ensureCollected(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  // Insert; dedupe_key is generated on the server; conflict target includes dedupe_key
  const { error } = await supabase.from("collected_images").upsert(
    {
      user_id,
      site_image_id: input.siteImageId ?? null,
      storage_path: input.storagePath ?? null,
      image_url: input.imageUrl ?? null,
      site_id: input.siteId ?? null,
      alt_text: input.altText ?? null,
      caption: input.caption ?? null,
      credit: input.credit ?? null,
    },
    {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
      // merge: true is default; we only care that duplicate upserts don't throw
    }
  );
  if (error) throw error;

  const dedupe_key = computeDedupeKey(input);
  const { data: row, error: selErr } = await supabase
    .from("collected_images")
    .select("*")
    .eq("user_id", user_id)
    .eq("dedupe_key", dedupe_key)
    .maybeSingle();

  if (selErr) throw selErr;
  return row;
}

/** Remove from the user's library by dedupe_key */
export async function removeFromCollection(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  const dedupe_key = computeDedupeKey(input);
  const { error } = await supabase
    .from("collected_images")
    .delete()
    .match({ user_id })
    .eq("dedupe_key", dedupe_key);
  if (error) throw error;
}

/** Quick existence check */
export async function isCollected(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  const dedupe_key = computeDedupeKey(input);
  const { data, error } = await supabase
    .from("collected_images")
    .select("id")
    .eq("user_id", user_id)
    .eq("dedupe_key", dedupe_key)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error; // ignore "Results contain 0 rows" style codes
  return !!data;
}

/** Toggle helper used by gallery / lightbox; returns { status: 'added' | 'removed' } */
export async function toggleImageInCollection(input: CollectInput) {
  await requireUserId(); // enforces sign-in early for clear UX
  const mode = await rpcToggle(input);
  return { status: mode };
}

/** List the user's collected photos (library) with publicUrl resolved */
export async function listCollections(limit = 200) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("collected_images")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return Promise.all(
    (data || []).map(async (r: any) => {
      let publicUrl: string | null = null;
      if (r.storage_path) {
        publicUrl =
          supabase.storage.from("site-images").getPublicUrl(r.storage_path).data
            .publicUrl ?? null;
      } else if (r.image_url) {
        publicUrl = r.image_url;
      }
      return { ...r, publicUrl };
    })
  );
}

/** For callers that previously relied on a computed key */
export function makeCollectKeyFromRow(row: {
  site_image_id?: string | null;
  storage_path?: string | null;
  image_url?: string | null;
}) {
  return computeDedupeKey({
    siteImageId: row.site_image_id ?? undefined,
    storagePath: row.storage_path ?? undefined,
    imageUrl: row.image_url ?? undefined,
  });
}
