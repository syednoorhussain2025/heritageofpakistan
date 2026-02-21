"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LoaderEngineProvider } from "@/components/loader-engine/LoaderEngineProvider";
import AuthPendingToast from "@/components/AuthPendingToast";

export default function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    return <main>{children}</main>;
  }

  return (
    <ProfileProvider>
      <BookmarkProvider>
        <WishlistProvider>
          <CollectionsProvider>
            <LoaderEngineProvider>
              <AuthPendingToast />
              <Header />
              <BottomNav />
              <main>{children}</main>
            </LoaderEngineProvider>
          </CollectionsProvider>
        </WishlistProvider>
      </BookmarkProvider>
    </ProfileProvider>
  );
}

