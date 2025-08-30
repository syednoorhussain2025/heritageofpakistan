// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import FontLoader from "@/components/FontLoader";
import { IconProvider } from "@/components/Icon";
import { BookmarkProvider } from "@/components/BookmarkProvider"; // existing
import { WishlistProvider } from "@/components/WishlistProvider"; // wishlist context
import { CollectionsProvider } from "@/components/CollectionsProvider"; // ✅ NEW: image collections context

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
        <FontLoader />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#f4f4f4]`}
      >
        <IconProvider>
          {/* Wrap app with providers so pages, cards & modals can access them */}
          <BookmarkProvider>
            <WishlistProvider>
              <CollectionsProvider>
                <Header />
                <main>{children}</main>
              </CollectionsProvider>
            </WishlistProvider>
          </BookmarkProvider>
        </IconProvider>
      </body>
    </html>
  );
}
