import { createClient } from "../supabaseClient";
import { LightboxPhoto } from "../../types/lightbox";
import { storagePublicUrl } from "../image/storagePublicUrl";

/**
 * Fetches and transforms official site gallery photos into the universal
 * LightboxPhoto format.
 */
export async function getSiteGalleryPhotosForLightbox(
  siteId: string,
  viewerId?: string | null
): Promise<LightboxPhoto[]> {
  const supabase = createClient();

  // 1. Fetch all required data in parallel
  const [siteRes, imagesRes, regionRes, categoryRes, bookmarkRes] =
    await Promise.all([
      supabase
        .from("sites")
        .select(
          // Added tagline to the selection
          "id, title, location_free, latitude, longitude, architectural_style, tagline"
        )
        .eq("id", siteId)
        .single(),
      supabase
        .from("site_images")
        .select("id, storage_path, caption, credit")
        .eq("site_id", siteId)
        .order("sort_order"),
      supabase
        .from("site_regions")
        .select("region:regions (name)")
        .eq("site_id", siteId),
      supabase
        .from("site_categories")
        .select("category:categories (name)")
        .eq("site_id", siteId),
      viewerId
        ? supabase
            .from("collected_images")
            .select("storage_path")
            .eq("user_id", viewerId)
        : Promise.resolve({ data: [] as { storage_path: string }[] }),
    ]);

  if (siteRes.error || !siteRes.data) throw new Error("Site not found.");
  if (imagesRes.error) throw imagesRes.error;

  const site = siteRes.data;
  const images = imagesRes.data || [];
  const bookmarkedPaths = new Set(
    (bookmarkRes.data
      ?.map((b: { storage_path: string }) => b.storage_path)
      .filter(Boolean) as string[]) ?? []
  );

  const siteRegion =
    (regionRes.data?.[0]?.region as any)?.name ?? "Unknown Region";

  // Safely extract category names
  const siteCategories =
    (categoryRes.data
      ?.map((c: any) => (c.category as any)?.name)
      .filter(Boolean) as string[]) ?? [];

  // 2. Map the raw database data into the clean, universal LightboxPhoto shape
  return images.map((img) => ({
    id: img.id,
    url: storagePublicUrl("site-images", img.storage_path),
    caption: img.caption,
    author: {
      name: img.credit || "Heritage of Pakistan",
    },
    site: {
      id: site.id,
      name: site.title,
      location: site.location_free ?? "Unknown Location",
      latitude: site.latitude,
      longitude: site.longitude,
      region: siteRegion,
      categories: siteCategories,
      architecturalStyle: site.architectural_style,
      // ✅ Include the tagline from the sites table
      tagline: site.tagline ?? null,
    },
    isBookmarked: bookmarkedPaths.has(img.storage_path),
    storagePath: img.storage_path,
  }));
}
