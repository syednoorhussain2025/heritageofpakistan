// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/modules/flow-layout/flow-layout.css";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import FontLoader from "@/components/FontLoader";
import { IconProvider } from "@/components/Icon";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";

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
          <ProfileProvider>
            <BookmarkProvider>
              <WishlistProvider>
                <CollectionsProvider>
                  <Header />
                  {/* Persistent bottom nav on tablet & below */}
                  <BottomNav />
                  <main>{children}</main>
                </CollectionsProvider>
              </WishlistProvider>
            </BookmarkProvider>
          </ProfileProvider>
        </IconProvider>
      </body>
    </html>
  );
}
