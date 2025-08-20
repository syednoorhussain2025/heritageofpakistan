// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";

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
    // Add more admin tools here later…
  ];

  return (
    <AdminGuard>
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block bg-white rounded-lg shadow-sm border p-4 hover:shadow transition"
            >
              <div className="text-lg font-semibold">{c.title}</div>
              <div className="text-sm text-gray-600 mt-1">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AdminGuard>
  );
}
