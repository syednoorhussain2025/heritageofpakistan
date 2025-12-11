// src/app/heritage/[region]/[slug]/gallery/page.tsx

export const dynamic = "force-static";
export const revalidate = 31536000;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GalleryClient, { SiteHeaderInfo } from "./GalleryClient";
import type { LightboxPhoto } from "@/types/lightbox";
import { createClient } from "@supabase/supabase-js";
import { getSiteGalleryPhotosForLightbox } from "@/lib/db/lightbox";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ------------------------------------------------------------------
   Professional SEO metadata for gallery page
-------------------------------------------------------------------*/
export async function generateMetadata(props: any): Promise<Metadata> {
  // ❗ FIX: Next.js 15 requires awaiting params because params is a Promise
  const { region, slug } = await props.params;

  let siteTitle = slug.replace(/-/g, " ");
  let locationFree: string | null = null;
  let tagline: string | null = null;

  try {
    const { data } = await supabase
      .from("sites")
      .select("title, location_free, tagline")
      .eq("slug", slug)
      .single();

    if (data?.title) {
      siteTitle = data.title;
    }
    locationFree = data?.location_free ?? null;
    tagline = data?.tagline ?? null;
  } catch {
    // fallback if metadata cannot be fetched
  }

  const readableRegion = region.replace(/-/g, " ");
  const pageTitle = `${siteTitle} photo gallery | Heritage of Pakistan`;

  const descriptionParts: string[] = [
    `Explore a curated gallery of high quality photographs of ${siteTitle}.`,
    locationFree
      ? `Located in ${locationFree} (${readableRegion}).`
      : `Located in ${readableRegion}.`,
    tagline ||
      "Discover architecture, landscape and cultural details through detailed images.",
  ];
  const description = descriptionParts.join(" ");

  const canonicalPath = `/heritage/${region}/${slug}/gallery`;

  // Will be handled by /socialsharingcard route
  const ogImagePath = `/heritage/${region}/${slug}/gallery/socialsharingcard`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
      maxImagePreview: "large",
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonicalPath,
      type: "website",
      siteName: "Heritage of Pakistan",
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: `${siteTitle} gallery social sharing card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImagePath],
    },
  };
}

// Do not type params here to avoid conflict with Next's generated PageProps
export default async function Page(props: any) {
  const { region, slug } = props.params as { region: string; slug: string };

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
