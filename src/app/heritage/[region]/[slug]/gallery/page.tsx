// src/app/heritage/[region]/[slug]/gallery/page.tsx

export const dynamic = "force-static";
export const revalidate = 31536000;

import { notFound } from "next/navigation";
import GalleryClient, { SiteHeaderInfo } from "./GalleryClient";
import type { LightboxPhoto } from "@/types/lightbox";
import { createClient } from "@supabase/supabase-js";
import { getSiteGalleryPhotosForLightbox } from "@/lib/db/lightbox";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function Page({
  params,
}: {
  params: { region: string; slug: string };
}) {
  const { region, slug } = params;

  // 1. Site header from Supabase
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select(
      "id, slug, title, cover_photo_url, location_free, latitude, longitude, tagline"
    )
    .eq("slug", slug)
    .single();

  if (siteError || !site) {
    return notFound();
  }

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

  // 2. Photos via existing helper, keeps LightboxPhoto shape and categories
  const photos: LightboxPhoto[] =
    (await getSiteGalleryPhotosForLightbox(site.id, null)) ?? [];

  return (
    <GalleryClient
      region={region}
      slug={slug}
      initialSite={typedSite}
      initialPhotos={photos}
    />
  );
}
