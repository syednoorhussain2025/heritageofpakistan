"use server";

import { createClient } from "@/lib/supabase/server";
import type { LightboxPhoto } from "@/types/lightbox";
import { getVariantPublicUrl } from "@/lib/imagevariants";

export type DiscoverPhoto = LightboxPhoto & {
  siteSlug: string;
  regionSlug: string;
};

const DISCOVER_PAGE_SIZE = 30;

/**
 * Fetches a seeded-random page of photos from across all sites.
 *
 * Requires this RPC in Supabase (run once in SQL editor):
 *
 *   create or replace function get_discover_photos(
 *     p_seed float8,
 *     p_limit int,
 *     p_offset int
 *   )
 *   returns table (
 *     id uuid, storage_path text, alt_text text, caption text,
 *     credit text, width int, height int, blur_hash text, blur_data_url text,
 *     site_id uuid, site_title text, site_slug text, site_tagline text,
 *     site_location text, site_lat float8, site_lng float8, province_slug text
 *   )
 *   language plpgsql as $$
 *   begin
 *     perform setseed(p_seed);
 *     return query
 *       select
 *         si.id, si.storage_path, si.alt_text, si.caption,
 *         si.credit, si.width, si.height, si.blur_hash, si.blur_data_url,
 *         s.id, s.title, s.slug, s.tagline,
 *         s.location_free, s.latitude, s.longitude, p.slug
 *       from site_images si
 *       join sites s on si.site_id = s.id
 *       join provinces p on s.province_id = p.id
 *       where si.storage_path is not null
 *       order by random()
 *       limit p_limit
 *       offset p_offset;
 *   end;
 *   $$;
 */
export async function fetchDiscoverPhotos(
  page: number,
  seed: number
): Promise<DiscoverPhoto[]> {
  const supabase = await createClient();
  const offset = page * DISCOVER_PAGE_SIZE;

  // setseed() expects [-1, 1]; our seed is [0, 1)
  const pgSeed = seed * 2 - 1;

  const { data, error } = await supabase.rpc("get_discover_photos", {
    p_seed: pgSeed,
    p_limit: DISCOVER_PAGE_SIZE,
    p_offset: offset,
  });

  if (error || !data) {
    // Fallback: plain random query if RPC not yet deployed
    return fetchDiscoverPhotosFallback(page);
  }

  return (data as any[])
    .filter((row) => row.storage_path)
    .map((row): DiscoverPhoto => {
      let url = "";
      try { url = getVariantPublicUrl(row.storage_path, "sm"); } catch { url = getVariantPublicUrl(row.storage_path); }

      return {
        id: row.id,
        url,
        caption: row.caption ?? row.alt_text ?? null,
        storagePath: row.storage_path,
        width: row.width ?? null,
        height: row.height ?? null,
        blurHash: row.blur_hash ?? null,
        blurDataURL: row.blur_data_url ?? null,
        siteSlug: row.site_slug,
        regionSlug: row.province_slug ?? "punjab",
        author: { name: row.credit ?? "" },
        site: {
          id: row.site_id,
          name: row.site_title,
          location: row.site_location ?? "",
          latitude: row.site_lat ?? null,
          longitude: row.site_lng ?? null,
          region: row.province_slug ?? "punjab",
          categories: [],
          tagline: row.site_tagline ?? null,
        },
      };
    });
}

/** Plain random fallback used until the RPC is deployed. */
async function fetchDiscoverPhotosFallback(page: number): Promise<DiscoverPhoto[]> {
  const supabase = await createClient();
  const offset = page * DISCOVER_PAGE_SIZE;

  const { data, error } = await supabase
    .from("site_images")
    .select(`
      id, storage_path, alt_text, caption, credit, width, height, blur_hash, blur_data_url,
      sites!inner ( id, title, slug, tagline, location_free, latitude, longitude,
        provinces!inner ( slug )
      )
    `)
    .not("storage_path", "is", null)
    .range(offset, offset + DISCOVER_PAGE_SIZE - 1);

  if (error || !data) return [];

  return (data as any[]).map((row): DiscoverPhoto => {
    const site = row.sites;
    const province = Array.isArray(site.provinces) ? site.provinces[0] : site.provinces;
    const regionSlug = province?.slug ?? "punjab";

    let url = "";
    try { url = getVariantPublicUrl(row.storage_path, "sm"); } catch { url = getVariantPublicUrl(row.storage_path); }

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
