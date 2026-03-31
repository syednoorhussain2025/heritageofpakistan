// src/app/admin/listings/bulk-generate-actions.ts
"use server";

import { createClient } from "@supabase/supabase-js";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type SiteImageRow = {
  id: string;
  storage_path: string;
  sort_order: number | null;
  alt_text: string | null;
  caption: string | null;
  scene_description: string | null;
};

/* ------------------------------------------------------------------ */
/* Fetch all images for a site (paginated, handles 500+ images)        */
/* ------------------------------------------------------------------ */

export async function fetchSiteImagesAction(siteId: string): Promise<SiteImageRow[]> {
  const db = svc();
  const PAGE = 1000;
  let from = 0;
  const out: SiteImageRow[] = [];

  while (true) {
    const { data, error } = await db
      .from("site_images")
      .select("id, storage_path, sort_order, alt_text, caption, scene_description")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const chunk = (data as SiteImageRow[]) || [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Save captions/alt/scene_description for a batch of images           */
/* Returns per-row errors without throwing so one bad row won't abort  */
/* ------------------------------------------------------------------ */

export async function saveCaptionsBatchAction(
  updates: {
    id: string;
    alt_text?: string;
    caption?: string;
    scene_description?: string;
  }[]
): Promise<{ errors: { id: string; message: string }[] }> {
  const db = svc();
  const errors: { id: string; message: string }[] = [];

  for (const u of updates) {
    const patch: Record<string, string> = {};
    if (u.alt_text) patch.alt_text = u.alt_text;
    if (u.caption) patch.caption = u.caption;
    if (u.scene_description) patch.scene_description = u.scene_description;
    if (!Object.keys(patch).length) continue;

    const { error } = await db
      .from("site_images")
      .update(patch)
      .eq("id", u.id);

    if (error) errors.push({ id: u.id, message: error.message });
  }

  return { errors };
}
