// src/components/TaxonomyManager.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal"; // Reusable icon picker

// --- TYPE DEFINITIONS ---
type Row = {
  id: string | number;
  name: string;
  slug: string | null;
  parent_id: string | number | null;
  description: string | null; // kept in type, not shown in UI
  sort_order: number | null;
  icon_key: string | null;
};

type IconRow = {
  name: string;
  svg_content: string;
};

type Props = {
  title: string;
  table: "categories" | "regions";
};

// --- UTILITY FUNCTIONS ---
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Lightweight UI helpers (no logic change)
const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span
    className={`inline-block ${className} animate-spin rounded-full border-2 border-slate-300 border-t-transparent`}
    aria-hidden="true"
  />
);

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-md bg-slate-200/80 ${className}`}
    aria-hidden="true"
  />
);

// --- Edit Pane Component ---
function EditPane({
  item,
  parentOptions,
  onSave,
  onCancel,
  onRemove,
  table,
  allIcons,
}: {
  item: Row;
  parentOptions: { id: Row["id"]; name: string }[];
  onSave: (patch: Partial<Row>) => void;
  onCancel: () => void;
  onRemove: (id: Row["id"]) => void;
  table: string;
  allIcons: IconRow[];
}) {
  const [local, setLocal] = useState<Row>(item);

  // Slug auto-sync control: false = keep syncing; true = user customized slug
  const [slugLocked, setSlugLocked] = useState<boolean>(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  useEffect(() => {
    setLocal(item);
    const customized = !!item.slug && item.slug !== slugify(item.name ?? "");
    setSlugLocked(customized);
  }, [item]);

  const handleSave = () => {
    const patch: Partial<Row> = {};
    (Object.keys(local) as Array<keyof Row>).forEach((key) => {
      if (local[key] !== item[key]) {
        (patch as any)[key] = local[key];
      }
    });

    // Normalize slug on save
    if (!patch.slug && !local.slug) {
      patch.slug = slugify(local.name);
    } else if (patch.slug) {
      patch.slug = slugify(patch.slug);
    }
    onSave(patch);
  };

  return (
    <>
      <IconPickerModal
        isOpen={isIconPickerOpen}
        onClose={() => setIsIconPickerOpen(false)}
        icons={allIcons}
        currentIcon={local.icon_key}
        onSelect={(iconName) => {
          setLocal({ ...local, icon_key: iconName });
          setIsIconPickerOpen(false);
        }}
      />
      <div className="p-6 space-y-6 bg-white rounded-2xl h-full flex flex-col shadow-xl shadow-slate-300/50 backdrop-blur-sm">
        {/* Slight horizontal padding inside content area */}
        <div className="flex-grow overflow-y-auto px-3 min-h-0">
          <h2 className="text-lg font-semibold text-slate-900">
            Editing: {item.name}
          </h2>
          <p className="text-sm text-slate-500">
            Make changes to your{" "}
            {table === "categories" ? "category" : "region"}.
          </p>

          <div className="mt-6 space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Name
              </label>
              <input
                className="w-full px-3 py-2 mt-1 text-slate-900 placeholder-slate-400 bg-slate-100 rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                value={local.name}
                onChange={(e) => {
                  const newName = e.target.value;
                  setLocal((prev) => ({
                    ...prev,
                    name: newName,
                    slug: slugLocked ? prev.slug : slugify(newName),
                  }));
                }}
              />
            </div>

            {/* Slug */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">
                  Slug
                </label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#F78300] hover:underline"
                  onClick={() => {
                    setSlugLocked(true); // deliberate action
                    setLocal((prev) => ({ ...prev, slug: slugify(prev.name) }));
                  }}
                  title="Generate slug from Name"
                >
                  Sync from Name
                </button>
              </div>
              <input
                className="w-full px-3 py-2 mt-1 text-slate-900 placeholder-slate-400 bg-slate-100 rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                value={local.slug ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSlugLocked(true); // manual edit => lock
                  setLocal({ ...local, slug: val });
                }}
              />
            </div>

            {/* Parent */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Parent
              </label>
              <select
                className="w-full px-3 py-2 mt-1 text-slate-900 bg-slate-100 rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                value={local.parent_id ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? null : e.target.value;
                  setLocal({ ...local, parent_id: val as any });
                }}
              >
                <option value="">— None —</option>
                {parentOptions
                  .filter((p) => p.id !== item.id)
                  .map((p) => (
                    <option key={p.id} value={p.id as any}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Icon */}
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Icon
              </label>
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className="w-full mt-1 flex items-center gap-3 px-3 py-2 text-slate-900 bg-slate-100 rounded-md shadow-sm border border-transparent hover:shadow focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
              >
                {local.icon_key ? (
                  <Icon
                    name={local.icon_key}
                    size={20}
                    className="text-[#F78300]"
                  />
                ) : (
                  <div className="w-5 h-5 bg-slate-200 rounded" />
                )}
                <span className="text-slate-600">
                  {local.icon_key || "Select an icon"}
                </span>
              </button>
            </div>

            {/* Description removed per request */}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-100 flex-shrink-0 px-3">
          <button
            className="px-4 py-2 text-sm font-semibold text-red-600 rounded-md hover:bg-red-50"
            onClick={() => onRemove(item.id)}
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// --- Main Component ---
export default function TaxonomyManager({ title, table }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [allIcons, setAllIcons] = useState<IconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<Row["id"] | null>(null);

  // Dynamically compute available height = viewport - header - a tiny bottom margin
  const [containerH, setContainerH] = useState<number | null>(null);
  useEffect(() => {
    const calc = () => {
      const headerEl =
        (document.querySelector("[data-app-header]") as HTMLElement) ||
        (document.querySelector("header") as HTMLElement) ||
        null;
      const headerH = headerEl ? headerEl.offsetHeight : 0;
      const bottomMargin = 8; // px — tiny breathing room
      const h = Math.max(320, window.innerHeight - headerH - bottomMargin);
      setContainerH(h);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: taxonomyData, error: taxonomyError },
      { data: iconData, error: iconError },
    ] = await Promise.all([
      supabase
        .from(table)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("icons").select("name, svg_content"),
    ]);

    if (taxonomyError) {
      console.error("Error loading data:", taxonomyError);
      alert(taxonomyError.message);
    } else {
      setRows((taxonomyData as Row[]) || []);
    }

    if (iconError) {
      console.error("Error loading icons:", iconError);
      alert(iconError.message);
    } else {
      setAllIcons((iconData as IconRow[]) || []);
    }

    setLoading(false);
  }, [table]);

  useEffect(() => {
    load();
  }, [load]);

  const parentOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    const filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.slug ?? "").toLowerCase().includes(needle)
    );
    const parentIds = new Set(filtered.map((r) => r.parent_id).filter(Boolean));
    return rows.filter(
      (r) => filtered.some((f) => f.id === r.id) || parentIds.has(r.id)
    );
  }, [rows, q]);

  const selectedItem = useMemo(
    () => rows.find((r) => r.id === selectedId),
    [rows, selectedId]
  );

  async function createItem() {
    const baseName = "New " + (table === "categories" ? "Category" : "Region");
    const slug = slugify(baseName) + "-" + String(Date.now()).slice(-8);
    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .insert({ name: baseName, slug } as any)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    const newItem = data as Row;
    setRows([...rows, newItem]);
    setSelectedId(newItem.id);
  }

  async function updateItem(patch: Partial<Row>) {
    if (!selectedId || Object.keys(patch).length === 0) {
      setSelectedId(null);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .update(patch)
      .eq("id", selectedId)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    setRows(rows.map((r) => (r.id === selectedId ? (data as Row) : r)));
    setSelectedId(null);
  }

  async function removeItem(id: Row["id"]) {
    if (
      !confirm(
        "Are you sure you want to delete this item? This action cannot be undone."
      )
    )
      return;
    setSaving(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setSaving(false);
    if (error) return alert(error.message);
    setRows(rows.filter((r) => r.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  }

  function TreeLine({ r, level = 0 }: { r: Row; level?: number }) {
    const children = rows.filter((x) => x.parent_id === r.id);
    const isSelected = selectedId === r.id;

    return (
      <div className="space-y-1">
        <div
          onClick={() => setSelectedId(r.id)}
          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
            isSelected ? "bg-blue-50 shadow" : "hover:bg-slate-50"
          }`}
          style={{ paddingLeft: `${0.5 + level * 1.5}rem` }}
        >
          <div className="flex items-center gap-2">
            {r.icon_key ? (
              <Icon name={r.icon_key} size={16} className="text-[#F78300]" />
            ) : (
              <div className="w-4 h-4 rounded bg-slate-200" />
            )}
            <span className="font-medium text-slate-900">{r.name}</span>
          </div>
        </div>

        {children.length > 0 && (
          <div>
            {children
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((c) => (
                <TreeLine key={c.id} r={c} level={level + 1} />
              ))}
          </div>
        )}
      </div>
    );
  }

  const rootItems = useMemo(
    () =>
      filteredRows
        .filter((r) => r.parent_id == null)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [filteredRows]
  );

  // Choose the manager icon per table
  const managerIconKey = table === "categories" ? "categorytax" : "regiontax";

  return (
    <AdminGuard>
      {/* Outer wrapper constrained to viewport minus header; prevents page scroll */}
      <div
        className="bg-slate-100/70 p-6 md:p-8 md:px-10 pb-0 overflow-hidden"
        style={containerH ? { height: containerH } : undefined}
      >
        <div className="max-w-7xl mx-auto h-full text-slate-800 overflow-hidden">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4 h-full min-h-0">
            {/* Left column */}
            <div className="space-y-4 md:col-span-1 lg:col-span-1 flex flex-col h-full min-h-0">
              <h1 className="text-2xl font-bold text-slate-900 flex-shrink-0 flex items-center gap-2">
                {/* Dark grey icon in the title area */}
                <Icon
                  name={managerIconKey}
                  size={22}
                  className="text-slate-700"
                />
                {title}
              </h1>

              {/* Back to Admin BELOW the title (grey) */}
              <Link
                href="/admin"
                className="text-sm text-slate-500 hover:text-slate-700 hover:underline flex items-center gap-1"
              >
                ← Back to Admin
              </Link>

              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder-slate-400 bg-white rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                />
                <button
                  className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md whitespace-nowrap hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
                  onClick={createItem}
                  disabled={saving}
                >
                  {saving ? (
                    <Spinner />
                  ) : (
                    <span className="leading-none">＋</span>
                  )}
                  <span>Add New</span>
                </button>
              </div>

              {/* Scrollable sidepane */}
              <div className="flex-1 p-2 space-y-1 bg-white rounded-2xl overflow-y-auto min-h-0 shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                {loading ? (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : rootItems.length > 0 ? (
                  // Divider between first-level categories/regions only
                  rootItems.map((r, idx) => (
                    <div
                      key={r.id}
                      className={`pb-1 mb-1 ${
                        idx < rootItems.length - 1
                          ? "border-b border-slate-100"
                          : ""
                      }`}
                    >
                      <TreeLine r={r} />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm text-center text-slate-500">
                    No items found.
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="md:col-span-2 lg:col-span-3 h-full min-h-0 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-full p-8 bg-white rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-4">
                    <Spinner className="w-8 h-8" />
                    <p className="text-slate-600 text-sm">Loading editor…</p>
                    <div className="w-80 space-y-3 mt-2">
                      <Skeleton className="h-6" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-24" />
                    </div>
                  </div>
                </div>
              ) : selectedItem ? (
                <EditPane
                  item={selectedItem}
                  parentOptions={parentOptions}
                  onSave={updateItem}
                  onCancel={() => setSelectedId(null)}
                  onRemove={removeItem}
                  table={table}
                  allIcons={allIcons}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-8 text-center bg-white rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                  <div className="text-slate-500 flex flex-col items-center">
                    {/* Light grey icon above helper text in right content area */}
                    <Icon
                      name={managerIconKey}
                      size={64}
                      className="text-slate-300 mb-3"
                    />
                    <h3 className="text-lg font-medium text-slate-800">
                      Select an item to edit
                    </h3>
                    <p className="mt-1 text-sm">
                      Choose an item from the list on the left to make changes,
                      or add a new one.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
