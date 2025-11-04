"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";
import Link from "next/link";
import MasterSiteModal from "./MasterSiteModal";

/* ---------- Types ---------- */
type MasterSite = {
  id: string;
  name: string;
  slug: string;
  province_id: number;
  latitude: number | null;
  longitude: number | null;
  priority: "A" | "B" | "C";
  unesco_status: "none" | "inscribed" | "tentative";
  visited: boolean;
  photographed: boolean;
  added_to_website: boolean;
  public_site_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Province = { id: number; name: string; slug: string };
type Region = { id: string; name: string };
type Category = { id: string; name: string };

const PAGE_SIZE = 50;

export default function HeritageDatabasePage() {
  return (
    <AdminGuard>
      <Main />
    </AdminGuard>
  );
}

function Main() {
  /* Filters/search/pagination */
  const [q, setQ] = useState("");
  const [provinceFilter, setProvinceFilter] = useState<number | "">("");
  const [regionFilter, setRegionFilter] = useState<string | "">("");
  const [priorityFilter, setPriorityFilter] = useState<"" | "A" | "B" | "C">("");
  const [unescoFilter, setUnescoFilter] =
    useState<"" | "none" | "inscribed" | "tentative">("");
  const [visitedFilter, setVisitedFilter] = useState<"" | "yes" | "no">("");
  const [addedFilter, setAddedFilter] = useState<"" | "yes" | "no">("");

  const [page, setPage] = useState(1);

  /* Data */
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<MasterSite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  /* Modal state */
  const [editing, setEditing] = useState<MasterSite | null>(null);
  const [openModal, setOpenModal] = useState(false);

  /* Load reference data (public schema) */
  useEffect(() => {
    (async () => {
      const [{ data: prov }, { data: reg }, { data: cat }] = await Promise.all([
        supabase.from("provinces").select("id, name, slug").order("name"),
        supabase.from("regions").select("id, name").order("name"),
        supabase.from("categories").select("id, name").order("name"),
      ]);
      setProvinces(prov || []);
      setRegions(reg || []);
      setCategories(cat || []);
    })();
  }, []);

  /* Load page results with filters (admin_core schema) */
  const load = useCallback(async () => {
    setLoading(true);

    // Pre-resolve IDs by region (if selected)
    let idFilter: string[] | null = null;
    if (regionFilter) {
      const { data: msr, error: e1 } = await supabase
        .schema("admin_core")
        .from("master_site_regions")
        .select("master_site_id")
        .eq("region_id", regionFilter);
      if (e1) {
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      idFilter = (msr || []).map((x: any) => x.master_site_id);
      if (!idFilter.length) {
        setRows([]);
        setTotal(0);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .schema("admin_core")
      .from("master_sites")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (idFilter) query = query.in("id", idFilter);
    if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
    if (provinceFilter !== "") query = query.eq("province_id", provinceFilter);
    if (priorityFilter) query = query.eq("priority", priorityFilter);
    if (unescoFilter) query = query.eq("unesco_status", unescoFilter);
    if (visitedFilter) query = query.eq("visited", visitedFilter === "yes");
    if (addedFilter) query = query.eq("added_to_website", addedFilter === "yes");

    const { data, error, count } = await query;
    if (!error) {
      setRows((data || []) as MasterSite[]);
      setTotal(count || 0);
    } else {
      setRows([]);
      setTotal(0);
    }
    setLoading(false);
  }, [
    q,
    provinceFilter,
    regionFilter,
    priorityFilter,
    unescoFilter,
    visitedFilter,
    addedFilter,
    page,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [
    q,
    provinceFilter,
    regionFilter,
    priorityFilter,
    unescoFilter,
    visitedFilter,
    addedFilter,
  ]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-6">
      <header className="flex items-center justify-between mb-4">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--brand-blue)" }}
        >
          Heritage Database
        </h1>
        <button
          onClick={() => {
            setEditing(null);
            setOpenModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md"
          style={{ backgroundColor: "#0f2746", color: "white" }}
        >
          <Icon name="plus" className="w-4 h-4 text-white" />
          New Site
        </button>
      </header>

      {/* Filters/Search */}
      <div className="grid grid-cols-1 xl:grid-cols-7 gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="xl:col-span-2 border border-slate-300 rounded-md px-3 py-2 bg-white"
        />

        <select
          value={provinceFilter}
          onChange={(e) =>
            setProvinceFilter(e.target.value ? Number(e.target.value) : "")
          }
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">All provinces</option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Region filter */}
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as any)}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Priority A/B/C</option>
          <option value="A">Priority A</option>
          <option value="B">Priority B</option>
          <option value="C">Priority C</option>
        </select>

        <select
          value={unescoFilter}
          onChange={(e) => setUnescoFilter(e.target.value as any)}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">UNESCO</option>
          <option value="none">None</option>
          <option value="inscribed">World Heritage List</option>
          <option value="tentative">Tentative List</option>
        </select>

        <select
          value={visitedFilter}
          onChange={(e) => setVisitedFilter(e.target.value as any)}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Visited</option>
          <option value="yes">Visited: Yes</option>
          <option value="no">Visited: No</option>
        </select>

        <select
          value={addedFilter}
          onChange={(e) => setAddedFilter(e.target.value as any)}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="">Added to Website</option>
          <option value="yes">Yes (linked)</option>
          <option value="no">No</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Province</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">UNESCO</th>
              <th className="px-3 py-2">Visited</th>
              <th className="px-3 py-2">Photographed</th>
              <th className="px-3 py-2">Added</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  No results.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t last:border-b hover:bg-slate-50/60"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="text-slate-500 text-xs">{r.slug}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="text-slate-800">
                    {provinces.find((p) => p.id === r.province_id)?.name || "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">{r.priority}</td>
                <td className="px-3 py-2 text-center">
                  {r.unesco_status === "none"
                    ? "None"
                    : r.unesco_status === "inscribed"
                    ? "World Heritage"
                    : "Tentative"}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.visited ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.photographed ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.added_to_website ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-center">
                  {new Date(r.updated_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => {
                      setEditing(r);
                      setOpenModal(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
                  >
                    <Icon name="edit" className="w-4 h-4 text-slate-700" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between p-3 border-t bg-slate-50">
          <div className="text-sm text-slate-600">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} • {total}{" "}
            total
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 border rounded-md disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              className="px-3 py-1.5 border rounded-md disabled:opacity-50"
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {openModal && (
        <MasterSiteModal
          initial={editing}
          provinces={provinces}
          allRegions={regions}
          allCategories={categories}
          onClose={() => setOpenModal(false)}
          onSaved={() => {
            setOpenModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
