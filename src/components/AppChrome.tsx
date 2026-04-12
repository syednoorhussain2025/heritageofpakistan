"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

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


export default function AppChrome({
  children,
  initialHeaderItems,
}: {
  children: ReactNode;
  initialHeaderItems?: HeaderMainItem[];
}) {
  const pathname = usePathname() || "";

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

  // Android hardware back button + nearby notifications via @capacitor/app
  useEffect(() => {
    const removers: (() => void)[] = [];
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const { checkAndNotifyNearbySites } = await import("@/lib/nearbyNotifications");

        // Back button
        const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
        removers.push(() => backHandle.remove());

        // Nearby notifications — on launch and every foreground resume
        void checkAndNotifyNearbySites();
        const resumeHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void checkAndNotifyNearbySites();
        });
        removers.push(() => resumeHandle.remove());

        // Notification tap — deep link to nearby sheet
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const notifHandle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (action) => {
            if (action.notification?.extra?.type === "nearby") {
              window.location.href = "/?nearby=1";
            }
          }
        );
        removers.push(() => notifHandle.remove());
      } catch {
        // Not in Capacitor
      }
    })();
    return () => { removers.forEach((r) => r()); };
  }, []);
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomePage = pathname.startsWith("/auth") || pathname.endsWith("/gallery");
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
    // Writer editor gets full viewport — no site header, no main wrapper
    if (/^\/admin\/writer\/[^/]+/.test(pathname)) {
      return (
        <ErrorBoundary>
          <LoaderEngineProvider>
            {children}
          </LoaderEngineProvider>
        </ErrorBoundary>
      );
    }
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

                  <div className={onTabRoute ? "hidden lg:block" : "block"}>
                    <main>{children}</main>
                  </div>

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
