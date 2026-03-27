import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import type { LightboxPhoto } from "@/types/lightbox";

export type DiscoverPhoto = LightboxPhoto & {
  siteSlug: string;
  regionSlug: string;
};

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page  = parseInt(searchParams.get("page")  ?? "0", 10);
  const cycle = parseInt(searchParams.get("cycle") ?? "0", 10);

  const supabase = await createClient();

  // Step 1: get all site_ids that have at least one image
  const { data: siteIdsWithImages } = await supabase
    .from("site_images")
    .select("site_id")
    .not("storage_path", "is", null)
    .limit(10000);

  if (!siteIdsWithImages || siteIdsWithImages.length === 0) return NextResponse.json([]);

  const uniqueSiteIds = [...new Set((siteIdsWithImages as any[]).map((r) => r.site_id))];

  // Step 2: fetch all sites that have gallery images (by their IDs)
  const { data: allSites, error: sitesError } = await supabase
    .from("sites")
    .select("id, title, slug, tagline, location_free, latitude, longitude, province_id, cover_photo_url")
    .in("id", uniqueSiteIds)
    .limit(1000);

  if (sitesError || !allSites || allSites.length === 0) return NextResponse.json([]);

  const eligibleSites = allSites as any[];

  // Step 3: fetch all provinces to resolve slugs
  const { data: allProvinces } = await supabase
    .from("provinces")
    .select("id, slug");

  const provinceMap = new Map((allProvinces ?? []).map((p: any) => [p.id, p.slug]));

  // Step 4: deterministic shuffle by cycle
  const shuffledSites = eligibleSites
    .map((s, i) => ({ s, order: Math.sin(i * 9301 + cycle * 49297 + 233720) }))
    .sort((a, b) => a.order - b.order)
    .map(({ s }) => s);

  const pageSites = shuffledSites.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (pageSites.length === 0) return NextResponse.json([]);

  // Step 5: fetch one random image per site in this page
  const pageSiteIds = pageSites.map((s: any) => s.id);

  const { data: images, error: imgError } = await supabase
    .from("site_images")
    .select("id, storage_path, alt_text, caption, credit, width, height, blur_hash, blur_data_url, site_id")
    .in("site_id", pageSiteIds)
    .not("storage_path", "is", null);

  // images may be empty if all page sites only have cover_photo_url — that's fine, fallback handles it
  if (imgError) return NextResponse.json([]);

  // Group images by site, pick one random image per site
  const bySite = new Map<string, any[]>();
  for (const img of (images ?? []) as any[]) {
    if (!bySite.has(img.site_id)) bySite.set(img.site_id, []);
    bySite.get(img.site_id)!.push(img);
  }

  const photos: DiscoverPhoto[] = pageSites
    .map((site: any) => {
      const regionSlug = provinceMap.get(site.province_id) ?? "punjab";
      const siteImgs = bySite.get(site.id);

      let url = "";
      let id = site.id;
      let storagePath = "";
      let caption: string | null = null;
      let credit = "";
      let width: number | null = null;
      let height: number | null = null;
      let blurHash: string | null = null;
      let blurDataURL: string | null = null;

      if (siteImgs && siteImgs.length > 0) {
        // Pick a random gallery image
        const row = siteImgs[Math.floor(Math.random() * siteImgs.length)];
        id = row.id;
        storagePath = row.storage_path;
        caption = row.caption ?? row.alt_text ?? null;
        credit = row.credit ?? "";
        width = row.width ?? null;
        height = row.height ?? null;
        blurHash = row.blur_hash ?? null;
        blurDataURL = row.blur_data_url ?? null;
        try { url = getVariantPublicUrl(storagePath, "md"); } catch { url = getVariantPublicUrl(storagePath); }
      } else if (site.cover_photo_url) {
        // Fall back to cover photo
        url = site.cover_photo_url;
        blurDataURL = null;
      } else {
        return null;
      }

      return {
        id,
        url,
        caption,
        storagePath,
        width,
        height,
        blurHash,
        blurDataURL,
        siteSlug: site.slug,
        regionSlug,
        author: { name: credit },
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
      } as DiscoverPhoto;
    })
    .filter(Boolean) as DiscoverPhoto[];

  return NextResponse.json(photos);
}
