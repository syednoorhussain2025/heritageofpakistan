// src/app/page.tsx

import type { Metadata } from "next";
import HomeClient from "./HomeClient";

/* ------------------------------------------------------------------
   SEO metadata
-------------------------------------------------------------------*/
const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

const pageTitle = "Heritage of Pakistan — Discover, Explore, Preserve";
const description =
  "Heritage of Pakistan is your guide to the country's most remarkable heritage sites — ancient forts, mosques, Buddhist monasteries, archaeological ruins, and natural wonders. Search by region, type and location.";
const canonicalUrl = siteBase;
const ogImage = `${siteBase}/og-default.jpg`;

export const metadata: Metadata = {
  title: pageTitle,
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
  },
  openGraph: {
    title: pageTitle,
    description,
    url: canonicalUrl,
    type: "website",
    siteName: "Heritage of Pakistan",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Heritage of Pakistan — Discover, Explore, Preserve",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description,
    images: [ogImage],
  },
};

/* ------------------------------------------------------------------
   JSON-LD — WebSite + SearchAction (enables Google Sitelinks searchbox)
-------------------------------------------------------------------*/
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Heritage of Pakistan",
  url: canonicalUrl,
  description,
  inLanguage: "en",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteBase}/explore?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
  publisher: {
    "@type": "Organization",
    name: "Heritage of Pakistan",
    url: canonicalUrl,
  },
};

/* ------------------------------------------------------------------
   PAGE (Server Component)
-------------------------------------------------------------------*/
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient />
    </>
  );
}
