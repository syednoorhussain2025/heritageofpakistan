// src/components/TaxonomyManager.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal"; // Import the reusable component

// --- TYPE DEFINITIONS ---
type Row = {
  id: string | number;
  name: string;
  slug: string | null;
  parent_id: string | number | null;
  description: string | null;
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
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  useEffect(() => {
    setLocal(item);
  }, [item]);

  const handleSave = () => {
    const patch: Partial<Row> = {};
    (Object.keys(local) as Array<keyof Row>).forEach((key) => {
      if (local[key] !== item[key]) {
        (patch as any)[key] = local[key];
      }
    });

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
      <div className="p-6 space-y-6 bg-gray-800 rounded-lg h-full flex flex-col">
        <div className="flex-grow overflow-y-auto pr-2">
          <h2 className="text-lg font-semibold text-white">
            Editing: {item.name}
          </h2>
          <p className="text-sm text-gray-400">
            Make changes to your{" "}
            {table === "categories" ? "category" : "region"}.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Name</label>
              <input
                className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={local.name}
                onChange={(e) => setLocal({ ...local, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">Slug</label>
              <input
                className="w-full px-3 py-2 mt-1 text-gray-300 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
                value={local.slug ?? ""}
                onChange={(e) => setLocal({ ...local, slug: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">
                Parent
              </label>
              <select
                className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
            <div>
              <label className="text-xs font-medium text-gray-400">Icon</label>
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className="w-full mt-1 flex items-center gap-3 px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-md hover:border-blue-500"
              >
                {local.icon_key ? (
                  <Icon name={local.icon_key} size={20} />
                ) : (
                  <div className="w-5 h-5 bg-gray-600 rounded" />
                )}
                <span className="text-gray-300">
                  {local.icon_key || "Select an icon"}
                </span>
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">
                Description (optional)
              </label>
              <textarea
                className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                value={local.description ?? ""}
                onChange={(e) =>
                  setLocal({ ...local, description: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-gray-700 flex-shrink-0">
          <button
            className="px-4 py-2 text-sm font-semibold text-red-400 rounded-md hover:bg-red-900/50"
            onClick={() => onRemove(item.id)}
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 text-sm font-semibold text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500"
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
          className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${
            isSelected ? "bg-blue-600/30" : "hover:bg-gray-700/50"
          }`}
          style={{ paddingLeft: `${0.5 + level * 1.5}rem` }}
        >
          <div className="flex items-center gap-2">
            {r.icon_key ? (
              <Icon name={r.icon_key} size={16} className="text-gray-400" />
            ) : (
              <div className="w-4 h-4 rounded bg-gray-700/50" />
            )}
            <span className="font-medium text-white">{r.name}</span>
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

  return (
    <AdminGuard>
      <div className="bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)] text-gray-200">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:grid-cols-4 h-full">
            <div className="space-y-4 md:col-span-1 lg:col-span-1 flex flex-col h-full">
              <h1 className="text-2xl font-bold text-white flex-shrink-0">
                {title}
              </h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-white placeholder-gray-400 bg-gray-800 border border-gray-700 rounded-md"
                />
                <button
                  className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md whitespace-nowrap hover:bg-blue-700 disabled:opacity-50"
                  onClick={createItem}
                  disabled={saving}
                >
                  + Add New
                </button>
              </div>

              <div className="flex-1 p-2 space-y-1 bg-gray-800/50 rounded-lg overflow-y-auto min-h-0">
                {loading ? (
                  <div className="text-center text-gray-400">Loading…</div>
                ) : rootItems.length > 0 ? (
                  rootItems.map((r) => <TreeLine key={r.id} r={r} />)
                ) : (
                  <div className="p-4 text-sm text-center text-gray-500">
                    No items found.
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3 h-full">
              {selectedItem ? (
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
                <div className="flex items-center justify-center h-full p-8 text-center bg-gray-800 rounded-lg">
                  <div className="text-gray-500">
                    <h3 className="text-lg font-medium text-gray-400">
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
