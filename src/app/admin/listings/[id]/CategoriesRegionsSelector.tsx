"use client";

import React, { useMemo, useState } from "react";

/**
 * Heritage Categories & Regions (multi-select)
 * - Two searchable multi-selects side by side.
 * - Mirrors the old in-file MultiSelect behavior.
 */
export default function CategoriesRegionsSelector({
  allCategories,
  allRegions,
  selectedCatIds,
  setSelectedCatIds,
  selectedRegionIds,
  setSelectedRegionIds,
}: {
  allCategories: Array<{ id: string; name: string }>;
  allRegions: Array<{ id: string; name: string }>;
  selectedCatIds: string[];
  setSelectedCatIds: (ids: string[]) => void;
  selectedRegionIds: string[];
  setSelectedRegionIds: (ids: string[]) => void;
}) {
  return (
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
  );
}

/* ---------- Local MultiSelect (self-contained) ---------- */

function MultiSelect({
  items,
  selectedIds,
  setSelectedIds,
  labelKey,
}: {
  items: any[];
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
        placeholder="Search..."
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
              <span>{item[labelKey]}</span>
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
            <span className="text-gray-800">{it[labelKey]}</span>
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
