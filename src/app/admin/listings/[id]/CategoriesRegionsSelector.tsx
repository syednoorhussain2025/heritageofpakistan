"use client";

import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";

/**
 * Heritage Categories & Regions (multi-select) WITH inline management.
 * - Two searchable multi-selects side by side.
 * - A "Manage Taxonomies" modal to create/rename/delete Categories & Regions.
 * - Shows taxonomy icons in lists and selected chips.
 */
export default function CategoriesRegionsSelector({
  allCategories,
  allRegions,
  selectedCatIds,
  setSelectedCatIds,
  selectedRegionIds,
  setSelectedRegionIds,
  onTaxonomyChanged,
}: {
  allCategories: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  }>;
  allRegions: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  }>;
  selectedCatIds: string[];
  setSelectedCatIds: (ids: string[]) => void;
  selectedRegionIds: string[];
  setSelectedRegionIds: (ids: string[]) => void;
  onTaxonomyChanged: () => Promise<void> | void;
}) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-base font-semibold text-gray-900">
          Assign Categories & Regions
        </div>
        <button
          type="button"
          onClick={() => setIsManagerOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm font-medium"
        >
          Manage Taxonomies
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="text-base font-semibold mb-3 text-gray-900">
            Categories
          </div>
          <MultiSelect
            items={allCategories}
            selectedIds={selectedCatIds}
            setSelectedIds={setSelectedCatIds}
            labelKey="name"
          />
        </div>
        <div>
          <div className="text-base font-semibold mb-3 text-gray-900">
            Regions
          </div>
          <MultiSelect
            items={allRegions}
            selectedIds={selectedRegionIds}
            setSelectedIds={setSelectedRegionIds}
            labelKey="name"
          />
        </div>
      </div>

      {isManagerOpen && (
        <TaxonomyManagerModal
          categories={allCategories}
          regions={allRegions}
          onClose={() => setIsManagerOpen(false)}
          onMutated={async () => {
            await onTaxonomyChanged();
          }}
        />
      )}
    </>
  );
}

/* ---------- Local MultiSelect (shows icons) ---------- */

function MultiSelect({
  items,
  selectedIds,
  setSelectedIds,
  labelKey,
}: {
  items: Array<{ id: string; name: string; icon_key?: string | null }>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  labelKey: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.includes(it.id)),
    [items, selectedIds]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) =>
      String(item[labelKey]).toLowerCase().includes(q)
    );
  }, [items, searchQuery, labelKey]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  return (
    <div className="bg-white border border-gray-300 rounded-md p-3">
      <input
        type="text"
        placeholder="Search…"
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-gray-200">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm flex items-center gap-2"
            >
              {item.icon_key ? (
                <Icon name={item.icon_key} className="w-3.5 h-3.5 text-white" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full bg-white/40" />
              )}
              <span>{item[labelKey] as string}</span>
              <button
                onClick={() => toggle(item.id)}
                className="text-indigo-100 hover:text-white font-bold"
                aria-label="Remove"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="max-h-60 overflow-auto space-y-2">
        {filteredItems.map((it) => (
          <label
            key={it.id}
            className="flex items-center gap-3 text-sm cursor-pointer p-1 rounded-md hover:bg-gray-100"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
              checked={selectedIds.includes(it.id)}
              onChange={() => toggle(it.id)}
            />
            {it.icon_key ? (
              <Icon name={it.icon_key} className="w-4 h-4 text-[#F78300]" />
            ) : (
              <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
            )}
            <span className="text-gray-800">{it[labelKey] as string}</span>
          </label>
        ))}
        {filteredItems.length === 0 && (
          <div className="text-sm text-gray-500 p-2">
            No items match your search.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Inline Manager Modal (CRUD + slug + icon) ---------- */

function TaxonomyManagerModal({
  categories,
  regions,
  onClose,
  onMutated,
}: {
  categories: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  }>;
  regions: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  }>;
  onClose: () => void;
  onMutated: () => Promise<void> | void;
}) {
  type Tab = "categories" | "regions";
  const [tab, setTab] = useState<Tab>("categories");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | "">("");
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allIcons, setAllIcons] = useState<
    Array<{ name: string; svg_content: string }>
  >([]);

  // Borrow slugify utility from TaxonomyManager
  function slugify(s: string) {
    return s
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }
  // Ensure uniqueness against DB (handles UNIQUE index on slug)
  async function uniqueSlug(table: "categories" | "regions", base: string) {
    let candidate = slugify(base);
    let n = 1;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("slug", candidate)
        .limit(1);
      if (error) break;
      if (!data || data.length === 0) return candidate;
      n += 1;
      candidate = `${slugify(base)}-${n}`;
    }
    return `${slugify(base)}-${Date.now()}`; // fallback
  }

  useEffect(() => {
    // load icons like manager does
    (async () => {
      const { data, error } = await supabase
        .from("icons")
        .select("name, svg_content");
      if (!error) setAllIcons(data || []);
    })();
  }, []);

  const activeList = tab === "categories" ? categories : regions;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter((x) => x.name.toLowerCase().includes(q));
  }, [search, activeList]);

  const table = tab === "categories" ? "categories" : "regions";

  async function createItem() {
    const nm = name.trim();
    if (!nm) {
      alert("Please enter a name.");
      return;
    }
    setSaving(true);
    const slug = await uniqueSlug(table, nm); // ← FIX: satisfy NOT NULL and uniqueness
    const payload: any = { name: nm, slug };
    if (parentId) payload.parent_id = parentId;
    if (iconKey) payload.icon_key = iconKey;

    const { error } = await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    // reset local inputs and refresh parent
    setName("");
    setParentId("");
    setIconKey(null);
    await onMutated();
  }

  async function renameItem(id: string, nextName: string) {
    const nm = nextName.trim();
    if (!nm) return;
    const { error } = await supabase
      .from(table)
      .update({ name: nm })
      .eq("id", id);
    if (error) return alert(error.message);
    await onMutated();
  }

  async function deleteItem(id: string) {
    if (
      !confirm(
        "Delete this item? Sites linked to it will simply lose this link."
      )
    )
      return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return alert(error.message);
    await onMutated();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      {/* panel */}
      <div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200">
        <div className="p-4 sm:p-6">
          {/* header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="text-lg font-semibold text-gray-900">
              Manage Taxonomies
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onClose}
                className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm"
              >
                Close
              </button>
            </div>
          </div>

          {/* tabs */}
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden mb-4">
            {(["categories", "regions"] as const).map((k) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => {
                    setTab(k);
                    setSearch("");
                    setName("");
                    setParentId("");
                    setIconKey(null);
                  }}
                  className={`px-4 py-2 text-sm font-medium ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {k === "categories" ? "Categories" : "Regions"}
                </button>
              );
            })}
          </div>

          {/* quick add */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder={`New ${
                  tab === "categories" ? "category" : "region"
                } name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">
                  {tab === "categories"
                    ? "No parent (top level)"
                    : "No parent (top level)"}
                </option>
                {activeList.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>

              {/* icon picker trigger */}
              <button
                type="button"
                onClick={() => setIsIconPickerOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                title="Choose icon"
              >
                {iconKey ? (
                  <Icon name={iconKey} className="w-4 h-4 text-[#F78300]" />
                ) : (
                  <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
                )}
                <span className="text-sm">{iconKey || "Pick Icon"}</span>
              </button>

              <button
                onClick={createItem}
                disabled={saving}
                className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 font-medium disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          {/* icon picker modal */}
          <IconPickerModal
            isOpen={isIconPickerOpen}
            onClose={() => setIsIconPickerOpen(false)}
            icons={allIcons}
            currentIcon={iconKey}
            onSelect={(iconName) => {
              setIconKey(iconName);
              setIsIconPickerOpen(false);
            }}
          />

          {/* search + list */}
          <div className="mb-3">
            <input
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={`Search ${
                tab === "categories" ? "categories" : "regions"
              }…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-700 w-[55%]">
                    Name
                  </th>
                  <th className="text-left p-3 font-semibold text-gray-700">
                    Parent
                  </th>
                  <th className="text-right p-3 font-semibold text-gray-700 w-[200px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtered.map((x) => (
                  <RowEditable
                    key={x.id}
                    row={x}
                    all={activeList}
                    onRename={(newName) => renameItem(x.id as string, newName)}
                    onDelete={() => deleteItem(x.id as string)}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-gray-500 text-center">
                      No items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowEditable({
  row,
  all,
  onRename,
  onDelete,
}: {
  row: {
    id: string | number;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  };
  all: Array<{ id: string | number; name: string }>;
  onRename: (next: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.name);

  return (
    <tr>
      <td className="p-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            <button
              onClick={async () => {
                await onRename(val);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 text-sm font-medium"
            >
              Save
            </button>
            <button
              onClick={() => {
                setVal(row.name);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-gray-900">
            {row.icon_key ? (
              <Icon name={row.icon_key} className="w-4 h-4 text-[#F78300]" />
            ) : (
              <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
            )}
            {row.name}
          </span>
        )}
      </td>
      <td className="p-3">
        <span className="text-gray-700">
          {row.parent_id
            ? all.find((a) => a.id === row.parent_id)?.name ?? "—"
            : "—"}
        </span>
      </td>
      <td className="p-3 text-right">
        {!editing ? (
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm"
            >
              Rename
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-500 text-sm"
            >
              Delete
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
