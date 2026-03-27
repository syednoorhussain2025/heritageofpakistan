"use server";

import { createClient } from "@/lib/supabase/server";
import type { LightboxPhoto } from "@/types/lightbox";
import { getVariantPublicUrl } from "@/lib/imagevariants";

export type DiscoverPhoto = LightboxPhoto & {
  siteSlug: string;
  regionSlug: string;
};

const PAGE_SIZE = 30;

/**
 * Fetches a random page of photos from across all sites.
 * Uses a stable session seed so pages don't repeat within a session.
 */
export async function fetchDiscoverPhotos(
  page: number,
  seed: number
): Promise<DiscoverPhoto[]> {
  const supabase = await createClient();

  const offset = page * PAGE_SIZE;

  // setseed() takes a value in [-1, 1]. We map our 0–1 seed to that range.
  const pgSeed = seed * 2 - 1;

  // Set the random seed so pagination is consistent within a session
  await supabase.rpc("set_discover_seed", { seed_val: pgSeed }).maybeSingle();

  const { data, error } = await supabase
    .from("site_images")
    .select(`
      id,
      storage_path,
      alt_text,
      caption,
      credit,
      width,
      height,
      blur_hash,
      blur_data_url,
      sites!inner (
        id,
        title,
        slug,
        tagline,
        location_free,
        latitude,
        longitude,
        provinces!inner (
          slug
        )
      )
    `)
    .order("random()" as never)
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !data) return [];

  return data
    .filter((row: any) => row.storage_path && row.sites)
    .map((row: any): DiscoverPhoto => {
      const site = row.sites;
      const province = Array.isArray(site.provinces)
        ? site.provinces[0]
        : site.provinces;
      const regionSlug = province?.slug ?? "punjab";

      let url = "";
      try {
        url = getVariantPublicUrl(row.storage_path, "sm");
      } catch {
        url = getVariantPublicUrl(row.storage_path);
      }

      return {
        id: row.id,
        url,
        caption: row.caption ?? row.alt_text ?? null,
        storagePath: row.storage_path,
        width: row.width ?? null,
        height: row.height ?? null,
        blurHash: row.blur_hash ?? null,
        blurDataURL: row.blur_data_url ?? null,
        siteSlug: site.slug,
        regionSlug,
        author: { name: row.credit ?? "" },
        site: {
          id: site.id,
          name: site.title,
          location: site.location_free ?? "",
          latitude: site.latitude ?? null,
          longitude: site.longitude ?? null,
          region: regionSlug,
          categories: [],
          tagline: site.tagline ?? null,
        },
      };
    });
}
