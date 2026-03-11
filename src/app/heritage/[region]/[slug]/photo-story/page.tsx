// src/app/heritage/[region]/[slug]/photo-story/page.tsx
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PhotoStoryClient from "./PhotoStoryClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

export async function generateMetadata(props: any): Promise<Metadata> {
  const { region, slug } = await props.params;

  let siteTitle = slug.replace(/-/g, " ");
  let tagline: string | null = null;
  let heroPhotoUrl: string | null = null;

  try {
    const { data: site } = await supabase
      .from("sites")
      .select("id, title, tagline, cover_photo_url")
      .eq("slug", slug)
      .single();

    if (site?.title) siteTitle = site.title;
    tagline = site?.tagline ?? null;

    if (site?.id) {
      const { data: story } = await supabase
        .from("photo_stories")
        .select("hero_photo_url")
        .eq("site_id", site.id)
        .maybeSingle();
      heroPhotoUrl =
        story?.hero_photo_url ?? site?.cover_photo_url ?? null;
    }
  } catch {}

  const pageTitle = `${siteTitle} — Photo Story | Heritage of Pakistan`;
  const description =
    tagline
      ? `${tagline} — Explore the visual photo story of ${siteTitle}.`
      : `A visual photo story of ${siteTitle}, one of Pakistan's remarkable heritage sites.`;
  const canonicalUrl = `${siteBase}/heritage/${region}/${slug}/photo-story`;
  const ogImage = heroPhotoUrl ?? `${siteBase}/og-default.jpg`;

  return {
    title: pageTitle,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      title: pageTitle,
      description,
      url: canonicalUrl,
      type: "article",
      siteName: "Heritage of Pakistan",
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${siteTitle} photo story` }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImage],
    },
  };
}

export default function PhotoStoryPage() {
  return <PhotoStoryClient />;
}
