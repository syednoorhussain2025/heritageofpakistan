import type { Metadata } from "next";
import { Geist, Geist_Mono, Lato } from "next/font/google";
import localFont from "next/font/local"; // Import localFont loader
import "./globals.css";
import "@/modules/flow-layout/flow-layout.css";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
// Removed FontLoader as it causes render blocking
// import FontLoader from "@/components/FontLoader";
import { IconProvider } from "@/components/Icon";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LoaderEngineProvider } from "@/components/loader-engine/LoaderEngineProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";

// 1. Setup Google Font (Lato)
const lato = Lato({
  weight: ["100", "300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap", // CRITICAL: Allows text to show immediately
});

// 2. Setup Local Font (Futura)
// Make sure to put the .ttf file in src/app/fonts/
const futura = localFont({
  src: "./fonts/FuturaCyrillicMedium.ttf",
  variable: "--font-futura",
  display: "swap",
  weight: "500", // Adjust based on the actual font weight
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Heritage of Pakistan",
  description: "Discover, Explore, Preserve — a guide to Pakistan’s heritage.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* LCP Preconnects */}
        {/* Kept Supabase preconnect if you load IMAGES from there. 
            If you only used it for fonts, you can remove this link. */}
        <link
          rel="preconnect"
          href="https://fopkndnjdeartooxhmfsr.supabase.co"
          crossOrigin="anonymous"
        />
      </head>

      <body
        // 3. Apply all font variables here
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