// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Option = { id: string; name: string };

export default function HomePage() {
  const router = useRouter();

  // UI state
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [regionId, setRegionId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load hero + options
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // hero image from global_settings (first row)
        const { data: gs } = await supabase
          .from("global_settings")
          .select("hero_image_url")
          .limit(1)
          .maybeSingle();

        setHeroUrl(gs?.hero_image_url ?? null);

        const [{ data: reg }, { data: cat }] = await Promise.all([
          supabase
            .from("regions")
            .select("id,name")
            .order("name", { ascending: true }),
          supabase
            .from("categories")
            .select("id,name")
            .order("name", { ascending: true }),
        ]);

        setRegions(
          ((reg as any[]) || []).map((r) => ({ id: r.id, name: r.name }))
        );
        setCategories(
          ((cat as any[]) || []).map((c) => ({ id: c.id, name: c.name }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function buildQueryString(params: Record<string, any>) {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.cats) sp.set("cats", params.cats); // explore accepts comma list
    if (params.regs) sp.set("regs", params.regs);
    // default order = latest; omit
    return `?${sp.toString()}`;
  }

  function onSearch() {
    const qs = buildQueryString({
      q,
      cats: categoryId ? categoryId : undefined,
      regs: regionId ? regionId : undefined,
    });
    router.push(`/explore${qs}`);
  }

  return (
    <div className="relative w-full h-screen">
      {/* HERO IMAGE */}
      {heroUrl ? (
        <img
          src={heroUrl}
          alt="Heritage of Pakistan"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 via-gray-800 to-black" />
      )}
      {/* dim overlay for readability */}
      <div className="absolute inset-0 bg-black/35" />

      {/* CENTERED CONTENT */}
      <div className="relative z-10 h-full w-full flex flex-col items-center justify-center px-4">
        <h1 className="text-white text-4xl md:text-6xl font-extrabold text-center drop-shadow">
          Heritage of Pakistan
        </h1>
        <p className="mt-4 text-white/95 text-lg md:text-2xl text-center drop-shadow">
          Discover, Explore, Preserve
        </p>

        {/* Search Panel */}
        <div className="mt-8 w-full max-w-5xl">
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg p-3 md:p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Region */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Regions
                </label>
                <select
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">All Regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Heritage Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Heritage Type
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">All Types</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search by name */}
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Search Heritage
                </label>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                  placeholder="e.g., Lahore Fort"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              {/* Button */}
              <div className="flex items-end">
                <button
                  onClick={onSearch}
                  className="w-full md:w-auto px-6 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                  disabled={loading}
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer gradient to help contrast at bottom on light photos */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}
