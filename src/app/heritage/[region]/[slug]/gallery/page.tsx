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
  const { region, slug } = await props.params;

  let siteTitle = slug.replace(/-/g, " ");
  let locationFree: string | null = null;
  let tagline: string | null = null;

  // ✅ NEW: Use pre-generated cover thumb for OG image (fallback to cover_photo_url, then default)
  let coverPhotoThumbUrl: string | null = null;
  let coverPhotoUrl: string | null = null;

  try {
    const { data } = await supabase
      .from("sites")
      .select("title, location_free, tagline, cover_photo_thumb_url, cover_photo_url")
      .eq("slug", slug)
      .single();

    if (data?.title) siteTitle = data.title;
    locationFree = data?.location_free ?? null;
    tagline = data?.tagline ?? null;

    coverPhotoThumbUrl = (data as any)?.cover_photo_thumb_url ?? null;
    coverPhotoUrl = (data as any)?.cover_photo_url ?? null;
  } catch {}

  const readableRegion = region.replace(/-/g, " ");
  const pageTitle = `${siteTitle} High Res Photo Gallery | Heritage of Pakistan`;

  const descriptionParts = [
    `Explore a curated gallery of high quality photographs of ${siteTitle}.`,
    locationFree
      ? `Located in ${locationFree} (${readableRegion}).`
      : `Located in ${readableRegion}.`,
    tagline ||
      "Discover architecture, landscape and cultural details through detailed images.",
  ];

  const description = descriptionParts.join(" ");

  // ✅ Base- URL -(prod via NEXT_PUBLIC_SITE_URL, preview via VERCEL_URL, dev via localhost)
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const canonicalPath = `${siteBase}/heritage/${region}/${slug}/gallery`;

  // ✅ NEW: Prefer stored thumb for OG image
  const ogImageUrl =
    coverPhotoThumbUrl || coverPhotoUrl || `${siteBase}/og-default.jpg`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonicalPath,
      type: "website",
      siteName: "Heritage of Pakistan",
      images: [
        {
          url: ogImageUrl,
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
      images: [ogImageUrl],
    },
  };
}

/* ------------------------------------------------------------------
   PAGE (SERVER COMPONENT)
-------------------------------------------------------------------*/

export default async function Page(props: any) {
  const { region, slug } = (await props.params) as {
    region: string;
    slug: string;
  };

  // ✅ Base URL (same logic as metadata)
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  // Fetch site info
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select(
      "id, slug, title, cover_photo_url, location_free, latitude, longitude, tagline"
    )
    .eq("slug", slug)
    .single();

  if (siteError || !site) return notFound();

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

  // photos
  const photos: LightboxPhoto[] =
    (await getSiteGalleryPhotosForLightbox(site.id, null)) ?? [];

  /* ------------------------------------------------------------------
     ⭐ SERVER-RENDERED JSON-LD (Best SEO Practice)s
  -------------------------------------------------------------------*/

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: `${site.title} Photo Gallery`,
    description:
      site.tagline ||
      `A curated gallery of high quality photographs of ${site.title}.`,
    url: `${siteBase}/heritage/${region}/${slug}/gallery`,
    about: {
      "@type": "Place",
      name: site.title,
      address: site.location_free || undefined,
      geo:
        site.latitude && site.longitude
          ? {
              "@type": "GeoCoordinates",
              latitude: site.latitude,
              longitude: site.longitude,
            }
          : undefined,
    },
    image: photos.map((p) => ({
      "@type": "ImageObject",
      contentUrl: p.url,
      caption: p.caption || `${site.title} photo`,
    })),
  };

  return (
    <>
      {/* ★ SSR JSON-LD (Google Preferred) ★ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <GalleryClient
        region={region}
        slug={slug}
        initialSite={typedSite}
        initialPhotos={photos}
      />
    </>
  );
}
