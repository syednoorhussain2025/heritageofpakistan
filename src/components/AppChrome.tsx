"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { QueryProvider } from "@/components/QueryProvider";
import Header from "@/components/Header";
import type { HeaderMainItem } from "@/lib/fetchHeaderItems";
import BottomNav from "@/components/BottomNav";
import { BookmarkProvider } from "@/components/BookmarkProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { CollectionsProvider } from "@/components/CollectionsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LoaderEngineProvider } from "@/components/loader-engine/LoaderEngineProvider";
import AuthPendingToast from "@/components/AuthPendingToast";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function AppChrome({
  children,
  initialHeaderItems,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
}) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomePage = pathname === "/";

  if (isAdminRoute) {
    return (
      <ErrorBoundary>
        <LoaderEngineProvider>
          <Header initialItems={initialHeaderItems} />
          <main>{children}</main>
        </LoaderEngineProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryProvider>
        <ProfileProvider>
          <BookmarkProvider>
            <WishlistProvider>
              <CollectionsProvider>
                <LoaderEngineProvider>
                    <AuthPendingToast />
                    <div className={isHomePage ? "md:block hidden" : ""}>
                      <Header initialItems={initialHeaderItems} />
                    </div>
                    <main>{children}</main>
                    <div className={isHomePage ? "md:block hidden" : ""}>
                      <BottomNav />
                    </div>
                </LoaderEngineProvider>
              </CollectionsProvider>
            </WishlistProvider>
          </BookmarkProvider>
        </ProfileProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
