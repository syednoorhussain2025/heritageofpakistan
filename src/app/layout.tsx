// src/app/layout.tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "@/modules/flow-layout/flow-layout.css";
import AppChrome from "@/components/AppChrome";
import { fetchHeaderItems } from "@/lib/fetchHeaderItems";
import { IconProvider } from "@/components/Icon";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getBrandColors } from "@/lib/brand-colors";

/* ---------------- Fonts ---------------- */

// Variable font — covers weights 200–800 in a single file
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  axes: ["opsz"], // include optical-size axis for full variable font support
});

const futura = localFont({
  src: "./fonts/FuturaCyrillicMedium.ttf",
  variable: "--font-futura",
  display: "swap",
  weight: "500",
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
    <html lang="en" suppressHydrationWarning>
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
        <meta name="theme-color" content={brandColors.brand_green} />
        <style id="brand-colors" dangerouslySetInnerHTML={{ __html: `:root{--brand-green:${brandColors.brand_green};--brand-orange:${brandColors.brand_orange};--brand-blue:${brandColors.brand_blue};--brand-black:${brandColors.brand_black};--brand-dark-grey:${brandColors.brand_dark_grey};--brand-light-grey:${brandColors.brand_light_grey};--brand-very-light-grey:${brandColors.brand_very_light_grey};--brand-illustration:${brandColors.brand_illustration}}` }} />
      </head>

      <body
        className={`${plusJakartaSans.variable} ${geistMono.variable} ${futura.variable} antialiased min-h-screen bg-[#f4f4f4] font-jakarta`}
        suppressHydrationWarning
      >
        <IconProvider>
          <AppChrome initialHeaderItems={initialHeaderItems}>{children}</AppChrome>
          <SpeedInsights />
        </IconProvider>
      </body>
    </html>
  );
}
