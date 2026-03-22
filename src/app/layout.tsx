// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Lato } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "@/modules/flow-layout/flow-layout.css";
import AppChrome from "@/components/AppChrome";
import { fetchHeaderItems } from "@/lib/fetchHeaderItems";
import { IconProvider } from "@/components/Icon";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getBrandColors, brandColorsCss } from "@/lib/brand-colors";

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

/* ---------------- Root metadata (fallback + template) ---------------- */

const siteBase =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://heritageofpakistan.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteBase),
  title: {
    default: "Heritage of Pakistan",
    template: "%s | Heritage of Pakistan",
  },
  description:
    "Discover, explore and preserve the remarkable heritage sites of Pakistan — forts, mosques, temples, ruins and natural wonders.",
  openGraph: {
    siteName: "Heritage of Pakistan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

/* ---------------- Layout ---------------- */

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [initialHeaderItems, brandColors] = await Promise.all([
    fetchHeaderItems(),
    getBrandColors(),
  ]);

  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://opkndnjdeartooxhmfsr.supabase.co"
          crossOrigin="anonymous"
        />
        {/* Capacitor: viewport-fit=cover exposes safe-area-inset-* on iOS */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* iOS PWA: launch without browser chrome (enables display-mode: standalone) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* PWA theme color — driven by brand-green */}
        <meta name="theme-color" content={brandColors.brand_green} />
        {/* Brand color CSS variables — server-rendered, zero flash */}
        <style dangerouslySetInnerHTML={{ __html: brandColorsCss(brandColors) }} />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} ${lato.variable} ${futura.variable} antialiased min-h-screen bg-[#f4f4f4] font-sans`}
      >
        <IconProvider>
          <AppChrome initialHeaderItems={initialHeaderItems}>{children}</AppChrome>
          <SpeedInsights />
        </IconProvider>
      </body>
    </html>
  );
}
