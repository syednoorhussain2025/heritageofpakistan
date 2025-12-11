// src/app/heritage/[region]/[slug]/gallery/page.tsx

export const dynamic = "force-static";
// Cache rendered HTML for 1 year (in seconds)
export const revalidate = 31536000;

import { notFound } from "next/navigation";
import type { LightboxPhoto } from "@/types/lightbox";
import GalleryClient from "./GalleryClient";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Plain Supabase client for server use without cookies
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type SiteHeaderInfo = {
  id: string;
  slug: string;
  title: string;
  cover_photo_url?: string | null;
  location_free?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tagline?: string | null;
};

type PageProps = {
  params: { region: string; slug: string };
};

export default async function Page({ params }: PageProps) {
  const { region, slug } = params;

  // 1. Fetch site header server side
  const {
    data: site,
    error: siteError,
  } = await supabase
    .from("sites")
    .select(
      "id, slug, title, cover_photo_url, location_free, latitude, longitude, tagline"
    )
    .eq("slug", slug)
    .single();

  if (siteError || !site) {
    return notFound();
  }

  // 2. Fetch gallery photos server side
  const { data: rows, error: photosError } = await supabase
    .from("site_images")
    .select(
      `
        id,
        storage_path,
        public_url,
        caption,
        width,
        height,
        blurhash,
        blur_data_url,
        sort_order,
        sites ( categories ),
        photo_author ( name )
      `
    )
    .eq("site_id", site.id)
    .order("sort_order", { ascending: true });

  if (photosError) {
    // Log if you have logging, but render page with empty photos
    // console.error("Failed to fetch gallery photos on server", photosError);
  }

  // 3. Map DB rows into the LightboxPhoto shape the client expects
  const initialPhotos: LightboxPhoto[] =
    rows?.map((row: any) => ({
      id: row.id,
      // Your previous client code uses `storagePath` and `url`
      storagePath: row.storage_path,
      url: row.public_url,
      caption: row.caption,
      width: row.width,
      height: row.height,
      blurHash: row.blurhash ?? null,
      blurDataURL: row.blur_data_url ?? null,
      // For categories and author badge
      site: row.sites
        ? {
            id: site.id,
            categories: row.sites.categories ?? [],
          }
        : undefined,
      author: row.photo_author
        ? {
            name: row.photo_author.name,
          }
        : undefined,
      // Bookmarks are viewer specific, so initial HTML does not include that
      isBookmarked: false,
    })) ?? [];

  const typedSite: SiteHeaderInfo = {
    id: site.id,
    slug: site.slug,
    title: site.title,
    cover_photo_url: site.cover_photo_url,
    location_free: site.location_free,
    latitude: site.latitude,
    longitude: site.longitude,
    tagline: site.tagline,
  };

  return (
    <GalleryClient
      region={region}
      slug={slug}
      initialSite={typedSite}
      initialPhotos={initialPhotos}
    />
  );
}
