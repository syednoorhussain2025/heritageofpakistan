// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import { FaChevronRight } from "react-icons/fa";

export default function AdminHome() {
  const cards = [
    {
      href: "/admin/listings",
      title: "Listings",
      desc: "Create, edit, and manage heritage listings.",
    },
    {
      href: "/admin/categories",
      title: "Categories Manager",
      desc: "Add, nest, rename, and sort heritage categories.",
    },
    {
      href: "/admin/regions",
      title: "Regions Manager",
      desc: "Add, nest, rename, and sort regions.",
    },
    {
      href: "/admin/home",
      title: "Home Page Editor",
      desc: "Update homepage title, subtitle, and hero cover photo.",
    },
    {
      href: "/admin/fonts",
      title: "Font Manager",
      desc: "Upload custom fonts or add Google Fonts for use across the site.",
    },
    {
      href: "/admin/icons",
      title: "Icon Manager",
      desc: "Upload, tag, and manage all SVG icons for the application.",
    },
    {
      href: "/admin/map",
      title: "Map Settings",
      desc: "Customize map pins, cluster behavior, and default views.",
    },
    // New link added here
    {
      href: "/admin/settings/usermap",
      title: "User Map Settings",
      desc: "Control the map shown on the 'My Visited Places' page.",
    },
  ];

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-900 text-gray-300">
        <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text">
            Admin Dashboard
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group block bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg p-5 transition-all duration-300 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-semibold text-gray-100">
                      {c.title}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">{c.desc}</div>
                  </div>
                  <FaChevronRight className="text-gray-600 mt-1 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-blue-400" />
                </div>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}
