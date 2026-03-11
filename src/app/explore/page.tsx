// src/app/explore/page.tsx

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import ExploreClient from "./ExploreClient";

/* ------------------------------------------------------------------
   SEO metadata
-------------------------------------------------------------------*/
const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

const pageTitle =
  "Explore Heritage Sites of Pakistan | Heritage of Pakistan";
const description =
  "Browse and search hundreds of heritage sites across Pakistan — ancient forts, mosques, temples, archaeological sites, natural wonders and more. Filter by region, type and location.";
const canonicalUrl = `${siteBase}/explore`;
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
        alt: "Explore heritage sites of Pakistan",
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
   JSON-LD — CollectionPage schema
-------------------------------------------------------------------*/
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Explore Heritage Sites of Pakistan",
  description,
  url: canonicalUrl,
  inLanguage: "en",
  about: {
    "@type": "Country",
    name: "Pakistan",
  },
  publisher: {
    "@type": "Organization",
    name: "Heritage of Pakistan",
    url: siteBase,
  },
};

/* ------------------------------------------------------------------
   PAGE (Server Component)
-------------------------------------------------------------------*/
export default function ExplorePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ExploreClient />
    </>
  );
}
