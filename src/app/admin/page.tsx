// src/app/admin/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";

export default function AdminHome() {
  const [query, setQuery] = useState("");

  // ---- Statistics state ----
  const [totalSites, setTotalSites] = useState<number | null>(null);
  const [provinceSites, setProvinceSites] = useState<
    { province: string; count: number }[]
  >([]);
  const [totalReviews, setTotalReviews] = useState<number | null>(null);
  const [avgReviewRating, setAvgReviewRating] = useState<number | null>(null);
  const [totalReviewPhotos, setTotalReviewPhotos] = useState<number | null>(
    null
  );
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [adminUsers, setAdminUsers] = useState<number | null>(null);

  useEffect(() => {
    async function loadStats() {
      // Sites count
      const { count: siteCount } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true });
      setTotalSites(siteCount ?? 0);

      // Sites by province
      const { data: sitesData } = await supabase
        .from("sites")
        .select("province_id, provinces(name)");
      if (sitesData) {
        const counts: Record<string, number> = {};
        sitesData.forEach((row: any) => {
          const province = row.provinces?.name ?? "Unknown";
          counts[province] = (counts[province] || 0) + 1;
        });
        setProvinceSites(
          Object.entries(counts).map(([province, count]) => ({
            province,
            count,
          }))
        );
      }

      // Reviews count
      const { count: reviewCount } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true });
      setTotalReviews(reviewCount ?? 0);

      // Average rating
      const { data: ratings } = await supabase.from("reviews").select("rating");
      if (ratings && ratings.length > 0) {
        const sum = ratings.reduce((acc, r: any) => acc + (r.rating || 0), 0);
        setAvgReviewRating(sum / ratings.length);
      }

      // Review photos count
      const { count: photoCount } = await supabase
        .from("review_photos")
        .select("*", { count: "exact", head: true });
      setTotalReviewPhotos(photoCount ?? 0);

      // Users count
      const { count: usersCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });
      setTotalUsers(usersCount ?? 0);

      // Admins count
      const { count: adminsCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_admin", true);
      setAdminUsers(adminsCount ?? 0);
    }

    loadStats();
  }, []);

  // ---- Sidebar cards ----
  const cards = [
    {
      href: "/admin",
      title: "Admin Dashboard",
      desc: "Overview of tools.",
      icon: "admin",
    },
    {
      href: "/admin/listings",
      title: "Listings",
      desc: "Manage heritage listings.",
      icon: "listings",
    },

    // NEW: Heritage Database (master reference)
    {
      href: "/admin/heritage-database",
      title: "Heritage Database",
      desc: "Master reference of heritage sites.",
      icon: "listings",
    },

    {
      href: "/admin/categories",
      title: "Categories",
      desc: "Sort heritage categories.",
      icon: "categorytax",
    },
    {
      href: "/admin/regions",
      title: "Regions",
      desc: "Sort regions.",
      icon: "regiontax",
    },
    // NEW: Travel Guide Manager
    {
      href: "/admin/travel-guides",
      title: "Travel Guide Manager",
      desc: "Create & edit region guides.",
      icon: "adminmap",
    },
    {
      href: "/admin/home",
      title: "Home Editor",
      desc: "Update homepage hero.",
      icon: "home",
    },
    {
      href: "/admin/fonts",
      title: "Font Manager",
      desc: "Upload or add fonts.",
      icon: "font",
    },
    {
      href: "/admin/icons",
      title: "Icon Manager",
      desc: "Manage all SVG icons.",
      icon: "admin",
    },
    // NEW: Bibliography Manager (centralized)
    {
      href: "/admin/bibliography",
      title: "Bibliography Manager",
      desc: "Centralized sources & citations.",
      icon: "book",
    },
    {
      href: "/admin/map",
      title: "Map Settings",
      desc: "Customize map pins.",
      icon: "adminmap",
    },
    {
      href: "/admin/settings/usermap",
      title: "User Map",
      desc: "Control 'Visited Places'.",
      icon: "adminmap",
    },
    // NEW: Listing Page Styling icon updated to 'paint'
    {
      href: "/admin/listing-styling",
      title: "Listing Page Styling",
      desc: "Style the Action Bar & Navigator.",
      icon: "paint",
    },
    // NEW: AI Settings link
    {
      href: "/admin/ai",
      title: "AI Settings",
      desc: "Configure AI-powered features.",
      icon: "ai",
    },
    // Layouts & Templates hub
    {
      href: "/admin/layouts",
      title: "Layouts & Templates",
      desc: "Section & template builders.",
      icon: "admin",
    },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [cards, query]);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800">
        <main className="mx-auto max-w-7xl py-10 px-4 sm:px-6 lg:px-8">
          {/* Title */}
          <h1
            className="mb-6 flex items-center gap-3 text-3xl font-bold"
            style={{ color: "var(--brand-blue)" }}
          >
            <Icon
              name="admin"
              size={48}
              style={{ color: "var(--brand-blue)" }}
            />
            Admin Dashboard
          </h1>

          {/* Sidebar + Content */}
          <div className="flex gap-6">
            {/* NEW: Left sidebar for statistics */}
            <aside className="w-72 flex-shrink-0 space-y-4">
              {/* Sites Box */}
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-slate-800">
                  <Icon
                    name="listings"
                    size={22}
                    style={{ color: "#F78300" }}
                  />
                  <h2 className="text-lg font-semibold">Total Sites</h2>
                </div>
                <div className="text-3xl font-bold text-slate-800">
                  {totalSites ?? "--"}
                </div>
              </div>

              {/* Province Box */}
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-slate-800">
                  <Icon
                    name="adminmap"
                    size={22}
                    style={{ color: "#F78300" }}
                  />
                  <h2 className="text-lg font-semibold">Sites by Province</h2>
                </div>
                <ul className="space-y-1">
                  {provinceSites.map((p) => (
                    <li
                      key={p.province}
                      className="flex justify-between text-sm text-slate-600"
                    >
                      <span>{p.province}</span>
                      <span className="font-medium">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Reviews Box */}
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-slate-800">
                  <Icon name="review" size={22} style={{ color: "#F78300" }} />
                  <h2 className="text-lg font-semibold">Reviews</h2>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Total Reviews:</span>
                    <span className="font-medium">{totalReviews ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Rating:</span>
                    <span className="font-medium">
                      {avgReviewRating ? avgReviewRating.toFixed(2) : "--"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Review Photos:</span>
                    <span className="font-medium">
                      {totalReviewPhotos ?? "--"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Users Box */}
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-slate-800">
                  <Icon name="user" size={22} style={{ color: "#F78300" }} />
                  <h2 className="text-lg font-semibold">Users</h2>
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Total Users:</span>
                    <span className="font-medium">{totalUsers ?? "--"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Admins:</span>
                    <span className="font-medium">{adminUsers ?? "--"}</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* NEW: Right content area for buttons */}
            <section className="flex-1">
              {/* Search bar */}
              <div className="relative mb-4">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="text"
                  placeholder="Search tools…"
                  aria-label="Search admin tools"
                  className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="group block rounded-xl border border-slate-200 bg-white p-4 transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full"
                        style={{ backgroundColor: "#00b78b" }}
                      >
                        <Icon
                          name={c.icon}
                          size={20}
                          style={{ color: "#fff" }}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {c.title}
                        </div>
                        <div className="truncate text-xs leading-4 text-slate-600">
                          {c.desc}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </AdminGuard>
  );
}
