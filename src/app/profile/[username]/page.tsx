// src/app/profile/[username]/page.tsx
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import ProfileClient from "./ProfileClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

export async function generateMetadata(props: any): Promise<Metadata> {
  const { username } = await props.params;

  let displayName = username;
  let bio: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, bio, avatar_path")
      .eq("username", username)
      .single();

    if (data?.full_name) displayName = data.full_name;
    bio = data?.bio ?? null;

    if (data?.avatar_path) {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
      avatarUrl = `${base}/storage/v1/object/public/${data.avatar_path}`;
    }
  } catch {}

  const pageTitle = `${displayName} | Heritage of Pakistan`;
  const description =
    bio ??
    `View ${displayName}'s public profile on Heritage of Pakistan — their portfolio, reviews and heritage explorations.`;
  const canonicalUrl = `${siteBase}/profile/${username}`;
  const ogImage = avatarUrl ?? `${siteBase}/og-default.jpg`;

  return {
    title: pageTitle,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      title: pageTitle,
      description,
      url: canonicalUrl,
      type: "profile",
      siteName: "Heritage of Pakistan",
      images: [{ url: ogImage, width: 400, height: 400, alt: `${displayName} profile photo` }],
    },
    twitter: {
      card: "summary",
      title: pageTitle,
      description,
      images: [ogImage],
    },
  };
}

export default function ProfilePage() {
  return <ProfileClient />;
}
