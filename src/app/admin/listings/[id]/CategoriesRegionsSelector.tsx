"use client";

import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";

/**
 * Heritage Categories & Regions (multi-select) WITH inline management.
 * - Categories: drill-down hierarchical selector (full-panel per level).
 * - Regions: drill-down hierarchical selector (parents selectable).
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
          <CategoryDrilldownSelect
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

/* ---------- Category drill-down selector (full-panel per level) ---------- */

function CategoryDrilldownSelect({
  items,
  selectedIds,
  setSelectedIds,
  labelKey,
}: {
  items: Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    icon_key?: string | null;
  }>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  labelKey: string;
}) {
  // null = root (top-level categories where parent_id is null)
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const isAtRoot = !currentParentId;

  // Desired order for first-level categories (by name)
  const rootOrder = useMemo(
    () => [
      "Heritage Type",
      "Architectural Style",
      "Architectural Features",
      "Historical Period",
      "UNESCO Status",
    ],
    []
  );
  const rootOrderIndex = useMemo(() => {
    const m: Record<string, number> = {};
    rootOrder.forEach((name, idx) => {
      m[name] = idx;
    });
    return m;
  }, [rootOrder]);

  // Map for quick lookup (for breadcrumbs / parent chain)
  const categoryById = useMemo(() => {
    const map: Record<string, (typeof items)[number]> = {};
    for (const c of items) {
      map[c.id] = c;
    }
    return map;
  }, [items]);

  // Precompute which categories have children (for the drill-in arrow)
  const hasChildrenMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const c of items) {
      if (c.parent_id) {
        map[c.parent_id] = true;
      }
    }
    return map;
  }, [items]);

  // Selected chips (all levels) – exclude true top-level parents
  const selectedItems = useMemo(
    () =>
      items.filter(
        (it) =>
          selectedIds.includes(it.id) &&
          it.parent_id !== null &&
          typeof it.parent_id !== "undefined"
      ),
    [items, selectedIds]
  );

  // Group selected items under their top-level parent category
  const selectedGroupedByRoot = useMemo(() => {
    type Cat = (typeof items)[number];
    const groups: Record<
      string,
      {
        root: Cat;
        items: Cat[];
      }
    > = {};

    for (const item of selectedItems) {
      let cur: Cat | undefined = item;
      let root: Cat = item;

      // walk up to top-level parent
      while (cur && cur.parent_id) {
        const parent: Cat | undefined = categoryById[cur.parent_id];
        if (!parent) break;
        root = parent;
        cur = parent;
      }

      const rootId = String(root.id);
      if (!groups[rootId]) {
        groups[rootId] = { root, items: [] };
      }
      groups[rootId].items.push(item);
    }

    // sort groups by desired root order, then name
    const orderedGroups = Object.values(groups).sort((a, b) => {
      const ai =
        typeof rootOrderIndex[a.root.name] === "number"
          ? rootOrderIndex[a.root.name]
          : Number.MAX_SAFE_INTEGER;
      const bi =
        typeof rootOrderIndex[b.root.name] === "number"
          ? rootOrderIndex[b.root.name]
          : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.root.name.localeCompare(b.root.name);
    });

    // sort items inside each group alphabetically
    for (const g of orderedGroups) {
      g.items.sort((x, y) => x.name.localeCompare(y.name));
    }

    return orderedGroups;
  }, [selectedItems, categoryById, rootOrderIndex, items]);

  // Visible list on the current "screen"
  const visibleItems = useMemo(() => {
    let levelItems = items.filter((it) =>
      currentParentId ? it.parent_id === currentParentId : !it.parent_id
    );

    // At root, reorder according to desired order
    if (!currentParentId) {
      levelItems = [...levelItems].sort((a, b) => {
        const ai =
          typeof rootOrderIndex[a.name] === "number"
            ? rootOrderIndex[a.name]
            : Number.MAX_SAFE_INTEGER;
        const bi =
          typeof rootOrderIndex[b.name] === "number"
            ? rootOrderIndex[b.name]
            : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    }

    return levelItems;
  }, [items, currentParentId, rootOrderIndex]);

  // Search is applied only within the current level
  const filteredVisibleItems = useMemo(() => {
    if (!searchQuery.trim()) return visibleItems;
    const q = searchQuery.toLowerCase();
    return visibleItems.filter((item) =>
      String(item[labelKey]).toLowerCase().includes(q)
    );
  }, [visibleItems, searchQuery, labelKey]);

  // Breadcrumb path based on currentParentId
  const breadcrumb = useMemo(() => {
    if (!currentParentId) return [];
    const chain: (typeof items)[number][] = [];
    let cur: (typeof items)[number] | undefined = categoryById[currentParentId];
    while (cur) {
      chain.push(cur);
      if (!cur.parent_id) break;
      cur = categoryById[cur.parent_id];
    }
    return chain.reverse();
  }, [currentParentId, categoryById]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function goBackOneLevel() {
    if (!currentParentId) return;
    const current = categoryById[currentParentId];
    if (!current || !current.parent_id) {
      // back to root
      setCurrentParentId(null);
    } else {
      // back to parent of current
      setCurrentParentId(current.parent_id);
    }
    setSearchQuery("");
  }

  function drillInto(id: string) {
    setCurrentParentId(id);
    setSearchQuery("");
  }

  return (
    <div className="bg-white border border-gray-300 rounded-md p-3">
      {/* Header / breadcrumb for drill-down – fixed height to avoid layout shift */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={goBackOneLevel}
          disabled={isAtRoot}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 text-xs ${
            isAtRoot
              ? "invisible cursor-default"
              : "hover:bg-gray-100 cursor-pointer"
          }`}
        >
          <span className="text-sm">←</span>
          <span>Back</span>
        </button>
        <div className="flex-1 truncate text-xs text-gray-500">
          {isAtRoot
            ? "Top-level categories"
            : breadcrumb.map((b, idx) => (
                <span key={b.id}>
                  {idx > 0 && " / "}
                  {b.name}
                </span>
              ))}
        </div>
      </div>

      {/* Search within current level */}
      <input
        type="text"
        placeholder="Search in this level…"
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Panel for current level (full "screen" for this level) */}
      <div className="max-h-60 overflow-auto space-y-2 mb-3">
        {filteredVisibleItems.map((it) => {
          const hasChildren = !!hasChildrenMap[it.id];

          // ROOT LEVEL: not selectable, no checkbox, whole row drills in
          if (isAtRoot) {
            return (
              <div
                key={it.id}
                className="flex items-center gap-3 text-sm p-1 rounded-md hover:bg-gray-100 cursor-pointer"
                onClick={() => drillInto(it.id)}
              >
                {/* spacer to align with checkbox column of deeper levels */}
                <span className="w-4 h-4" />
                {it.icon_key ? (
                  <Icon name={it.icon_key} className="w-4 h-4 text-[#F78300]" />
                ) : (
                  <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
                )}
                <span className="text-gray-800 truncate flex-1">
                  {it[labelKey] as string}
                </span>
                {hasChildren && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-1 rounded-md text-gray-400 text-xs">
                    <span className="text-base leading-none">›</span>
                  </span>
                )}
              </div>
            );
          }

          // DEEPER LEVELS: selectable with checkbox, row toggles
          return (
            <div
              key={it.id}
              className="flex items-center gap-3 text-sm p-1 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => toggle(it.id)}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                checked={selectedIds.includes(it.id)}
                readOnly
                onClick={(e) => e.stopPropagation()}
              />
              {it.icon_key ? (
                <Icon name={it.icon_key} className="w-4 h-4 text-[#F78300]" />
              ) : (
                <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
              )}
              <span className="text-gray-800 truncate flex-1">
                {it[labelKey] as string}
              </span>

              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    drillInto(it.id);
                  }}
                  className="ml-2 inline-flex items-center justify-center px-2 py-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-xs"
                  title="View sub-categories"
                >
                  <span className="text-base leading-none">›</span>
                </button>
              )}
            </div>
          );
        })}

        {filteredVisibleItems.length === 0 && (
          <div className="text-sm text-gray-500 p-2">
            No categories found at this level.
          </div>
        )}
      </div>

      {/* Selected chips (all levels, excluding root parents) grouped by top-level parent BELOW selector */}
      {selectedItems.length > 0 && (
        <div className="pt-3 border-t border-gray-200 space-y-3">
          {selectedGroupedByRoot.map((group) => (
            <div key={group.root.id}>
              <div className="text-xs font-semibold text-gray-500 mb-1">
                {group.root.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span
                    key={item.id}
                    className="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm flex items-center gap-2"
                  >
                    {item.icon_key ? (
                      <Icon
                        name={item.icon_key}
                        className="w-3.5 h-3.5 text-white"
                      />
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Region drill-down MultiSelect (parents selectable) ---------- */

function MultiSelect({
  items,
  selectedIds,
  setSelectedIds,
  labelKey,
}: {
  items: Array<{
    id: string;
    name: string;
    icon_key?: string | null;
    parent_id?: string | null;
  }>;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  labelKey: string;
}) {
  // null = root (top-level regions where parent_id is null)
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const isAtRoot = !currentParentId;

  // Map for quick lookup (for breadcrumbs / parent chain)
  const regionById = useMemo(() => {
    const map: Record<string, (typeof items)[number]> = {};
    for (const r of items) {
      map[r.id] = r;
    }
    return map;
  }, [items]);

  // Precompute which regions have children
  const hasChildrenMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of items) {
      if (r.parent_id) {
        map[r.parent_id] = true;
      }
    }
    return map;
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((it) => selectedIds.includes(it.id)),
    [items, selectedIds]
  );

  // Visible list on the current "screen"
  const visibleItems = useMemo(
    () =>
      items
        .filter((it) =>
          currentParentId ? it.parent_id === currentParentId : !it.parent_id
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items, currentParentId]
  );

  // Search is applied only within the current level
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return visibleItems;
    const q = searchQuery.toLowerCase();
    return visibleItems.filter((item) =>
      String(item[labelKey]).toLowerCase().includes(q)
    );
  }, [visibleItems, searchQuery, labelKey]);

  // Breadcrumb path based on currentParentId
  const breadcrumb = useMemo(() => {
    if (!currentParentId) return [];
    const chain: (typeof items)[number][] = [];
    let cur: (typeof items)[number] | undefined = regionById[currentParentId];
    while (cur) {
      chain.push(cur);
      if (!cur.parent_id) break;
      cur = regionById[cur.parent_id];
    }
    return chain.reverse();
  }, [currentParentId, regionById]);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function goBackOneLevel() {
    if (!currentParentId) return;
    const current = regionById[currentParentId];
    if (!current || !current.parent_id) {
      // back to root
      setCurrentParentId(null);
    } else {
      // back to parent of current
      setCurrentParentId(current.parent_id);
    }
    setSearchQuery("");
  }

  function drillInto(id: string) {
    setCurrentParentId(id);
    setSearchQuery("");
  }

  return (
    <div className="bg-white border border-gray-300 rounded-md p-3">
      {/* Header / breadcrumb for drill-down – fixed height to avoid layout shift */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={goBackOneLevel}
          disabled={isAtRoot}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 bg-white text-gray-700 text-xs ${
            isAtRoot
              ? "invisible cursor-default"
              : "hover:bg-gray-100 cursor-pointer"
          }`}
        >
          <span className="text-sm">←</span>
          <span>Back</span>
        </button>
        <div className="flex-1 truncate text-xs text-gray-500">
          {isAtRoot
            ? "Top-level regions"
            : breadcrumb.map((b, idx) => (
                <span key={b.id}>
                  {idx > 0 && " / "}
                  {b.name}
                </span>
              ))}
        </div>
      </div>

      {/* Search within current level */}
      <input
        type="text"
        placeholder="Search in this level…"
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Panel for current level */}
      <div className="max-h-60 overflow-auto space-y-2 mb-3">
        {filteredItems.map((it) => {
          const hasChildren = !!hasChildrenMap[it.id];

          return (
            <div
              key={it.id}
              className="flex items-center gap-3 text-sm p-1 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => toggle(it.id)}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                checked={selectedIds.includes(it.id)}
                readOnly
                onClick={(e) => e.stopPropagation()}
              />
              {it.icon_key ? (
                <Icon name={it.icon_key} className="w-4 h-4 text-[#F78300]" />
              ) : (
                <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
              )}
              <span className="text-gray-800 truncate flex-1">
                {it[labelKey] as string}
              </span>

              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    drillInto(it.id);
                  }}
                  className="ml-2 inline-flex items-center justify-center px-2 py-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 text-xs"
                  title="View sub-regions"
                >
                  <span className="text-base leading-none">›</span>
                </button>
              )}
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-sm text-gray-500 p-2">
            No regions found at this level.
          </div>
        )}
      </div>

      {/* Selected region chips (all levels) */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
          {selectedItems
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <span
                key={item.id}
                className="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm flex items-center gap-2"
              >
                {item.icon_key ? (
                  <Icon
                    name={item.icon_key}
                    className="w-3.5 h-3.5 text-white"
                  />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg:white/40" />
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

  function slugify(s: string) {
    return s
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

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
    return `${slugify(base)}-${Date.now()}`;
  }

  useEffect(() => {
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
    const slug = await uniqueSlug(table, nm);
    const payload: any = { name: nm, slug };
    if (parentId) payload.parent_id = parentId;
    if (iconKey) payload.icon_key = iconKey;

    const { error } = await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
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
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full sm:max-w-4xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200">
        <div className="p-4 sm:p-6">
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
                      ? "bg-indigo-600 text:white text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {k === "categories" ? "Categories" : "Regions"}
                </button>
              );
            })}
          </div>

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
