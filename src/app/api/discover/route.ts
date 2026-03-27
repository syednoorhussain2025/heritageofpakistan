import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import type { LightboxPhoto, LightboxSite } from "@/types/lightbox";

export type DiscoverSiteInfo = LightboxSite & {
  coverPhotoUrl: string | null;
  coverSlideshowImageIds: string[] | null;
  avgRating: number | null;
  reviewCount: number | null;
  heritageType: string | null;
};

export type DiscoverPhoto = Omit<LightboxPhoto, "site"> & {
  siteSlug: string;
  regionSlug: string;
  site: DiscoverSiteInfo;
};

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page  = parseInt(searchParams.get("page")  ?? "0", 10);
  const cycle = parseInt(searchParams.get("cycle") ?? "0", 10);
  const seed  = parseInt(searchParams.get("seed")  ?? "0", 10);
  const rn    = parseInt(searchParams.get("rn")    ?? "0", 10); // ever-increasing request number

  const supabase = await createClient();

  // Fetch all sites — we'll filter to those with images after getting image counts
  const { data: allSites, error: sitesError } = await supabase
    .from("sites")
    .select("id, title, slug, tagline, location_free, latitude, longitude, province_id, cover_photo_url, cover_slideshow_image_ids, avg_rating, review_count, heritage_type")
    .limit(1000);

  if (sitesError || !allSites || allSites.length === 0) return NextResponse.json([]);

  const eligibleSites = allSites as any[];

  // Step 3: fetch all provinces to resolve slugs
  const { data: allProvinces } = await supabase
    .from("provinces")
    .select("id, slug");

  const provinceMap = new Map((allProvinces ?? []).map((p: any) => [p.id, p.slug]));

  // Step 4: deterministic shuffle by seed + cycle (unique per session + cycle)
  const shuffledSites = eligibleSites
    .map((s, i) => ({ s, order: Math.sin(i * 9301 + seed * 1979 + cycle * 49297 + 233720) }))
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
        // Pick a deterministic-but-varied image: seed + cycle + site hash
        const siteHash = site.id.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
        const pick = Math.abs(Math.sin(seed * 7919 + rn * 1327 + siteHash)) % 1;
        const row = siteImgs[Math.floor(pick * siteImgs.length)];
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
          coverPhotoUrl: site.cover_photo_url ?? null,
          coverSlideshowImageIds: site.cover_slideshow_image_ids ?? null,
          avgRating: site.avg_rating ?? null,
          reviewCount: site.review_count ?? null,
          heritageType: site.heritage_type ?? null,
        },
      } as DiscoverPhoto;
    })
    .filter(Boolean) as DiscoverPhoto[];

  return NextResponse.json(photos);
}
