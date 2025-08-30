// src/lib/collections.ts
"use client";

import { createClient } from "@/lib/supabase/browser";

/** What uniquely identifies a photo for a user */
export type CollectInput = {
  siteImageId?: string; // id from site_images (preferred when available)
  storagePath?: string; // path inside "site-images" bucket
  imageUrl?: string; // absolute URL fallback (rare)
};

export function makeCollectKey(input: CollectInput) {
  // Deterministic, stable key across the app
  return [
    input.siteImageId ? `id:${input.siteImageId}` : "",
    input.storagePath ? `sp:${input.storagePath}` : "",
    input.imageUrl ? `url:${input.imageUrl}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

/** Return the current user id or throw */
async function requireUserId(supabase = createClient()) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/** Idempotent insert: succeeds even if the row already exists */
export async function ensureCollected(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  const collect_key = makeCollectKey(input);

  // Use UPSERT so duplicate attempts don't error.
  // Unique index should be on (user_id, collect_key).
  const { error } = await supabase.from("collected_images").upsert(
    {
      user_id,
      collect_key,
      site_image_id: input.siteImageId ?? null,
      storage_path: input.storagePath ?? null,
      image_url: input.imageUrl ?? null,
    },
    {
      onConflict: "user_id,collect_key",
      ignoreDuplicates: true, // do nothing if it already exists
    }
  );

  // If database still throws a duplicate (23505), treat it as success
  if (error && (error as any).code !== "23505") {
    throw error;
  }

  const { data: row } = await supabase
    .from("collected_images")
    .select("*")
    .eq("user_id", user_id)
    .eq("collect_key", collect_key)
    .maybeSingle();

  return row;
}

/** Remove from the user's library by key */
export async function removeFromCollection(collectKey: string) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  await supabase
    .from("collected_images")
    .delete()
    .match({ user_id, collect_key: collectKey });
}

/** Quick existence check */
export async function isCollected(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  const collect_key = makeCollectKey(input);
  const { data } = await supabase
    .from("collected_images")
    .select("id")
    .eq("user_id", user_id)
    .eq("collect_key", collect_key)
    .maybeSingle();
  return !!data;
}

/** Toggle helper used by gallery / lightbox */
export async function toggleImageInCollection(input: CollectInput) {
  const supabase = createClient();
  const user_id = await requireUserId(supabase);
  const collect_key = makeCollectKey(input);

  const { data: existing } = await supabase
    .from("collected_images")
    .select("id")
    .eq("user_id", user_id)
    .eq("collect_key", collect_key)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("collected_images")
      .delete()
      .match({ user_id, collect_key });
    return { status: "removed" as const };
  } else {
    await ensureCollected(input); // idempotent
    return { status: "added" as const };
  }
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
        publicUrl = supabase.storage
          .from("site-images")
          .getPublicUrl(r.storage_path).data.publicUrl;
      } else if (r.image_url) {
        publicUrl = r.image_url;
      }
      return { ...r, publicUrl };
    })
  );
}

/** Helper for a unique key when you already have a row */
export function makeCollectKeyFromRow(row: {
  site_image_id?: string | null;
  storage_path?: string | null;
  image_url?: string | null;
}) {
  return makeCollectKey({
    siteImageId: row.site_image_id ?? undefined,
    storagePath: row.storage_path ?? undefined,
    imageUrl: row.image_url ?? undefined,
  });
}
