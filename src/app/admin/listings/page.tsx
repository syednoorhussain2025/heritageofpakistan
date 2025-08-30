// src/app/admin/listings/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import { FaExclamationCircle, FaTimes, FaArrowLeft } from "react-icons/fa";

type SiteRow = {
  id: string;
  title: string | null;
  slug: string | null;
  is_published: boolean | null;
  updated_at: string | null;
};

type FilterOption = {
  id: string;
  name: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Custom Searchable Dropdown Component
const SearchableDropdown = ({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(
    () =>
      options.filter((option) =>
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [options, searchTerm]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <div className="relative w-48" ref={dropdownRef}>
      <button
        type="button"
        className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-left text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption ? selectedOption.name : placeholder}</span>
        {value ? (
          <FaTimes
            className="text-gray-500 hover:text-gray-300"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <span className="text-gray-500">▾</span>
        )}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg">
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-gray-700 px-3 py-2 text-sm text-gray-300 border-b border-gray-600 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ul className="max-h-60 overflow-y-auto">
            {filteredOptions.map((option) => (
              <li
                key={option.id}
                className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
              >
                {option.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default function AdminListingsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [regions, setRegions] = useState<FilterOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("sites")
      .select(
        "id, title, slug, is_published, updated_at, site_categories(category_id), site_regions(region_id)"
      )
      .order("updated_at", { ascending: false })
      .limit(200);

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setRows((data as any[]) || []);
    setLoading(false);
  }

  async function loadFilters() {
    const { data: catData, error: catError } = await supabase
      .from("categories")
      .select("id, name");
    if (catError) setError(catError.message);
    else setCategories(catData || []);

    const { data: regData, error: regError } = await supabase
      .from("regions")
      .select("id, name");
    if (regError) setError(regError.message);
    else setRegions(regData || []);
  }

  useEffect(() => {
    load();
    loadFilters();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let filteredRows = rows;

    if (selectedCategory) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_categories.some((sc: any) => sc.category_id === selectedCategory)
      );
    }

    if (selectedRegion) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_regions.some((sr: any) => sr.region_id === selectedRegion)
      );
    }

    if (!needle) return filteredRows;

    return filteredRows.filter((r) =>
      [r.title ?? "", r.slug ?? ""].some((x) =>
        x.toLowerCase().includes(needle)
      )
    );
  }, [rows, q, selectedCategory, selectedRegion]);

  async function createNew() {
    const base = "Untitled Heritage";
    const slug = slugify(base) + "-" + String(Date.now()).slice(-5);
    setBusy("create");
    setError(null);
    const { data, error } = await supabase
      .from("sites")
      .insert({ title: base, slug, is_published: false })
      .select("id")
      .single();
    setBusy(null);
    if (error) return setError(error.message);
    router.push(`/admin/listings/${data!.id}`);
  }

  async function duplicate(id: string) {
    setBusy(id);
    setError(null);
    // fetch original
    const { data: orig, error: e1 } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();
    if (e1) {
      setBusy(null);
      return setError(e1.message);
    }
    const copy = { ...orig };
    delete copy.id;
    copy.title = (orig.title || "Copy") + " (Copy)";
    copy.slug = slugify(
      (orig.slug || "copy") + "-" + String(Date.now()).slice(-4)
    );
    copy.is_published = false;
    copy.updated_at = new Date().toISOString();

    const { data: inserted, error: e2 } = await supabase
      .from("sites")
      .insert(copy)
      .select("id")
      .single();
    if (e2) {
      setBusy(null);
      return setError(e2.message);
    }

    // copy joins (categories, regions)
    const { error: rpcErr } = await supabase.rpc("clone_site_taxonomies", {
      p_from_site: id,
      p_to_site: inserted!.id,
    });
    // (Optional) ignore silently but log for diagnostics
    if (rpcErr) {
      console.warn("clone_site_taxonomies RPC failed:", rpcErr.message);
      // If you'd rather surface this, replace with: setError(rpcErr.message)
    }
    // NOTE: gallery/story not auto-copied (assets) — we keep it simple here.

    setBusy(null);
    router.push(`/admin/listings/${inserted!.id}`);
  }

  async function remove(id: string) {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    setBusy(id);
    setError(null);
    const { error } = await supabase.from("sites").delete().eq("id", id);
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-900 text-gray-300 px-6 pt-12">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 text-transparent bg-clip-text mb-6">
            Manage Listings
          </h1>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 border border-gray-700 rounded-md text-sm hover:bg-gray-800 transition-colors"
              >
                <FaArrowLeft />
                Back to Dashboard
              </Link>
            </div>
            <div className="flex gap-3">
              <SearchableDropdown
                options={categories}
                value={selectedCategory}
                onChange={setSelectedCategory}
                placeholder="All Categories"
              />
              <SearchableDropdown
                options={regions}
                value={selectedRegion}
                onChange={setSelectedRegion}
                placeholder="All Regions"
              />
              <input
                placeholder="Search by title or slug…"
                className="w-64 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className="px-4 py-2 rounded-md bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold shadow-lg hover:shadow-blue-500/30 transition-shadow duration-300 disabled:opacity-50"
                onClick={createNew}
                disabled={busy === "create"}
              >
                {busy === "create" ? "Creating…" : "+ New Listing"}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-md mb-4">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-10 text-gray-500">
              Loading listings…
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 backdrop-blur-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Title
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Slug
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Published
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400">
                      Updated
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/listings/${r.id}`}
                          className="text-blue-400 hover:underline"
                        >
                          {r.title || "Untitled"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{r.slug}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            r.is_published
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-gray-600/50 text-gray-400"
                          }`}
                        >
                          {r.is_published ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {r.updated_at
                          ? new Date(r.updated_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/listings/${r.id}`}
                            className="px-2.5 py-1.5 border border-blue-500/50 bg-blue-500/10 rounded-md text-blue-400 text-xs hover:bg-blue-500/20 transition-colors"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/heritage/${r.slug}`}
                            className="px-2.5 py-1.5 border border-gray-600 rounded-md text-xs hover:bg-gray-700 transition-colors"
                            target="_blank"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => duplicate(r.id)}
                            className="px-2.5 py-1.5 border border-gray-600 rounded-md text-xs hover:bg-gray-700 transition-colors disabled:opacity-50"
                            disabled={busy === r.id}
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => remove(r.id)}
                            className="px-2.5 py-1.5 border border-red-500/30 rounded-md text-red-400 text-xs hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            disabled={busy === r.id}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-gray-500"
                        colSpan={5}
                      >
                        No listings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
