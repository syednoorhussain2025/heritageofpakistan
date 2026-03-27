import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVariantPublicUrl } from "@/lib/imagevariants";
import type { DiscoverPhoto } from "@/lib/discover-actions";

const PAGE_SIZE = 30;
// Fetch a much larger pool then shuffle — guarantees cross-site mixing
// without needing ORDER BY random() in Postgres (unsupported by Supabase JS client)
const FETCH_POOL = 300;

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

  // Fetch a large pool offset by page, then shuffle and slice
  const poolOffset = page * FETCH_POOL;

  const { data: images, error: imgError } = await supabase
    .from("site_images")
    .select("id, storage_path, alt_text, caption, credit, width, height, blur_hash, blur_data_url, site_id")
    .not("storage_path", "is", null)
    .range(poolOffset, poolOffset + FETCH_POOL - 1);

  if (imgError || !images || images.length === 0) {
    console.error("[discover] images error", imgError);
    return NextResponse.json([]);
  }

  // Collect unique site IDs and fetch their site + province data
  const siteIds = [...new Set((images as any[]).map((r) => r.site_id))];

  const { data: sites, error: siteError } = await supabase
    .from("sites")
    .select("id, title, slug, tagline, location_free, latitude, longitude, provinces!sites_province_id_fkey ( slug )")
    .in("id", siteIds);

  if (siteError) {
    console.error("[discover] sites error", siteError);
    return NextResponse.json([]);
  }

  const siteMap = new Map((sites as any[]).map((s) => [s.id, s]));

  // Shuffle the full pool, then take one PAGE_SIZE slice
  const shuffled = shuffleArray(images as any[]).slice(0, PAGE_SIZE);

  const photos: DiscoverPhoto[] = shuffled
    .map((row) => {
      const site = siteMap.get(row.site_id);
      if (!site) return null;

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
