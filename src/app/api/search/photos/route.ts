// src/app/api/search/photos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getVariantPublicUrl } from "@/lib/imagevariants";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSvcClient(url, key, { auth: { persistSession: false } });
}

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query  = (searchParams.get("q") ?? "").trim();
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  if (!query) return NextResponse.json([]);

  // Service role for the RPC (needs to read site_images without RLS)
  const { data, error } = await svc().rpc("search_photos", {
    query_text: query,
    page_offset: offset,
    page_limit: PAGE_SIZE,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json([]);

  // Anon client (with cookies) for sites + provinces — RLS allows public reads
  const db = await createClient();
  const siteIds = [...new Set((data as any[]).map((r: any) => r.site_id))] as string[];

  const [{ data: sites }, { data: provinces }] = await Promise.all([
    db
      .from("sites")
      .select("id, title, slug, tagline, location_free, latitude, longitude, province_id, cover_photo_url, cover_slideshow_image_ids, avg_rating, review_count, heritage_type")
      .in("id", siteIds),
    db.from("provinces").select("id, slug"),
  ]);

  const provinceMap = new Map((provinces ?? []).map((p: any) => [p.id, p.slug]));
  const siteMap = new Map((sites ?? []).map((s: any) => [s.id, s]));

  const results = (data as any[]).map((row: any) => {
    const site = siteMap.get(row.site_id);
    const provinceSlug = site ? (provinceMap.get(site.province_id) ?? "") : "";
    const thumbUrl = getVariantPublicUrl(row.storage_path, "md");

    return {
      id: row.site_image_id,
      url: thumbUrl,
      storagePath: row.storage_path,
      caption: row.caption ?? null,
      blurHash: row.blur_hash ?? null,
      blurDataURL: row.blur_data_url ?? null,
      width: row.width ?? null,
      height: row.height ?? null,
      siteSlug: site?.slug ?? "",
      regionSlug: provinceSlug,
      rank: row.rank,
      site: {
        id: row.site_id,
        name: site?.title ?? "",
        location: site?.location_free ?? row.city ?? "",
        latitude: site?.latitude ?? null,
        longitude: site?.longitude ?? null,
        region: provinceSlug,
        categories: [],
        tagline: site?.tagline ?? null,
        coverPhotoUrl: site?.cover_photo_url ?? null,
        coverSlideshowImageIds: site?.cover_slideshow_image_ids ?? null,
        avgRating: site?.avg_rating ?? null,
        reviewCount: site?.review_count ?? null,
        heritageType: site?.heritage_type ?? null,
      },
    };
  });

  return NextResponse.json(results);
}
