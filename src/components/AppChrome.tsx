"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 1 }, // no exit fade — new page just overlaps instantly
};

const pageTransition = {
  duration: 0.12,
  ease: [0.25, 0.1, 0.25, 1], // cubic-bezier: fast start, smooth settle
};

export default function AppChrome({
  children,
  initialHeaderItems,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
}) {
  const pathname = usePathname() || "";
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomePage = pathname === "/" || pathname.startsWith("/auth");

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

                  <AnimatePresence mode="sync" initial={false}>
                    <motion.div
                      key={pathname}
                      variants={pageVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={pageTransition}
                    >
                      <main>{children}</main>
                    </motion.div>
                  </AnimatePresence>

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
