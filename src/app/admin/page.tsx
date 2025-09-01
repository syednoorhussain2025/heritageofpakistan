// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { FaChevronRight } from "react-icons/fa";

export default function AdminHome() {
  const cards = [
    {
      href: "/admin",
      title: "Admin Dashboard",
      desc: "Overview of all administrative tools.",
      icon: "admin",
    },
    {
      href: "/admin/listings",
      title: "Listings",
      desc: "Create, edit, and manage heritage listings.",
      icon: "listings",
    },
    {
      href: "/admin/categories",
      title: "Categories Manager",
      desc: "Add, nest, rename, and sort heritage categories.",
      icon: "categorytax",
    },
    {
      href: "/admin/regions",
      title: "Regions Manager",
      desc: "Add, nest, rename, and sort regions.",
      icon: "regiontax",
    },
    {
      href: "/admin/home",
      title: "Home Page Editor",
      desc: "Update homepage title, subtitle, and hero cover photo.",
      icon: "home",
    },
    {
      href: "/admin/fonts",
      title: "Font Manager",
      desc: "Upload custom fonts or add Google Fonts for use across the site.",
      icon: "font",
    },
    {
      href: "/admin/icons",
      title: "Icon Manager",
      desc: "Upload, tag, and manage all SVG icons for the application.",
      icon: "admin",
    }, // placeholder
    {
      href: "/admin/map",
      title: "Map Settings",
      desc: "Customize map pins, cluster behavior, and default views.",
      icon: "adminmap",
    },
    {
      href: "/admin/settings/usermap",
      title: "User Map Settings",
      desc: "Control the map shown on the 'My Visited Places' page.",
      icon: "adminmap",
    },
  ];

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          {/* Title */}
          <h1
            className="text-3xl font-bold mb-6 flex items-center gap-3"
            style={{ color: "var(--brand-blue)" }}
          >
            <Icon
              name="admin"
              size={48}
              style={{ color: "var(--brand-blue)" }}
            />
            Admin Dashboard
          </h1>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group block bg-white backdrop-blur-sm border border-slate-200 rounded-xl p-5 transition-all duration-300 hover:shadow-md"
                style={{ borderColor: "transparent" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "#00b78b")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "rgb(226 232 240)")
                } // slate-200
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {/* Fixed-size circle, icon content scaled inside */}
                    <span
                      className="inline-flex h-16 w-16 rounded-full items-center justify-center flex-none overflow-hidden"
                      style={{ backgroundColor: "#00b78b" }}
                    >
                      <span
                        className="inline-flex items-center justify-center leading-none"
                        style={{
                          transform: "scale(2)",
                          transformOrigin: "center",
                        }} // ⬅️ doubles icon visually
                      >
                        {/* Base size can be modest; we scale the rendered SVG */}
                        <Icon
                          name={c.icon}
                          size={28}
                          className="flex-none"
                          style={{ color: "#ffffff" }}
                        />
                      </span>
                    </span>

                    <div>
                      <div className="text-lg font-semibold text-slate-900">
                        {c.title}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {c.desc}
                      </div>
                    </div>
                  </div>

                  <FaChevronRight
                    className="mt-1 transition-transform duration-300 group-hover:translate-x-1"
                    style={{ color: "rgb(148 163 184)" }} // slate-400
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#00b78b")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "rgb(148 163 184)")
                    }
                  />
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}
