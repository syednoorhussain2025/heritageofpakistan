// src/app/layout.tsx
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
import AuthPendingToast from "@/components/AuthPendingToast";

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

/* ---------------- Removed ALL SEO ---------------- */

export const metadata: Metadata = {};

/* ---------------- Layout ---------------- */

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://opkndnjdeartooxhmfsr.supabase.co"
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
                    <AuthPendingToast />
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
