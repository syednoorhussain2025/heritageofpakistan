"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
import ConnectivityBanner from "@/components/ConnectivityBanner";
import TabShell, { isTabRoute } from "@/components/TabShell";

// Default fade for non-dashboard pages
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 1 },
};

const fadeTransition = {
  duration: 0.12,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

// Slide variants for dashboard navigation — direction set per render via custom prop
const slideVariants = {
  initial: (dir: number) => ({ x: `${dir * 100}%`, opacity: 1 }),
  animate: { x: "0%", opacity: 1 },
  exit:    (dir: number) => ({ x: `${dir * -100}%`, opacity: 1 }),
};

const slideTransition = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

export default function AppChrome({
  children,
  initialHeaderItems,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
}) {
  const pathname = usePathname() || "";
  const prevPathnameRef = useRef(pathname);
  const slideDirRef = useRef(1);

  // Compute direction synchronously during render (before effects run)
  // so both entering and exiting pages share the same direction.
  const isDashboard = pathname.startsWith("/dashboard");
  const wasDashboard = prevPathnameRef.current.startsWith("/dashboard");
  // Only slide when crossing the dashboard boundary (entering/leaving), not within it
  const useSlideTrans = (isDashboard !== wasDashboard) && prevPathnameRef.current !== pathname;

  if (prevPathnameRef.current !== pathname) {
    // going back = arriving at /dashboard from a sub-page
    const goingBack = isDashboard && wasDashboard && pathname === "/dashboard";
    slideDirRef.current = goingBack ? -1 : 1;
    prevPathnameRef.current = pathname;
  }

  const slideDir = slideDirRef.current;

  // Lock orientation to portrait on mobile — runs once on mount
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orientation = screen?.orientation as any;
      if (typeof orientation?.lock === "function") {
        orientation.lock("portrait").catch(() => {
          // Browser may deny if not in fullscreen/standalone — safe to ignore
        });
      }
    } catch {
      // API not available
    }
  }, []);
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomePage = pathname.startsWith("/auth");
  const onTabRoute = isTabRoute(pathname);

  // Prevent body scroll on tab routes — all content is in fixed divs
  useEffect(() => {
    if (onTabRoute) {
      document.documentElement.classList.add("tab-route");
      document.body.classList.add("tab-route");
    } else {
      document.documentElement.classList.remove("tab-route");
      document.body.classList.remove("tab-route");
    }
    return () => {
      document.documentElement.classList.remove("tab-route");
      document.body.classList.remove("tab-route");
    };
  }, [onTabRoute]);

  if (isAdminRoute) {
    return (
      <ErrorBoundary>
        <LoaderEngineProvider>
          <ConnectivityBanner />
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
                  <ConnectivityBanner />
                  <AuthPendingToast />

                  <div className={isHomePage ? "md:block hidden" : ""}>
                    <Header initialItems={initialHeaderItems} />
                  </div>

                  {/* ── Mobile: persistent tab shell — always mounted so HomeClient/ExploreClient
                      never unmount. TabPane uses display:none internally when inactive,
                      which hides fixed children in WebKit too. */}
                  <div className="lg:hidden">
                    <TabShell />
                  </div>

                  {/* ── Mobile: non-tab pages + Map fade in normally ── */}
                  {/* ── Desktop: all pages render via children as before ── */}
                  <AnimatePresence mode="sync" initial={false} custom={slideDir}>
                    <motion.div
                      key={pathname}
                      custom={slideDir}
                      variants={useSlideTrans ? slideVariants : fadeVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={useSlideTrans ? slideTransition : fadeTransition}
                      className={onTabRoute ? "hidden lg:block" : "block"}
                      style={useSlideTrans ? { overflowX: "hidden" } : undefined}
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
