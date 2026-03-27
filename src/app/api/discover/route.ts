import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import type { DiscoverPhoto } from "@/lib/discover-actions";

const PAGE_SIZE = 30;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "0", 10);

  const supabase = await createClient();

  // Step 1: get all sites
  const { data: allSites, error: sitesError } = await supabase
    .from("sites")
    .select("id, title, slug, tagline, location_free, latitude, longitude, provinces!sites_province_id_fkey ( slug )");

  if (sitesError || !allSites || allSites.length === 0) {
    return NextResponse.json([]);
  }

  // Step 2: shuffle sites, then pick PAGE_SIZE sites for this page
  const shuffledSites = shuffleArray(allSites as any[]);
  const pageSites = shuffledSites.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (pageSites.length === 0) return NextResponse.json([]);

  const pageSiteIds = pageSites.map((s: any) => s.id);

  // Step 3: for each site, pick ONE random image
  // Fetch all images for the page's sites, then pick one per site
  const { data: images, error: imgError } = await supabase
    .from("site_images")
    .select("id, storage_path, alt_text, caption, credit, width, height, blur_hash, blur_data_url, site_id")
    .in("site_id", pageSiteIds)
    .not("storage_path", "is", null);

  if (imgError || !images || images.length === 0) {
    return NextResponse.json([]);
  }

  // Group images by site, pick one random image per site
  const bySite = new Map<string, any[]>();
  for (const img of images as any[]) {
    if (!bySite.has(img.site_id)) bySite.set(img.site_id, []);
    bySite.get(img.site_id)!.push(img);
  }

  const siteMap = new Map((allSites as any[]).map((s) => [s.id, s]));

  // Build one photo per site, in the shuffled site order
  const photos: DiscoverPhoto[] = pageSites
    .map((site: any) => {
      const siteImgs = bySite.get(site.id);
      if (!siteImgs || siteImgs.length === 0) return null;

      // Pick a random image from this site
      const row = siteImgs[Math.floor(Math.random() * siteImgs.length)];
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
      } as DiscoverPhoto;
    })
    .filter(Boolean) as DiscoverPhoto[];

  return NextResponse.json(photos);
}
