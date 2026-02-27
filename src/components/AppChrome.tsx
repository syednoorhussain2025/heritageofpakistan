"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import type { HeaderMainItem } from "@/lib/fetchHeaderItems";
import BottomNav from "@/components/BottomNav";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LoaderEngineProvider } from "@/components/loader-engine/LoaderEngineProvider";
import AuthPendingToast from "@/components/AuthPendingToast";

export default function AppChrome({
  children,
  initialHeaderItems,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
}) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    return (
      <LoaderEngineProvider>
        <Header initialItems={initialHeaderItems} />
        <main>{children}</main>
      </LoaderEngineProvider>
    );
  }

  return (
    <ProfileProvider>
      <BookmarkProvider>
        <WishlistProvider>
          <CollectionsProvider>
            <LoaderEngineProvider>
              <AuthPendingToast />
              <Header initialItems={initialHeaderItems} />
              <main>{children}</main>
              <BottomNav />
            </LoaderEngineProvider>
          </CollectionsProvider>
        </WishlistProvider>
      </BookmarkProvider>
    </ProfileProvider>
  );
}
