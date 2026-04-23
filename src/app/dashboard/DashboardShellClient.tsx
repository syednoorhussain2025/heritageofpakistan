// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, memo } from "react";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { createClient } from "@/lib/supabase/browser";
import { usePrefetchDashboard } from "@/hooks/useDashboardQueries";
import { DASHBOARD_NAV_ITEMS } from "./DashboardPaneShell";
import { DashboardNavProvider } from "./DashboardNavContext";
import DashboardPaneShellConnected from "./DashboardPaneShellConnected";


// Desktop sidebar isolated in its own memo component so usePathname/useRouter
// re-renders stay local and never propagate up to DashboardShellClient.
const DesktopSidebar = memo(function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "layout-board-split" },
    ...DASHBOARD_NAV_ITEMS,
  ];
  return (
    <aside className="hidden lg:flex fixed w-64 bg-white border border-gray-200 rounded-2xl shadow-md flex-col h-[calc(100vh-3rem)]">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800">My Dashboard</h2>
      </div>
      <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto">
        {nav.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors duration-200 ${
                isActive ? "bg-orange-100 text-orange-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon name={item.icon} className={`w-5 h-5 mr-3 ${isActive ? "text-orange-700" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <button
          type="button"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/");
          }}
          className="flex w-full items-center px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors duration-200"
        >
          <Icon name="sign-out-alt" className="w-5 h-5 mr-3" />
          Sign Out
        </button>
      </div>
    </aside>
  );
});

// ── Memoized header — compact title bar, same height as all pane headers ──
const DashboardHomeHeader = memo(function DashboardHomeHeader() {
  return (
    <MobilePageHeader
      backgroundColor="var(--brand-green)"
      minHeight="0px"
      className="flex flex-col"
      style={{ transform: "translateZ(0)", willChange: "transform" }}
    >
      <div className="flex items-center px-2 pb-2.5">
        <div className="w-[46px] h-[46px] ml-2 shrink-0" />
        <span className="flex-1 flex items-center justify-center gap-1.5 text-white text-[20px] font-extrabold tracking-tight pr-9" style={{ fontFamily: "var(--font-futura, sans-serif)" }}>
          <Icon name="layout-board-split" size={22} className="text-white/90 shrink-0" />
          Dashboard
        </span>
      </div>
    </MobilePageHeader>
  );
});

export default function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = useAuthUserId();
  const prefetchDashboard = usePrefetchDashboard(userId);
  useEffect(() => {
    if (userId) prefetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);


  return (
    <div className="min-h-screen bg-white lg:bg-gray-100 lg:flex lg:p-6 lg:gap-6 lg:items-start">
      {/* Fixed Sidebar — desktop only, isolated so usePathname re-renders stay local */}
      <DesktopSidebar />

      <div className="hidden lg:block w-64" />

      {/* Compact title header — same height as all pane headers */}
      <DashboardHomeHeader />

      {/* Main Content */}
      <main id="dashboard-root" className="flex-1 bg-white lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-sm dashboard-no-longpress p-4 lg:p-8">
        <div className="lg:hidden" style={{ height: "calc(var(--sat, 44px) + 58px)" }} />

        <DashboardNavProvider>
          {children}
          <DashboardPaneShellConnected />
        </DashboardNavProvider>

        <div className="lg:hidden" style={{ height: "calc(52px + var(--safe-bottom, 0px) + 8px)" }} />
      </main>
    </div>
  );
}
