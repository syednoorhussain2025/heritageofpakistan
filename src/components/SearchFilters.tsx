// src/components/SearchFilters.tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "./Icon";

export type FilterOptions = {
  categories: Option[];
  regions: Option[];
};
export type Filters = {
  name: string;
  categoryIds: string[];
  regionIds: string[];
  orderBy: string;
};
type Option = { id: string; name: string; icon_key: string | null };

const useClickOutside = (ref: any, handler: () => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

const MultiSelectDropdown = ({
  options,
  selectedIds,
  onChange,
  placeholder,
  exampleText,
}: {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  exampleText?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);
  useClickOutside(dropdownRef, () => setIsOpen(false));

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const selectedOptions = useMemo(
    () => options.filter((opt) => (selectedIds || []).includes(opt.id)),
    [options, selectedIds]
  );

  const toggleOption = (id: string) => {
    const currentIds = selectedIds || [];
    const newSelectedIds = currentIds.includes(id)
      ? currentIds.filter((sid) => sid !== id)
      : [...currentIds, id];
    onChange(newSelectedIds);
  };

  const displayLabel = useMemo(() => {
    if (!selectedOptions || selectedOptions.length === 0)
      return exampleText || "";
    if (selectedOptions.length === 1) return selectedOptions[0].name;
    return selectedOptions[0].name;
  }, [selectedOptions, exampleText]);

  const plusMoreTooltipLabel = useMemo(() => {
    if (!selectedOptions || selectedOptions.length <= 1) return "";
    return selectedOptions
      .slice(1)
      .map((opt) => opt.name)
      .join("\n");
  }, [selectedOptions]);

  return (
    <div className="relative group" ref={dropdownRef}>
      <div
        className={`relative border-b-2 transition-colors ${
          isOpen
            ? "border-[var(--brand-orange)]"
            : "border-gray-300 group-hover:border-[var(--brand-orange)]"
        }`}
      >
        <label className="block text-xs font-medium text-gray-500 pt-2">
          {placeholder}
        </label>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between text-left pt-1 pb-2"
        >
          <div
            className={`text-base truncate ${
              !selectedIds || selectedIds.length === 0
                ? "text-gray-400 font-normal"
                : "text-gray-900 font-semibold"
            }`}
          >
            {selectedOptions.length > 1 ? (
              <div className="flex items-center">
                <span className="truncate">{displayLabel},</span>
                <span
                  className="relative group/plus ml-1 flex-shrink-0"
                  title={plusMoreTooltipLabel}
                >{`+${selectedOptions.length - 1}`}</span>
              </div>
            ) : (
              displayLabel || "\u00A0"
            )}
          </div>
          <div className="flex items-center space-x-3">
            {selectedIds && selectedIds.length > 0 && (
              <div
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300 transition-colors"
                title="Clear selection"
              >
                <Icon name="times" size={10} />
              </div>
            )}
            <Icon name="chevron-down" size={16} className="text-gray-500" />
          </div>
        </button>
      </div>
      <div
        className={`absolute left-0 right-0 z-20 mt-2 bg-white rounded-xl shadow-xl transition-all duration-300 ease-in-out ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full px-2 py-1.5 text-sm transition-colors rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] ${
              searchTerm ? "bg-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
          />
        </div>
        <ul className="py-2 max-h-60 overflow-auto">
          {filteredOptions.map((opt) => (
            <li
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className={`px-3 py-2 cursor-pointer transition-colors font-explore-dropdown-item ${
                selectedIds && selectedIds.includes(opt.id)
                  ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-semibold"
                  : "hover:bg-gray-50"
              }`}
            >
              {opt.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

interface SearchFiltersProps {
  filters: Filters;
  onFilterChange: (newFilters: Partial<Filters>) => void;
  onSearch: () => void;
}

export default function SearchFilters({
  filters,
  onFilterChange,
  onSearch,
}: SearchFiltersProps) {
  const [options, setOptions] = useState<FilterOptions>({
    categories: [],
    regions: [],
  });
  const [activeTab, setActiveTab] = useState<"filters" | "cats" | "regs">(
    "filters"
  );
  const [catSearch, setCatSearch] = useState("");
  const [regSearch, setRegSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: cat }, { data: reg }] = await Promise.all([
        supabase.from("categories").select("id,name,icon_key").order("name"),
        supabase.from("regions").select("id,name,icon_key").order("name"),
      ]);
      setOptions({
        categories: (cat as Option[]) || [],
        regions: (reg as Option[]) || [],
      });
    })();
  }, []);

  const filteredCategories = options.categories.filter((c) =>
    c.name.toLowerCase().includes(catSearch.toLowerCase())
  );
  const filteredRegions = options.regions.filter((r) =>
    r.name.toLowerCase().includes(regSearch.toLowerCase())
  );

  const handleCategoryClick = (id: string) => {
    onFilterChange({ categoryIds: [id], regionIds: [] });
  };

  const handleRegionClick = (id: string) => {
    onFilterChange({ regionIds: [id], categoryIds: [] });
  };

  const handleReset = () => {
    onFilterChange({
      name: "",
      categoryIds: [],
      regionIds: [],
      orderBy: "latest",
    });
  };

  return (
    <div className="p-4 bg-white h-full flex flex-col">
      {/* REMOVED border-b from this container */}
      <div className="flex gap-2 mb-4">
        {(["filters", "cats", "regs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`font-explore-tab px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
              activeTab === t
                ? "bg-[var(--brand-orange)] text-white border-[var(--brand-orange)]"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {t === "filters"
              ? "Filters"
              : t === "cats"
              ? "Categories"
              : "Regions"}
          </button>
        ))}
      </div>

      <div className="flex-grow min-h-0">
        {activeTab === "filters" && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-gray-500">
                Search by Name
              </label>
              <input
                type="text"
                value={filters.name}
                onChange={(e) => onFilterChange({ name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="e.g., Lahore Fort"
                className="w-full bg-transparent border-0 border-b-2 border-gray-300 hover:border-[var(--brand-orange)] focus:border-[var(--brand-orange)] focus:ring-0 focus:outline-none px-0 py-2 transition-colors font-explore-input"
              />
            </div>
            <MultiSelectDropdown
              options={options.categories}
              selectedIds={filters.categoryIds}
              onChange={(ids) => onFilterChange({ categoryIds: ids })}
              placeholder="Heritage Type"
              exampleText="e.g., Forts"
            />
            <MultiSelectDropdown
              options={options.regions}
              selectedIds={filters.regionIds}
              onChange={(ids) => onFilterChange({ regionIds: ids })}
              placeholder="Region"
              exampleText="e.g., Sindh"
            />
            <div>
              <label className="block text-xs font-medium text-gray-500">
                Order by
              </label>
              <select
                value={filters.orderBy}
                onChange={(e) => onFilterChange({ orderBy: e.target.value })}
                className="w-full bg-transparent border-0 border-b-2 border-gray-300 hover:border-[var(--brand-orange)] focus:border-[var(--brand-orange)] focus:ring-0 focus:outline-none px-0 py-2 transition-colors font-explore-input"
              >
                <option value="top">Top rated</option>
                <option value="latest">Latest</option>
                <option value="az">A–Z</option>
              </select>
            </div>
          </div>
        )}
        {activeTab === "cats" && (
          <div className="h-full flex flex-col">
            <input
              type="text"
              placeholder="Search categories..."
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm bg-gray-100 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F78300] font-explore-input flex-shrink-0"
            />
            {/* ADDED scrollbar-hide class */}
            <div className="space-y-1 overflow-y-auto scrollbar-hide">
              {filteredCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCategoryClick(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-center gap-2 ${
                    filters.categoryIds.includes(c.id)
                      ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Icon
                    name={c.icon_key || "folder"}
                    size={16}
                    className="text-gray-600"
                  />
                  <span className="font-explore-tab-item">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {activeTab === "regs" && (
          <div className="h-full flex flex-col">
            <input
              type="text"
              placeholder="Search regions..."
              value={regSearch}
              onChange={(e) => setRegSearch(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm bg-gray-100 rounded-md focus:outline-none focus:ring-1 focus:ring-[#F78300] font-explore-input flex-shrink-0"
            />
            {/* ADDED scrollbar-hide class */}
            <div className="space-y-1 overflow-y-auto scrollbar-hide">
              {filteredRegions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleRegionClick(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-center gap-2 ${
                    filters.regionIds.includes(r.id)
                      ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Icon
                    name={r.icon_key || "map"}
                    size={16}
                    className="text-gray-600"
                  />
                  <span className="font-explore-tab-item">{r.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* REMOVED border-t from this container */}
      <div className="flex gap-3 pt-4 mt-4 flex-shrink-0">
        <button
          onClick={onSearch}
          className="font-explore-button flex-1 py-2 rounded-xl bg-[var(--brand-orange)] hover:bg-[#E07500] text-white font-semibold shadow-sm transition-colors"
        >
          Search
        </button>
        <button
          onClick={handleReset}
          className="font-explore-button px-4 rounded-xl bg-white border shadow-sm text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2"
          title="Reset filters"
          type="button"
        >
          <Icon
            name="redo-alt"
            size={14}
            className="text-[var(--brand-orange)]"
          />{" "}
          Reset
        </button>
      </div>
    </div>
  );
}
