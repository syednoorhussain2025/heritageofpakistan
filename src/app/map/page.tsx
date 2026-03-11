// src/app/map/page.tsx
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import MapClient from "./MapClient";

const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

const pageTitle = "Heritage Sites Map of Pakistan | Heritage of Pakistan";
const description =
  "Interactive map of heritage sites across Pakistan. Browse forts, mosques, archaeological sites, natural wonders and more — filter by type, region or search nearby.";
const canonicalUrl = `${siteBase}/map`;
const ogImage = `${siteBase}/og-default.jpg`;

export const metadata: Metadata = {
  title: pageTitle,
  description,
  alternates: { canonical: canonicalUrl },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    title: pageTitle,
    description,
    url: canonicalUrl,
    type: "website",
    siteName: "Heritage of Pakistan",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "Heritage sites map of Pakistan" }],
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description,
    images: [ogImage],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Map",
  name: "Heritage Sites Map of Pakistan",
  description,
  url: canonicalUrl,
};

export default function MapPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MapClient />
    </>
  );
}
