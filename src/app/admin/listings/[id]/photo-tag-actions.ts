// src/app/admin/listings/[id]/photo-tag-actions.ts
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

export type TagDimension = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_multi: boolean;
  ai_enabled: boolean;
  sort_order: number;
  values: TagValue[];
};

export type TagValue = {
  id: string;
  dimension_id: string;
  value: string;
  sort_order: number;
  is_active: boolean;
};

export type ImageTag = {
  id: string;
  site_image_id: string;
  dimension_id: string;
  value: string;
  source: "ai" | "manual";
  created_at: string;
};

export type TagSuggestion = {
  /** site_image real id */
  imageId: string;
  /** dimension_slug → values array (or free-text for 'specific') */
  tags: Record<string, string[]>;
};

/* ------------------------------------------------------------------ */
/* Fetch full vocabulary (dimensions + values)                         */
/* ------------------------------------------------------------------ */

export async function getTagVocabulary(): Promise<TagDimension[]> {
  const db = svc();

  const { data: dims, error: dimErr } = await db
    .from("photo_tag_dimensions")
    .select("*")
    .order("sort_order");

  if (dimErr || !dims) throw new Error(dimErr?.message ?? "Failed to fetch dimensions");

  const { data: vals, error: valErr } = await db
    .from("photo_tag_values")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (valErr || !vals) throw new Error(valErr?.message ?? "Failed to fetch tag values");

  return (dims as any[]).map((d) => ({
    ...d,
    values: (vals as any[]).filter((v) => v.dimension_id === d.id),
  })) as TagDimension[];
}

/* ------------------------------------------------------------------ */
/* Fetch tags for a set of image ids                                   */
/* ------------------------------------------------------------------ */

export async function getTagsForImages(imageIds: string[]): Promise<ImageTag[]> {
  if (!imageIds.length) return [];
  const { data, error } = await svc()
    .from("site_image_tags")
    .select("*")
    .in("site_image_id", imageIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImageTag[];
}

/* ------------------------------------------------------------------ */
/* Save AI-generated tags for a batch of images                        */
/* Replace all existing AI tags for those images                       */
/* ------------------------------------------------------------------ */

export async function saveAiTagsAction(suggestions: TagSuggestion[]): Promise<void> {
  if (!suggestions.length) return;
  const db = svc();

  // Fetch dimension id map by slug
  const { data: dims } = await db
    .from("photo_tag_dimensions")
    .select("id, slug");
  const slugToId = new Map((dims ?? []).map((d: any) => [d.slug, d.id]));

  const imageIds = suggestions.map((s) => s.imageId);

  // Delete existing AI tags for these images
  await db
    .from("site_image_tags")
    .delete()
    .in("site_image_id", imageIds)
    .eq("source", "ai");

  // Build insert rows
  const rows: any[] = [];
  for (const s of suggestions) {
    for (const [slug, values] of Object.entries(s.tags)) {
      const dimensionId = slugToId.get(slug);
      if (!dimensionId) continue;
      for (const value of values) {
        if (!value?.trim()) continue;
        rows.push({
          site_image_id: s.imageId,
          dimension_id: dimensionId,
          value: value.trim(),
          source: "ai",
        });
      }
    }
  }

  if (!rows.length) return;

  const { error } = await db.from("site_image_tags").insert(rows);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Add a single manual tag                                             */
/* ------------------------------------------------------------------ */

export async function addManualTagAction(
  siteImageId: string,
  dimensionId: string,
  value: string
): Promise<ImageTag> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Tag value cannot be empty");

  const { data, error } = await svc()
    .from("site_image_tags")
    .insert({
      site_image_id: siteImageId,
      dimension_id: dimensionId,
      value: trimmed,
      source: "manual",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ImageTag;
}

/* ------------------------------------------------------------------ */
/* Delete a single tag by id                                           */
/* ------------------------------------------------------------------ */

export async function deleteTagAction(tagId: string): Promise<void> {
  const { error } = await svc()
    .from("site_image_tags")
    .delete()
    .eq("id", tagId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Delete ALL tags for a site (all images of a site)                  */
/* ------------------------------------------------------------------ */

export async function deleteAllTagsForSiteAction(siteId: string): Promise<void> {
  const db = svc();

  // Get all image ids for the site
  const { data: images } = await db
    .from("site_images")
    .select("id")
    .eq("site_id", siteId);

  const imageIds = (images ?? []).map((r: any) => r.id);
  if (!imageIds.length) return;

  const { error } = await db
    .from("site_image_tags")
    .delete()
    .in("site_image_id", imageIds);

  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Delete all AI tags for specific images (used before re-run)        */
/* ------------------------------------------------------------------ */

export async function deleteAiTagsForImagesAction(imageIds: string[]): Promise<void> {
  if (!imageIds.length) return;
  const { error } = await svc()
    .from("site_image_tags")
    .delete()
    .in("site_image_id", imageIds)
    .eq("source", "ai");
  if (error) throw new Error(error.message);
}
