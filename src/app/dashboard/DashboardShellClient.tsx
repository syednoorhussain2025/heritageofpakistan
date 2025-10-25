// src/app/dashboard/DashboardShellClient.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

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

  return (
    <div
      className="min-h-screen flex p-6 gap-6 items-start"
      style={{
        backgroundImage:
          'url("https://opkndnjdeartooxhmfsr.supabase.co/storage/v1/object/public/graphics/background.png")',
        backgroundRepeat: "repeat",
        backgroundSize: "500px",
        backgroundPosition: "top left",
      }}
    >
      {/* Fixed Sidebar */}
      <aside className="fixed w-64 bg-white border border-gray-200 rounded-2xl shadow-md flex flex-col h-[calc(100vh-3rem)]">
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
                  className={`w-5 h-5 mr-3 ${
                    isActive ? "text-orange-700" : ""
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Spacer to prevent overlap with fixed sidebar */}
      <div className="w-64" />

      {/* Main Content */}
      <main
        className={`flex-1 ${
          fullBleed ? "p-0" : "p-8"
        } bg-white rounded-2xl border border-gray-200 shadow-sm`}
      >
        {children}
      </main>
    </div>
  );
}
