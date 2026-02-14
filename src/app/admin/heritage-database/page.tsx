"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabase/browser";
import Icon from "@/components/Icon";
import MasterSiteModal from "./MasterSiteModal";
import ResultsMapModal from "./ResultsMapModal";

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
type Region   = { id: string; name: string };
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
  const [addedFilter, setAddedFilter] = useState<"" | "yes" | "no">("");

  const [page, setPage] = useState(1);

  /* Data */
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [regions, setRegions]     = useState<Region[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<MasterSite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // maps for pills
  const [siteRegions, setSiteRegions] = useState<Record<string, string[]>>({});
  const [siteCategories, setSiteCategories] = useState<Record<string, string[]>>({});
  // map public_site_id -> title
  const [publicTitles, setPublicTitles] = useState<Record<string, string>>({});

  /* Modal state */
  const [editing, setEditing] = useState<MasterSite | null>(null);
  const [openModal, setOpenModal] = useState(false);

  /* Map modal state */
  const [openMap, setOpenMap] = useState(false);

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

    // If filtering by region, prefetch master_site_ids for that region
    let idFilter: string[] | null = null;
    if (regionFilter) {
      const { data: msr, error: e1 } = await supabase
        .schema("admin_core")
        .from("master_site_regions")
        .select("master_site_id")
        .eq("region_id", regionFilter);
      if (e1) {
        setRows([]); setTotal(0);
        setSiteRegions({}); setSiteCategories({});
        setPublicTitles({});
        setLoading(false);
        return;
      }
      idFilter = (msr || []).map((x: any) => x.master_site_id);
      if (!idFilter.length) {
        setRows([]); setTotal(0);
        setSiteRegions({}); setSiteCategories({});
        setPublicTitles({});
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
    if (addedFilter) query = query.eq("added_to_website", addedFilter === "yes");

    const { data, error, count } = await query;
    if (error) {
      setRows([]); setTotal(0);
      setSiteRegions({}); setSiteCategories({});
      setPublicTitles({});
      setLoading(false);
      return;
    }

    const list = (data || []) as MasterSite[];
    setRows(list);
    setTotal(count || 0);

    const ids = list.map((r) => r.id);

    // Pull joins for the current page to show pills
    if (ids.length) {
      const [msrRes, mscRes] = await Promise.all([
        supabase
          .schema("admin_core")
          .from("master_site_regions")
          .select("master_site_id, region_id")
          .in("master_site_id", ids),
        supabase
          .schema("admin_core")
          .from("master_site_categories")
          .select("master_site_id, category_id")
          .in("master_site_id", ids),
      ]);

      const regionNameById = new Map(regions.map((r) => [r.id, r.name]));
      const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

      const regMap: Record<string, string[]> = {};
      (msrRes.data || []).forEach((row: any) => {
        const n = regionNameById.get(row.region_id);
        if (!n) return;
        if (!regMap[row.master_site_id]) regMap[row.master_site_id] = [];
        regMap[row.master_site_id].push(n);
      });

      const catMap: Record<string, string[]> = {};
      (mscRes.data || []).forEach((row: any) => {
        const n = categoryNameById.get(row.category_id);
        if (!n) return;
        if (!catMap[row.master_site_id]) catMap[row.master_site_id] = [];
        catMap[row.master_site_id].push(n);
      });

      setSiteRegions(regMap);
      setSiteCategories(catMap);
    } else {
      setSiteRegions({});
      setSiteCategories({});
    }

    // Resolve public site titles for completed items
    const publicIds = list
      .filter((r) => r.added_to_website && r.public_site_id)
      .map((r) => r.public_site_id!) as string[];

    if (publicIds.length) {
      const { data: pubs } = await supabase
        .from("sites")
        .select("id, title")
        .in("id", publicIds);
      const map: Record<string, string> = {};
      (pubs || []).forEach((p: any) => { map[p.id] = p.title; });
      setPublicTitles(map);
    } else {
      setPublicTitles({});
    }

    setLoading(false);
  }, [
    q, provinceFilter, regionFilter, priorityFilter, unescoFilter, addedFilter,
    page, regions, categories,
  ]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, provinceFilter, regionFilter, priorityFilter, unescoFilter, addedFilter]);

  /* Delete flow */
  async function handleDelete(id: string, name: string) {
    const ok = window.confirm(`Delete "${name}" from the Heritage Database? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(id);
    try {
      await supabase.schema("admin_core").from("master_site_regions").delete().eq("master_site_id", id);
      await supabase.schema("admin_core").from("master_site_categories").delete().eq("master_site_id", id);
      const { error } = await supabase.schema("admin_core").from("master_sites").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert(e.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  /* Pills */
  const Pills = ({
    values,
    variant = "default",
  }: {
    values: string[] | undefined;
    variant?: "default" | "white";
  }) => {
    if (!values || values.length === 0) return <span className="text-slate-400">—</span>;
    const shown = values.slice(0, 3);
    const extra = values.length - shown.length;
    const base =
      variant === "white"
        ? "bg-white text-slate-800 border border-slate-300"
        : "bg-slate-100 text-slate-800 border border-slate-200";
    const extraCls =
      variant === "white"
        ? "bg-white text-slate-500 border border-slate-300"
        : "bg-slate-100 text-slate-500 border border-slate-200";
    return (
      <div className="flex flex-wrap gap-1">
        {shown.map((v) => (
          <span
            key={v}
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${base}`}
          >
            {v}
          </span>
        ))}
        {extra > 0 && (
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${extraCls}`}>
            +{extra}
          </span>
        )}
      </div>
    );
  };

  /* Priority badge */
  const PriorityBadge = ({ value, isCompleted }: { value: "A" | "B" | "C"; isCompleted?: boolean }) => {
    if (value === "A") {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold">
          A
        </span>
      );
    }
    if (value === "B") {
      // Dark blue badge for B
      return (
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
          style={{ backgroundColor: "#0f2746" }}
        >
          B
        </span>
      );
    }
    // C: no badge, just the letter; adapt to row color
    return <span className={`${isCompleted ? "text-white" : "text-slate-800"} font-semibold`}>C</span>;
  };

  const startIndex = (page - 1) * PAGE_SIZE;
  const provincesById = useMemo(() => new Map(provinces.map(p => [p.id, p.name])), [provinces]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800">
      <main className="mx-auto max-w-7xl px-4 py-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-blue)" }}>
            Heritage Database
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenMap(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              title="Open map with current results"
            >
              <Icon name="adminmap" className="w-4 h-4 text-slate-700" />
              Open Map
            </button>
            <button
              onClick={() => { setEditing(null); setOpenModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white"
              style={{ backgroundColor: "#0f2746" }}
            >
              <Icon name="plus" className="w-4 h-4 text-white" />
              New Site
            </button>
          </div>
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
            onChange={(e) => setProvinceFilter(e.target.value ? Number(e.target.value) : "")}
            className="border border-slate-300 rounded-md px-3 py-2 bg-white"
          >
            <option value="">All provinces</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 bg-white"
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
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
            value={addedFilter}
            onChange={(e) => setAddedFilter(e.target.value as any)}
            className="border border-slate-300 rounded-md px-3 py-2 bg-white"
          >
            <option value="">Completed</option>
            <option value="yes">Completed: Yes</option>
            <option value="no">Completed: No</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-center w-14">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Province</th>
                <th className="px-3 py-2 text-left">Regions</th>
                <th className="px-3 py-2 text-left">Categories</th>
                <th className="px-3 py-2 text-center">Priority</th>
                <th className="px-3 py-2 text-center">UNESCO</th>
                <th className="px-3 py-2 text-center">Photographed</th>
                <th className="px-3 py-2 text-center">Completed</th>
                <th className="px-3 py-2 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-500">Loading…</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-500">No results.</td>
                </tr>
              )}
              {rows.map((r, idx) => {
                const isCompleted = r.added_to_website === true;
                const isPhotographedOnly = r.photographed === true && !r.added_to_website;

                // Completed rows: emerald background; photographed-only: soft yellow; otherwise default
                const rowBg =
                  isCompleted ? "bg-emerald-400" :
                  isPhotographedOnly ? "bg-yellow-50" :
                  "";

                const rowHover =
                  isCompleted || isPhotographedOnly ? "" : "hover:bg-slate-50/60";

                // Make plain text white on completed rows
                const rowTextCls = isCompleted ? "text-white" : "text-slate-800";

                return (
                  <tr
                    key={r.id}
                    className={`border-t last:border-b align-top ${rowBg} ${rowHover}`}
                  >
                    <td className={`px-3 py-2 text-center ${rowTextCls}`}>
                      {startIndex + idx + 1}
                    </td>

                    <td className="px-3 py-2">
                      <div className={`font-semibold ${rowTextCls}`}>{r.name}</div>
                    </td>

                    <td className={`px-3 py-2 ${rowTextCls}`}>
                      {provincesById.get(r.province_id) || "—"}
                    </td>

                    <td className="px-3 py-2">
                      <Pills
                        values={siteRegions[r.id]}
                        variant={isCompleted ? "white" : "default"}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <Pills
                        values={siteCategories[r.id]}
                        variant={isCompleted ? "white" : "default"}
                      />
                    </td>

                    <td className="px-3 py-2 text-center">
                      <PriorityBadge value={r.priority} isCompleted={isCompleted} />
                    </td>

                    <td className={`px-3 py-2 text-center ${rowTextCls}`}>
                      {r.unesco_status === "none"
                        ? "None"
                        : r.unesco_status === "inscribed"
                        ? "World Heritage"
                        : "Tentative"}
                    </td>

                    <td className={`px-3 py-2 text-center ${rowTextCls}`}>
                      {r.photographed ? "Yes" : "No"}
                    </td>

                    <td className={`px-3 py-2 text-center ${rowTextCls}`}>
                      {r.added_to_website
                        ? `Yes (${(r.public_site_id && publicTitles[r.public_site_id]) || "linked"})`
                        : "No"}
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setEditing(r); setOpenModal(true); }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 hover:bg-slate-50"
                          title="Edit"
                        >
                          <Icon name="edit" className="w-4 h-4 text-slate-700" />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id, r.name)}
                          disabled={deletingId === r.id}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Delete"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between p-3 border-t bg-slate-50">
            <div className="text-sm text-slate-600">
              Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))} • {total} total
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 border rounded-md disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="px-3 py-1.5 border rounded-md disabled:opacity-50"
                disabled={page >= Math.ceil(total / PAGE_SIZE)}
                onClick={() => setPage(p => p + 1)}
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
            onSaved={() => { setOpenModal(false); load(); }}
          />
        )}

        {openMap && (
          <ResultsMapModal
            onClose={() => setOpenMap(false)}
            points={rows
              .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
              .map(r => ({
                id: r.id,
                name: r.name,
                lat: Number(r.latitude),
                lng: Number(r.longitude),
                province: provincesById.get(r.province_id) || "",
                priority: r.priority,
                completed: r.added_to_website,
              }))}
          />
        )}
      </main>
    </div>
  );
}
