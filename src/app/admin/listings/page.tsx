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
  deleted_at?: string | null; // soft-delete marker
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

// Custom Searchable Dropdown Component (Light UI)
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
        className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{selectedOption ? selectedOption.name : placeholder}</span>
        {value ? (
          <FaTimes
            className="text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <span className="text-slate-400">▾</span>
        )}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg">
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-slate-100 px-3 py-2 text-sm text-slate-800 border-b border-slate-200 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ul className="max-h-60 overflow-y-auto">
            {filteredOptions.map((option) => (
              <li
                key={option.id}
                className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer"
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

  // Data
  const [rowsActive, setRowsActive] = useState<SiteRow[]>([]);
  const [rowsDeleted, setRowsDeleted] = useState<SiteRow[]>([]);

  // UI state
  const [tab, setTab] = useState<"active" | "recycle">("active");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [regions, setRegions] = useState<FilterOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");

  // Hard-delete password modal state
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [targetDelete, setTargetDelete] = useState<{
    id: string;
    title: string | null;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const query = supabase
      .from("sites")
      .select(
        "id, title, slug, is_published, updated_at, deleted_at, site_categories(category_id), site_regions(region_id)"
      )
      .order("updated_at", { ascending: false })
      .limit(400);

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const all = (data as any[]) || [];
    setRowsActive(all.filter((r) => !r.deleted_at));
    setRowsDeleted(all.filter((r) => r.deleted_at));
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

  const sourceRows = tab === "active" ? rowsActive : rowsDeleted;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let filteredRows = sourceRows;

    if (selectedCategory) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_categories?.some(
          (sc: any) => sc.category_id === selectedCategory
        )
      );
    }

    if (selectedRegion) {
      filteredRows = filteredRows.filter((r: any) =>
        r.site_regions?.some((sr: any) => sr.region_id === selectedRegion)
      );
    }

    if (!needle) return filteredRows;

    return filteredRows.filter((r) =>
      [r.title ?? "", r.slug ?? ""].some((x) =>
        x.toLowerCase().includes(needle)
      )
    );
  }, [sourceRows, q, selectedCategory, selectedRegion, tab]);

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
    const { data: orig, error: e1 } = await supabase
      .from("sites")
      .select("*")
      .eq("id", id)
      .single();
    if (e1) {
      setBusy(null);
      return setError(e1.message);
    }
    const copy: any = { ...orig };
    delete copy.id;
    copy.title = (orig.title || "Copy") + " (Copy)";
    copy.slug = slugify(
      (orig.slug || "copy") + "-" + String(Date.now()).slice(-4)
    );
    copy.is_published = false;
    copy.updated_at = new Date().toISOString();
    copy.deleted_at = null;

    const { data: inserted, error: e2 } = await supabase
      .from("sites")
      .insert(copy)
      .select("id")
      .single();
    if (e2) {
      setBusy(null);
      return setError(e2.message);
    }

    const { error: rpcErr } = await supabase.rpc("clone_site_taxonomies", {
      p_from_site: id,
      p_to_site: inserted!.id,
    });
    if (rpcErr) {
      console.warn("clone_site_taxonomies RPC failed:", rpcErr.message);
    }

    setBusy(null);
    router.push(`/admin/listings/${inserted!.id}`);
  }

  // Soft delete -> move to recycle bin (deleted_at = now())
  async function remove(id: string) {
    if (
      !confirm(
        "Move this listing to Recycle Bin? It will be permanently deleted after 10 days."
      )
    )
      return;
    setBusy(id);
    setError(null);
    const { error } = await supabase
      .from("sites")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  }

  // Restore from recycle bin
  async function restore(id: string) {
    setBusy(id);
    setError(null);
    const { error } = await supabase
      .from("sites")
      .update({ deleted_at: null })
      .eq("id", id);
    setBusy(null);
    if (error) return setError(error.message);
    await load();
  }

  // Open password modal for hard delete
  function confirmPermanentDelete(id: string, title: string | null) {
    setTargetDelete({ id, title });
    setPwd("");
    setPwdError(null);
    setShowPwdModal(true);
  }

  // Verify admin password by re-authenticating current user, then hard-delete
  async function submitPermanentDelete() {
    if (!targetDelete) return;
    setPwdError(null);
    setPwdSubmitting(true);

    try {
      // Get current user to retrieve the email
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.email) {
        throw new Error("Unable to verify current user.");
      }

      // Re-authenticate using email + provided password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: pwd,
      });
      if (signInErr) {
        throw new Error("Incorrect password. Please try again.");
      }

      // Proceed with hard delete
      const { error: delErr } = await supabase
        .from("sites")
        .delete()
        .eq("id", targetDelete.id);
      if (delErr) {
        throw delErr;
      }

      // Cleanup + refresh
      setShowPwdModal(false);
      setTargetDelete(null);
      await load();
    } catch (e: any) {
      setPwdError(e.message || "Deletion failed.");
    } finally {
      setPwdSubmitting(false);
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-100/70 text-slate-800 px-6 pt-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-slate-900">
              Manage Listings
            </h1>
            <Link
              href="/admin"
              className="text-sm text-slate-600 hover:text-slate-800 hover:underline flex items-center gap-2"
            >
              <FaArrowLeft /> Back to Dashboard
            </Link>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === "active"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setTab("active")}
              >
                Active ({rowsActive.length})
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === "recycle"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => setTab("recycle")}
              >
                Recycle Bin ({rowsDeleted.length})
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4" />
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
                placeholder={`Search ${
                  tab === "active" ? "active" : "recycled"
                } by title or slug…`}
                className="w-64 bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {tab === "active" && (
                <button
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
                  onClick={createNew}
                  disabled={busy === "create"}
                >
                  {busy === "create" ? "Creating…" : "+ New Listing"}
                </button>
              )}
            </div>
          </div>

          {/* Errors */}
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <FaExclamationCircle />
              <span>{error}</span>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-10 text-slate-500">
              Loading listings…
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-600 w-14">
                      #
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Title
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Slug
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Published
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      {tab === "recycle" ? "Deleted" : "Updated"}
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3">
                        {tab === "active" ? (
                          <Link
                            href={`/admin/listings/${r.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {r.title || "Untitled"}
                          </Link>
                        ) : (
                          <span className="text-slate-800">
                            {r.title || "Untitled"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.slug}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            r.is_published
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {r.is_published ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {tab === "recycle"
                          ? r.deleted_at
                            ? new Date(r.deleted_at).toLocaleString()
                            : "—"
                          : r.updated_at
                          ? new Date(r.updated_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {tab === "active" ? (
                            <>
                              <Link
                                href={`/admin/listings/${r.id}`}
                                className="px-2.5 py-1.5 border border-blue-200 bg-blue-50 rounded-md text-blue-700 text-xs hover:bg-blue-100 transition-colors"
                              >
                                Edit
                              </Link>
                              <Link
                                href={`/heritage/${r.slug}`}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                                target="_blank"
                              >
                                View
                              </Link>
                              <button
                                onClick={() => duplicate(r.id)}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60"
                                disabled={busy === r.id}
                              >
                                Duplicate
                              </button>
                              <button
                                onClick={() => remove(r.id)}
                                className="px-2.5 py-1.5 border border-red-200 rounded-md text-red-700 bg-red-50 text-xs hover:bg-red-100 transition-colors disabled:opacity-60"
                                disabled={busy === r.id}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => restore(r.id)}
                                className="px-2.5 py-1.5 border border-emerald-200 rounded-md text-emerald-700 bg-emerald-50 text-xs hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                disabled={busy === r.id}
                              >
                                Restore
                              </button>
                              <button
                                onClick={() =>
                                  confirmPermanentDelete(r.id, r.title)
                                }
                                className="px-2.5 py-1.5 border border-red-200 rounded-md text-red-700 bg-red-50 text-xs hover:bg-red-100 transition-colors disabled:opacity-60"
                                disabled={busy === r.id}
                              >
                                Permanently Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-slate-500"
                        colSpan={6}
                      >
                        {tab === "active"
                          ? "No listings found."
                          : "Recycle Bin is empty."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Password Confirmation Modal */}
        {showPwdModal && targetDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => !pwdSubmitting && setShowPwdModal(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  Confirm Permanent Deletion
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  You are about to permanently delete{" "}
                  <span className="font-medium">
                    {targetDelete.title || "this listing"}
                  </span>
                  . This action cannot be undone.
                </p>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Enter your account password to continue
                  </label>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    className="mt-1 w-full rounded-md px-3 py-2 text-slate-900 placeholder-slate-400 bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                    placeholder="••••••••"
                    disabled={pwdSubmitting}
                  />
                  {pwdError && (
                    <div className="mt-2 text-sm text-red-600 flex items-center gap-2">
                      <FaExclamationCircle /> {pwdError}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowPwdModal(false)}
                    disabled={pwdSubmitting}
                    className="px-3 py-2 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitPermanentDelete}
                    disabled={pwdSubmitting || !pwd}
                    className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {pwdSubmitting ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
