import type { Metadata } from "next";
import { Geist, Geist_Mono, Lato } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "@/modules/flow-layout/flow-layout.css";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { IconProvider } from "@/components/Icon";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LoaderEngineProvider } from "@/components/loader-engine/LoaderEngineProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";

/* ---------------- Fonts ---------------- */
const lato = Lato({
  weight: ["100", "300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

const futura = localFont({
  src: "./fonts/FuturaCyrillicMedium.ttf",
  variable: "--font-futura",
  display: "swap",
  weight: "500",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* ---------------- SEO ---------------- */

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Heritage of Pakistan",
    template: "%s | Heritage of Pakistan",
  },
  description:
    "Discover heritage sites across Pakistan, explore history, architecture and culture with photos, maps and travel guidance.",
  keywords: [
    "Pakistan heritage",
    "heritage sites",
    "historical places Pakistan",
    "tourist attractions Pakistan",
    "UNESCO Pakistan",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Heritage of Pakistan",
    title: "Heritage of Pakistan",
    description:
      "Discover and explore heritage sites across Pakistan with history, architecture and travel insights.",
    images: [
      {
        url: "/og-default.jpg", // 1200x630 image in /public
        width: 1200,
        height: 630,
        alt: "Heritage of Pakistan",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Heritage of Pakistan",
    description:
      "Explore cultural and historical heritage sites across Pakistan.",
    images: ["/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

/* ---------------- Layout ---------------- */

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fopkndnjdeartooxhmfsr.supabase.co"
          crossOrigin="anonymous"
        />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lato.variable} ${futura.variable} antialiased min-h-screen bg-[#f4f4f4] font-sans`}
      >
        <IconProvider>
          <ProfileProvider>
            <BookmarkProvider>
              <WishlistProvider>
                <CollectionsProvider>
                  <LoaderEngineProvider>
                    <Header />
                    <BottomNav />
                    <main>{children}</main>
                    <SpeedInsights />
                  </LoaderEngineProvider>
                </CollectionsProvider>
              </WishlistProvider>
            </BookmarkProvider>
          </ProfileProvider>
        </IconProvider>
      </body>
    </html>
  );
}
