"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
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
import { TabNavProvider, useTabNav } from "@/components/TabNavContext";
import HomeSkeleton from "@/components/skeletons/HomeSkeleton";
import ExploreSkeleton from "@/components/skeletons/ExploreSkeleton";
import MapSkeleton from "@/components/skeletons/MapSkeleton";

/* ─── Skeleton resolver ─── */
function TabSkeleton({ href }: { href: string }) {
  if (href === "/") return <HomeSkeleton />;
  if (href.startsWith("/explore")) return <ExploreSkeleton />;
  if (href.startsWith("/map")) return <MapSkeleton />;
  return null;
}

/* ─── Animated page wrapper — mobile only ─── */
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

const pageTransition = {
  duration: 0.15,
  ease: "easeOut",
};

/* ─── Inner chrome — reads TabNavContext ─── */
function ChromeInner({
  children,
  initialHeaderItems,
  isAdminRoute,
  isHomePage,
  pathname,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
  isAdminRoute: boolean;
  isHomePage: boolean;
  pathname: string;
}) {
  const { optimisticHref, setOptimisticHref } = useTabNav();

  // Clear optimistic state once the real navigation lands
  useEffect(() => {
    setOptimisticHref(null);
  }, [pathname, setOptimisticHref]);

  // Show skeleton when we have an optimistic href that differs from current path
  const showSkeleton =
    optimisticHref !== null &&
    optimisticHref !== pathname &&
    !isAdminRoute;

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

                  {/* Skeleton — instant, no animation needed, it IS the animation */}
                  {showSkeleton && <TabSkeleton href={optimisticHref} />}

                  {/* Page content — fades in on every route change, mobile only */}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={pathname}
                      variants={pageVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={pageTransition}
                      // On desktop the animation is invisible (no-op feel at 150ms)
                      // On mobile it smooths the tab/page switch
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

/* ─── Public export ─── */
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

  return (
    <TabNavProvider>
      <ChromeInner
        initialHeaderItems={initialHeaderItems}
        isAdminRoute={isAdminRoute}
        isHomePage={isHomePage}
        pathname={pathname}
      >
        {children}
      </ChromeInner>
    </TabNavProvider>
  );
}
