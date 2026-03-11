// src/app/[username]/trip/[tripSlug]/public/page.tsx
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import TripPublicClient from "./TripPublicClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

export async function generateMetadata(props: any): Promise<Metadata> {
  const { username, tripSlug } = await props.params;

  let tripTitle = tripSlug.replace(/-/g, " ");
  let authorName = username;
  let coverUrl: string | null = null;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("username", username)
      .single();

    if (profile?.full_name) authorName = profile.full_name;

    if (profile?.id) {
      const { data: trip } = await supabase
        .from("trips")
        .select("title, cover_image_url")
        .eq("user_id", profile.id)
        .eq("slug", tripSlug)
        .single();

      if (trip?.title) tripTitle = trip.title;
      coverUrl = trip?.cover_image_url ?? null;
    }
  } catch {}

  const pageTitle = `${tripTitle} by ${authorName} | Heritage of Pakistan`;
  const description = `Explore ${authorName}'s heritage trip "${tripTitle}" across Pakistan — sites visited, travel days and highlights.`;
  const canonicalUrl = `${siteBase}/${username}/trip/${tripSlug}/public`;
  const ogImage = coverUrl ?? `${siteBase}/og-default.jpg`;

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
      images: [{ url: ogImage, width: 1200, height: 630, alt: tripTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [ogImage],
    },
  };
}

export default function PublicTripPage() {
  return <TripPublicClient />;
}
