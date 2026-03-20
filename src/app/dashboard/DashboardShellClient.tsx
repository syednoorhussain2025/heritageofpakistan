// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import MobilePageHeader from "@/components/MobilePageHeader";

export default function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/dashboard/profile", label: "Profile", icon: "user" },
    { href: "/dashboard/bookmarks", label: "Bookmarks", icon: "heart" },
    { href: "/dashboard/mywishlists", label: "Wishlists", icon: "list-ul" },
    { href: "/dashboard/mycollections", label: "Collections", icon: "retro" },
    { href: "/dashboard/mytrips", label: "My Trips", icon: "route" },
    { href: "/dashboard/notebook", label: "Notebook", icon: "book" },
    {
      href: "/dashboard/placesvisited",
      label: "Places Visited",
      icon: "map-marker-alt",
    },
    { href: "/dashboard/myreviews", label: "My Reviews", icon: "star" },
    { href: "/dashboard/portfolio", label: "My Portfolio", icon: "image" },
    {
      href: "/dashboard/account-details",
      label: "Account Details",
      icon: "lightbulb",
    },
  ];

  const fullBleed =
    typeof pathname === "string" && pathname.startsWith("/dashboard/notebook");

  const pageTitleMap: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/profile": "Profile",
    "/dashboard/bookmarks": "Bookmarks",
    "/dashboard/mywishlists": "Wishlists",
    "/dashboard/mycollections": "Collections",
    "/dashboard/mytrips": "My Trips",
    "/dashboard/notebook": "Notebook",
    "/dashboard/placesvisited": "Places Visited",
    "/dashboard/myreviews": "My Reviews",
    "/dashboard/portfolio": "My Portfolio",
    "/dashboard/account-details": "Account Details",
  };

  const pageTitle = pageTitleMap[pathname ?? ""] ?? "Dashboard";

  return (
    <div className="min-h-screen bg-white lg:bg-gray-100 lg:flex lg:p-6 lg:gap-6 lg:items-start">
      {/* Fixed Sidebar — desktop only */}
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
                  isActive
                    ? "bg-orange-100 text-orange-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon
                  name={item.icon}
                  className={`w-5 h-5 mr-3 ${isActive ? "text-orange-700" : ""}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Spacer — desktop only */}
      <div className="hidden lg:block w-64" />

      {/* Teal mobile header — visible on mobile only */}
      <MobilePageHeader backgroundColor="#00b78b" minHeight="0px" className="flex items-end justify-center pb-3">
        <span className="text-white text-[17px] font-semibold tracking-wide">{pageTitle}</span>
      </MobilePageHeader>

      {/* Main Content */}
      <main className={`flex-1 bg-white lg:rounded-2xl lg:border lg:border-gray-200 lg:shadow-sm ${fullBleed ? "" : "p-4 lg:p-8"}`}>
        {/* Mobile safe-area top spacer — accounts for teal header height */}
        {!fullBleed && (
          <div className="lg:hidden" style={{ height: "calc(var(--sat, 44px) + 52px)" }} />
        )}
        {children}
        {/* Mobile bottom nav clearance */}
        <div className="lg:hidden" style={{ height: "calc(52px + env(safe-area-inset-bottom, 0px) + 8px)" }} />
      </main>
    </div>
  );
}
