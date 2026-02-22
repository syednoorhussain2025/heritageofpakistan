// src/components/SearchFilters.tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { withTimeout } from "@/lib/async/withTimeout";
import {
  clearPlacesNearby,
  isPlacesNearbyActive,
  type NearbyParams,
} from "@/lib/placesNearby";

/* ───────────────────────────── Types ───────────────────────────── */
export type FilterOptions = {
  categories: Option[];
  regions: Option[]; // top-level regions only
};

export type Filters = {
  name: string;
  categoryIds: string[];
  regionIds: string[];
  orderBy: string;
  centerSiteId?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
};

type Option = { id: string; name: string; icon_key: string | null };

type CategoryRow = {
  id: string;
  name: string;
  icon_key: string | null;
  parent_id: string | null;
  slug: string;
};

const FILTER_QUERY_TIMEOUT_MS = 12000;

/* ───────────────────────────── Small utils ───────────────────────────── */
const andJoin = (arr: string[]) =>
  arr.length <= 2
    ? arr.join(" & ")
    : `${arr.slice(0, -1).join(" & ")} & ${arr.slice(-1)[0]}`;
const km = (n?: number | null) => (n == null ? "" : `${Number(n)} km Radius`);

/** Robust square thumbnail URL builder for Supabase (public, signed, or raw key). */
function thumbUrl(input?: string | null, size = 48) {
  if (!input) return "";

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  let absolute = input;

  // If not an absolute URL, assume it's a storage key under object/public
  if (!/^https?:\/\//i.test(input)) {
    if (!SUPA_URL) return "";
    absolute = `${SUPA_URL}/storage/v1/object/public/${input.replace(
      /^\/+/,
      ""
    )}`;
  }

  // If it's not our Supabase project's URL, return as-is (external URL)
  const isSameProject = SUPA_URL && absolute.startsWith(SUPA_URL);
  if (!isSameProject) return absolute;

  // Convert object endpoint → render endpoint (supports public and sign)
  const PUBLIC_MARK = "/storage/v1/object/public/";
  const SIGN_MARK = "/storage/v1/object/sign/";

  let renderBase = "";
  let tail = "";

  if (absolute.includes(PUBLIC_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/public/`;
    tail = absolute.split(PUBLIC_MARK)[1];
  } else if (absolute.includes(SIGN_MARK)) {
    renderBase = `${SUPA_URL}/storage/v1/render/image/sign/`;
    tail = absolute.split(SIGN_MARK)[1];
  } else {
    // Not an object URL we recognize (maybe already a render URL, etc.) → return as-is
    return absolute;
  }

  const u = new URL(renderBase + tail);
  u.searchParams.set("width", String(size));
  u.searchParams.set("height", String(size));
  u.searchParams.set("resize", "cover");
  u.searchParams.set("quality", "75");
  return u.toString();
}

/** Collect all categories whose ancestry includes the given root id. */
function collectCategorySubtree(
  all: CategoryRow[],
  rootId: string,
  includeRoot = false
): CategoryRow[] {
  const parentById: Record<string, string | null> = {};
  all.forEach((c) => {
    parentById[c.id] = c.parent_id;
  });

  return all.filter((c) => {
    if (!includeRoot && c.id === rootId) return false;
    let cur: string | null = c.id;
    const seen = new Set<string>();
    while (cur) {
      if (cur === rootId) return true;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = parentById[cur] ?? null;
    }
    return false;
  });
}

/* ───────────────────────────── Click Outside Hook ───────────────────────────── */
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

/* ───────────────────────────── Key handlers for accessibility ───────────────────────────── */
function onKeyActivate(e: React.KeyboardEvent, fn: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

/* ───────────────────────────── Generic MultiSelect (Categories) ───────────────────────────── */
const MultiSelectDropdown = ({
  options,
  selectedIds,
  onChange,
  placeholder,
}: {
  options: Option[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
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
    const set = new Set(selectedIds || []);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange(Array.from(set));
  };

  const displayLabel = useMemo(() => {
    if (!selectedOptions || selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length === 1) return selectedOptions[0].name;
    return selectedOptions[0].name;
  }, [selectedOptions, placeholder]);

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
        className={`relative rounded-xl bg-white shadow-sm ring-1 transition-all
        ${
          isOpen
            ? "ring-[var(--brand-orange)] shadow-md"
            : "ring-gray-200 hover:ring-[var(--brand-orange)]"
        }`}
      >
        {/* OUTER: div role=button (was button) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => onKeyActivate(e, () => setIsOpen(!isOpen))}
          className="w-full flex items-center justify-between text-left px-3 py-2.5 cursor-pointer"
        >
          <div
            className={`text-sm truncate
            ${
              !selectedIds || selectedIds.length === 0
                ? "text-gray-500 font-normal"
                : "text-[var(--dark-grey)] font-semibold"
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

          <div className="flex items-center gap-2 pl-2">
            {selectedIds && selectedIds.length > 0 && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange([]);
                  }
                }}
                className="w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] hover:bg-white transition-colors"
                title="Clear selection"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-gray-400 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Dropdown panel */}
      <div
        className={`absolute left-0 right-0 z-20 mt-2 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 transition-all duration-200 ease-out
        ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
          />
        </div>
        <ul className="py-1.5 max-h-60 overflow-auto text-sm">
          {filteredOptions.map((opt) => (
            <li
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className={`px-3 py-1.5 cursor-pointer transition-colors font-explore-dropdown-item
              ${
                selectedIds && selectedIds.includes(opt.id)
                  ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-semibold"
                  : "hover:bg-[var(--ivory-cream)]"
              } text-[var(--dark-grey)]`}
            >
              {opt.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ───────────────────────────── Helpers for Region Selection ───────────────────────────── */
function applyRegionToggle(
  currentIds: string[],
  toggleId: string,
  parentOf: Record<string, string | null>
) {
  const parent = parentOf[toggleId] ?? toggleId;
  const isTop = (parentOf[toggleId] ?? toggleId) === toggleId;

  const set = new Set(currentIds);

  if (isTop) {
    if (set.has(toggleId)) {
      set.delete(toggleId);
      return Array.from(set);
    }

    // Selecting a parent means "whole parent region":
    // clear any selected subregions under it to avoid ambiguous broad+narrow state.
    for (const id of Array.from(set)) {
      if ((parentOf[id] ?? id) === toggleId && id !== toggleId) {
        set.delete(id);
      }
    }
    set.add(toggleId);
    return Array.from(set);
  }

  if (set.has(toggleId)) {
    set.delete(toggleId);
    return Array.from(set);
  }

  // Selecting a subregion should narrow under its parent,
  // so remove the parent-wide selection if present.
  set.delete(parent);
  set.add(toggleId);
  return Array.from(set);
}

/* ───────────────────────────── Regions: Two-Dropdown Flow ───────────────────────────── */
const TopLevelRegionSelect = ({
  topRegions,
  activeParentId,
  setActiveParentId,
  selectedIds,
  onClearAll,
  onToggleWithRule,
  regionNames,
  regionParents,
}: {
  topRegions: Option[];
  activeParentId: string | null;
  setActiveParentId: (id: string | null) => void;
  selectedIds: string[];
  onClearAll: () => void;
  onToggleWithRule: (id: string) => void;
  regionNames: Record<string, string>;
  regionParents: Record<string, string | null>;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    {
      id: string;
      name: string;
      icon_key: string | null;
      parent_id: string | null;
    }[]
  >([]);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setIsOpen(false));

  useEffect(() => {
    let active = true;
    (async () => {
      const q = term.trim();
      if (q.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const { data } = await supabase
        .from("regions")
        .select("id,name,icon_key,parent_id")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(40);
      if (!active) return;
      setSearching(false);
      setResults(
        ((data || []) as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          icon_key: r.icon_key,
          parent_id: r.parent_id,
        }))
      );
    })();
    return () => {
      active = false;
    };
  }, [term]);

  const label = useMemo(() => {
    if (activeParentId) return regionNames[activeParentId] ?? "Region";
    if (selectedIds.length === 1) {
      const id = selectedIds[0];
      const p = regionParents[id];
      if (p && p !== id) {
        const sub = regionNames[id] ?? "Subregion";
        const parent = regionNames[p] ?? "Parent";
        return `${sub}, ${parent}`;
      }
      return regionNames[id] ?? "Region";
    }
    return "Region";
  }, [activeParentId, selectedIds, regionNames, regionParents]);

  return (
    <div className="relative group" ref={ref}>
      <div
        className={`relative rounded-xl bg-white shadow-sm ring-1 transition-all ${
          isOpen
            ? "ring-[var(--brand-orange)] shadow-md"
            : "ring-gray-200 hover:ring-[var(--brand-orange)]"
        }`}
      >
        {/* OUTER: div role=button (was button) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => onKeyActivate(e, () => setIsOpen(!isOpen))}
          className="w-full flex items-center justify-between text-left px-3 py-2.5 cursor-pointer"
        >
          <div
            className={`text-sm truncate ${
              selectedIds.length || activeParentId
                ? "text-[var(--dark-grey)] font-semibold"
                : "text-gray-500"
            }`}
          >
            {label}
          </div>
          <div className="flex items-center gap-2 pl-2">
            {(selectedIds.length > 0 || activeParentId) && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearAll();
                  }
                }}
                className="w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] hover:bg-white transition-colors"
                title="Clear"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-gray-400 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Panel */}
      <div
        className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 transition-all duration-200 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search regions…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
          />
        </div>

        <div className="py-1.5 max-h-72 overflow-auto text-sm">
          {term.trim().length >= 2 ? (
            searching ? (
              <div className="px-3 py-1.5 text-xs text-gray-500">
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-gray-500">
                No regions found
              </div>
            ) : (
              <ul>
                {results.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => {
                      onToggleWithRule(r.id);
                      setActiveParentId(r.parent_id ?? r.id);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-1.5 cursor-pointer hover:bg-[var(--ivory-cream)] ${
                      selectedIds.includes(r.id)
                        ? "text-[var(--brand-orange)] font-semibold"
                        : "text-[var(--dark-grey)]"
                    }`}
                  >
                    {r.name}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul>
              {topRegions.map((top) => {
                const isSelected = selectedIds.includes(top.id);
                return (
                  <li
                    key={top.id}
                    onClick={() => {
                      onToggleWithRule(top.id);
                      setActiveParentId(top.id);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 hover:bg-[var(--ivory-cream)] ${
                      isSelected
                        ? "text-[var(--brand-orange)] font-semibold"
                        : "text-[var(--dark-grey)]"
                    }`}
                  >
                    <Icon
                      name={top.icon_key || "map"}
                      size={14}
                      className="text-gray-400"
                    />
                    <span>{top.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const SubRegionSelect = ({
  parent,
  selectedIds,
  onToggleWithRule,
}: {
  parent: Option;
  selectedIds: string[];
  onToggleWithRule: (id: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [subs, setSubs] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setIsOpen(false));

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("regions")
        .select("id,name,icon_key")
        .eq("parent_id", parent.id)
        .order("name");
      if (!active) return;
      setLoading(false);
      if (!error) setSubs(((data || []) as Option[]) || []);
    })();
    return () => {
      active = false;
    };
  }, [parent.id]);

  const filtered = subs.filter((s) =>
    s.name.toLowerCase().includes(term.toLowerCase())
  );

  // Selected subregions under this parent
  const selectedForParent = useMemo(() => {
    const subIds = new Set(subs.map((s) => s.id));
    return selectedIds.filter((id) => subIds.has(id));
  }, [selectedIds, subs]);

  const labelText =
    selectedForParent.length > 0
      ? andJoin(
          selectedForParent
            .map((id) => subs.find((s) => s.id === id)?.name || "")
            .filter(Boolean) as string[]
        )
      : `All in “${parent.name}”`;

  const clearParentSubs = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation?.();
    subs.forEach((s) => {
      if (selectedIds.includes(s.id)) onToggleWithRule(s.id); // toggles each sub off
    });
  };

  return (
    <div className="relative group mt-2.5" ref={ref}>
      <div
        className={`relative rounded-xl bg-white shadow-sm ring-1 transition-all ${
          isOpen
            ? "ring-[var(--brand-orange)] shadow-md"
            : "ring-gray-200 hover:ring-[var(--brand-orange)]"
        }`}
      >
        {/* OUTER: div role=button (was button) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => onKeyActivate(e, () => setIsOpen(!isOpen))}
          className="w-full flex items-center justify-between text-left px-3 py-2.5 cursor-pointer"
        >
          <div className="text-sm truncate text-[var(--dark-grey)]">
            {labelText}
          </div>
          <div className="flex items-center gap-2">
            {selectedForParent.length > 0 && (
              <div
                role="button"
                tabIndex={0}
                onClick={clearParentSubs}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    clearParentSubs(e);
                  }
                }}
                className="w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors"
                title="Clear these subregions"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-gray-400 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Panel */}
      <div
        className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 transition-all duration-200 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search subregions…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
          />
        </div>

        <div className="py-1.5 max-h-72 overflow-auto text-sm">
          {loading ? (
            <div className="px-3 py-1.5 text-xs text-gray-500">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-gray-500">
              No subregions
            </div>
          ) : (
            <ul>
              {filtered.map((s) => {
                const active = selectedIds.includes(s.id);
                return (
                  <li
                    key={s.id}
                    onClick={() => onToggleWithRule(s.id)}
                    className={`px-3 py-1.5 cursor-pointer transition-colors flex items-center justify-between ${
                      active
                        ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] font-semibold"
                        : "hover:bg-[var(--ivory-cream)] text-[var(--dark-grey)]"
                    }`}
                  >
                    <span>{s.name}</span>
                    {active && (
                      <div
                        role="button"
                        tabIndex={0}
                        className="ml-2 w-5 h-5 rounded-full flex items-center justify-center ring-1 ring-current"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWithRule(s.id); // clears only this sub
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onToggleWithRule(s.id);
                          }
                        }}
                        title="Remove"
                      >
                        <Icon name="times" size={9} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────────── Location + Radius Filter ───────────────────────────── */
function buildLocationSummary(
  selectedIds: string[],
  regionNames: Record<string, string>,
  regionParents: Record<string, string | null>
) {
  if (!selectedIds.length) return null;

  if (selectedIds.length === 1) {
    const id = selectedIds[0];
    const parentId = regionParents[id] ?? id;
    if (parentId !== id) {
      const sub = regionNames[id] ?? "Subregion";
      const parent = regionNames[parentId] ?? "Region";
      return { title: `${sub}, ${parent}`, subtitle: "Tap to edit" };
    }
    return { title: regionNames[id] ?? "Region", subtitle: "Tap to edit" };
  }

  const parentIds = Array.from(
    new Set(selectedIds.map((id) => regionParents[id] ?? id))
  );
  const parentNames = parentIds
    .map((id) => regionNames[id] ?? "Region")
    .filter(Boolean);
  const subCount = selectedIds.filter((id) => (regionParents[id] ?? id) !== id)
    .length;

  if (subCount > 0) {
    return {
      title: `${subCount} subregion${subCount === 1 ? "" : "s"} selected`,
      subtitle: `${andJoin(parentNames)} · tap to edit`,
    };
  }

  return {
    title: `${parentIds.length} region${parentIds.length === 1 ? "" : "s"} selected`,
    subtitle: "Tap to edit",
  };
}

function LocationSearchTrigger({
  selectedIds,
  regionNames,
  regionParents,
  onOpen,
  onClear,
}: {
  selectedIds: string[];
  regionNames: Record<string, string>;
  regionParents: Record<string, string | null>;
  onOpen: () => void;
  onClear: () => void;
}) {
  const summary = buildLocationSummary(selectedIds, regionNames, regionParents);
  const hasSelection = Boolean(summary);

  return (
    <div className="relative group/location">
      <button
        type="button"
        onClick={onOpen}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-sm ${
          hasSelection
            ? "bg-[var(--brand-orange)]/5 border-[var(--brand-orange)]/40 hover:border-[var(--brand-orange)]"
            : "bg-white border-gray-200 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
        }`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
            hasSelection ? "bg-[var(--brand-orange)]/10" : "bg-gray-100"
          }`}
        >
          <Icon
            name="map-marker-alt"
            size={13}
            className={hasSelection ? "text-[var(--brand-orange)]" : "text-gray-400"}
          />
        </div>

        {summary ? (
          <div className="min-w-0 flex-1 text-left">
            <div className="font-medium text-gray-900 truncate text-xs leading-tight">
              {summary.title}
            </div>
            <div className="text-[0.65rem] text-gray-500 truncate leading-tight">
              {summary.subtitle}
            </div>
          </div>
        ) : (
          <span className="font-medium text-sm text-gray-600">Search Location</span>
        )}

        {hasSelection ? (
          <span className="relative ml-auto flex-shrink-0 group/clearx">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              className="w-5 h-5 rounded-full bg-white ring-1 ring-gray-300 flex items-center justify-center text-gray-400 hover:text-[var(--brand-orange)] hover:ring-[var(--brand-orange)]/40 transition-colors"
            >
              <Icon name="times" size={8} />
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[0.65rem] rounded-md whitespace-nowrap opacity-0 group-hover/clearx:opacity-100 transition-opacity duration-150 z-50">
              Clear
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-900" />
            </span>
          </span>
        ) : (
          <Icon
            name="chevron-right"
            size={11}
            className="ml-auto text-gray-400 flex-shrink-0"
          />
        )}
      </button>

      {hasSelection ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[0.7rem] rounded-lg whitespace-nowrap opacity-0 group-hover/location:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
          Click to edit
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[0.7rem] rounded-lg whitespace-nowrap opacity-0 group-hover/location:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
          Select region and subregion filters
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

function buildHeritageTypeSummary(
  selectedIds: string[],
  options: Option[]
) {
  if (!selectedIds.length) return null;
  const names = selectedIds
    .map((id) => options.find((o) => o.id === id)?.name)
    .filter(Boolean) as string[];
  if (!names.length) return null;
  if (names.length === 1) return { title: names[0], subtitle: "Tap to edit" };
  return {
    title: `${names[0]} +${names.length - 1}`,
    subtitle: `${names.length} selected · tap to edit`,
  };
}

function HeritageTypeTrigger({
  selectedIds,
  options,
  onOpen,
  onClear,
}: {
  selectedIds: string[];
  options: Option[];
  onOpen: () => void;
  onClear: () => void;
}) {
  const summary = buildHeritageTypeSummary(selectedIds, options);
  const hasSelection = Boolean(summary);

  return (
    <div className="relative group/htype">
      <button
        type="button"
        onClick={onOpen}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-sm ${
          hasSelection
            ? "bg-[var(--brand-orange)]/5 border-[var(--brand-orange)]/40 hover:border-[var(--brand-orange)]"
            : "bg-white border-gray-200 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
        }`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
            hasSelection ? "bg-[var(--brand-orange)]/10" : "bg-gray-100"
          }`}
        >
          <Icon
            name="landmark"
            size={12}
            className={hasSelection ? "text-[var(--brand-orange)]" : "text-gray-400"}
          />
        </div>

        {summary ? (
          <div className="min-w-0 flex-1 text-left">
            <div className="font-medium text-gray-900 truncate text-xs leading-tight">
              {summary.title}
            </div>
            <div className="text-[0.65rem] text-gray-500 truncate leading-tight">
              {summary.subtitle}
            </div>
          </div>
        ) : (
          <span className="font-medium text-sm text-gray-600">Heritage Type</span>
        )}

        {hasSelection ? (
          <span className="relative ml-auto flex-shrink-0 group/clearx">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              className="w-5 h-5 rounded-full bg-white ring-1 ring-gray-300 flex items-center justify-center text-gray-400 hover:text-[var(--brand-orange)] hover:ring-[var(--brand-orange)]/40 transition-colors"
            >
              <Icon name="times" size={8} />
            </span>
          </span>
        ) : (
          <Icon
            name="chevron-right"
            size={11}
            className="ml-auto text-gray-400 flex-shrink-0"
          />
        )}
      </button>
    </div>
  );
}

function HeritageTypeModal({
  isOpen,
  onClose,
  options,
  selectedIds,
  onToggle,
  onApply,
  onClear,
}: {
  isOpen: boolean;
  onClose: () => void;
  options: Option[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) setTerm("");
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [term, options]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-modal="true"
      role="dialog"
      aria-label="Heritage Type"
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 flex flex-col transition-all duration-200 ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-2"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center">
              <Icon name="landmark" size={13} className="text-[var(--brand-orange)]" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Heritage Type</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
            aria-label="Close"
          >
            <Icon name="times" size={12} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 flex-1 min-h-0">
          <input
            type="text"
            placeholder="Search heritage type..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
          />
          <div className="rounded-xl border border-gray-200 overflow-hidden min-h-0 flex-1">
            <ul className="max-h-[320px] overflow-auto divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-500">No heritage type found</li>
              ) : (
                filtered.map((opt) => {
                  const active = selectedIds.includes(opt.id);
                  return (
                    <li
                      key={opt.id}
                      onClick={() => onToggle(opt.id)}
                      className={`px-3 py-2.5 cursor-pointer flex items-center justify-between ${
                        active
                          ? "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]"
                          : "hover:bg-[var(--ivory-cream)] text-[var(--dark-grey)]"
                      }`}
                    >
                      <span className="text-sm">{opt.name}</span>
                      {active ? <Icon name="check" size={12} /> : null}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        <div className="flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onApply}
            className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] hover:brightness-110 text-white font-semibold shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 text-sm flex items-center justify-center gap-2"
          >
            <Icon name="search" size={13} />
            Apply Heritage Type
          </button>
          <button
            onClick={onClear}
            className="px-4 rounded-xl bg-white ring-1 ring-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 text-xs transition-all"
            title="Clear heritage type"
          >
            <Icon name="redo-alt" size={12} className="text-[var(--brand-orange)]" />
            Clear
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SearchLocationModal({
  isOpen,
  onClose,
  topRegions,
  selectedIds,
  activeParentId,
  setActiveParentId,
  onClearAll,
  onToggleWithRule,
  onApply,
  onClear,
  regionNames,
  regionParents,
}: {
  isOpen: boolean;
  onClose: () => void;
  topRegions: Option[];
  selectedIds: string[];
  activeParentId: string | null;
  setActiveParentId: (id: string | null) => void;
  onClearAll: () => void;
  onToggleWithRule: (id: string) => void | Promise<void>;
  onApply: () => void;
  onClear: () => void;
  regionNames: Record<string, string>;
  regionParents: Record<string, string | null>;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-modal="true"
      role="dialog"
      aria-label="Search Location"
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-lg bg-white rounded-2xl shadow-2xl ring-1 ring-gray-200 flex flex-col transition-all duration-200 ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-2"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)]/10 flex items-center justify-center">
              <Icon
                name="map-marker-alt"
                size={14}
                className="text-[var(--brand-orange)]"
              />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Search Location</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
            aria-label="Close"
          >
            <Icon name="times" size={12} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">
              Region
            </label>
            <TopLevelRegionSelect
              topRegions={topRegions}
              activeParentId={activeParentId}
              setActiveParentId={setActiveParentId}
              selectedIds={selectedIds}
              onClearAll={onClearAll}
              onToggleWithRule={onToggleWithRule}
              regionNames={regionNames}
              regionParents={regionParents}
            />
          </div>

          {activeParentId && topRegions.find((t) => t.id === activeParentId) && (
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">
                Subregion
              </label>
              <SubRegionSelect
                parent={topRegions.find((t) => t.id === activeParentId)!}
                selectedIds={selectedIds}
                onToggleWithRule={onToggleWithRule}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onApply}
            className="flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] hover:brightness-110 text-white font-semibold shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 text-sm flex items-center justify-center gap-2"
          >
            <Icon name="search" size={13} />
            Apply Location
          </button>
          <button
            onClick={onClear}
            className="px-4 rounded-xl bg-white ring-1 ring-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 text-xs transition-all"
            title="Clear location filters"
          >
            <Icon name="redo-alt" size={12} className="text-[var(--brand-orange)]" />
            Clear
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function LocationRadiusFilter({
  value,
  onChange,
  onSitePicked,
}: {
  value: {
    centerSiteId?: string | null;
    centerLat?: number | null;
    centerLng?: number | null;
    radiusKm?: number | null;
  };
  onChange: (v: {
    centerSiteId?: string | null;
    centerLat?: number | null;
    centerLng?: number | null;
    radiusKm?: number | null;
  }) => void;
  onSitePicked?: (site: { id: string; title: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<
    {
      id: string;
      title: string;
      latitude: number | null;
      longitude: number | null;
      cover_photo_url?: string | null;
      location_free?: string | null;
    }[]
  >([]);

  // Local preview of the selected site for showing avatar + subtitle
  const [selectedPreview, setSelectedPreview] = useState<{
    id: string;
    title: string;
    subtitle?: string | null;
    cover?: string | null;
  } | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(boxRef, () => setOpen(false));

  // Rehydrate preview when centerSiteId exists initially or changes externally
  useEffect(() => {
    let active = true;
    (async () => {
      if (!value.centerSiteId) {
        setSelectedPreview(null);
        return;
      }
      // If we already have a matching preview, keep it
      if (selectedPreview?.id === value.centerSiteId) return;

      const { data, error } = await supabase
        .from("sites")
        .select("id,title,cover_photo_url,location_free,latitude,longitude")
        .eq("id", value.centerSiteId)
        .maybeSingle();

      if (!active) return;
      if (!error && data) {
        setSelectedPreview({
          id: data.id,
          title: data.title,
          subtitle: data.location_free ?? null,
          cover: data.cover_photo_url ?? null,
        });
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.centerSiteId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!open || query.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("sites")
        .select("id,title,latitude,longitude,cover_photo_url,location_free")
        .ilike("title", `%${query.trim()}%`)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("title")
        .limit(12);

      if (active) {
        if (!error) setResults(((data || []) as any) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, query]);

  const choose = (row: {
    id: string;
    title: string;
    latitude: number | null;
    longitude: number | null;
    cover_photo_url?: string | null;
    location_free?: string | null;
  }) => {
    if (row.latitude == null || row.longitude == null) return;

    // Persist filter state
    onChange({
      centerSiteId: row.id,
      centerLat: Number(row.latitude),
      centerLng: Number(row.longitude),
      radiusKm: value.radiusKm ?? 25,
    });
    onSitePicked?.({ id: row.id, title: row.title });

    // Store local preview for the selected box (image + subtitle)
    setSelectedPreview({
      id: row.id,
      title: row.title,
      subtitle: row.location_free ?? null,
      cover: row.cover_photo_url ?? null,
    });

    // Clear query and close dropdown
    setQuery("");
    setOpen(false);
  };

  const clearSelection = () => {
    onChange(clearPlacesNearby());
    onSitePicked?.(null);
    setSelectedPreview(null);
    setQuery("");
  };

  return (
    <div className="space-y-2.5 text-sm">
      <div ref={boxRef}>
        <div className="relative rounded-xl bg-white border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/30 focus-within:border-[var(--brand-orange)] transition-all">
          {/* Selected site box (thumbnail + title + subtitle) */}
          {selectedPreview ? (
            <div className="flex items-center gap-3 px-3 py-2.5">
              {/* Thumbnail with robust fallback */}
              {(() => {
                const raw = selectedPreview.cover || "";
                const thumb = thumbUrl(raw, 40);
                const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
                  /\/+$/,
                  ""
                );
                const absoluteFallback = /^https?:\/\//i.test(raw)
                  ? raw
                  : SUPA_URL
                  ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(
                      /^\/+/,
                      ""
                    )}`
                  : "";

                return (
                  <div className="relative w-9 h-9 flex-shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        aria-hidden="true"
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const t = e.currentTarget as HTMLImageElement;
                          if (absoluteFallback && t.src !== absoluteFallback) {
                            t.src = absoluteFallback;
                            return;
                          }
                          t.style.display = "none";
                          const ph = t.nextElementSibling as HTMLElement | null;
                          if (ph) ph.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      style={{ display: thumb ? "none" : "flex" }}
                      className="absolute inset-0 w-9 h-9 rounded-full bg-gray-100 ring-1 ring-gray-200 items-center justify-center text-gray-400"
                    >
                      <Icon name="image" size={13} />
                    </div>
                  </div>
                );
              })()}

              <div className="min-w-0 flex-1">
                <div className="text-[var(--dark-grey)] font-medium truncate text-sm">
                  {selectedPreview.title}
                </div>
                {selectedPreview.subtitle && (
                  <div className="text-xs text-gray-500 truncate">
                    {selectedPreview.subtitle}
                  </div>
                )}
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={clearSelection}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    clearSelection();
                  }
                }}
                className="mr-1 w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors"
                title="Clear"
              >
                <Icon name="times" size={9} />
              </div>
            </div>
          ) : (
            // Search input (when nothing selected)
            <div className="flex items-center">
              <Icon
                name="map-marker-alt"
                size={14}
                className="ml-3 mr-2 text-gray-400"
              />
              <input
                className="w-full px-2 py-2.5 rounded-xl bg-transparent outline-none text-gray-800 placeholder-gray-500 text-sm"
                placeholder="Search Around a Site"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
              />
              {query && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setQuery("")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setQuery("");
                    }
                  }}
                  className="mr-3 w-5 h-5 rounded-full bg-gray-100 ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors"
                  title="Clear"
                >
                  <Icon name="times" size={9} />
                </div>
              )}
            </div>
          )}

          {/* Dropdown */}
          <div
            className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-xl ring-1 ring-gray-100 transition-all duration-150 ${
              open
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {loading ? (
              <div className="px-4 py-2 text-xs text-gray-500">
                Searching…
              </div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="px-4 py-2 text-xs text-gray-500">
                No sites found
              </div>
            ) : (
              <ul className="max-h-64 overflow-auto py-1.5 divide-y divide-gray-100 text-sm">
                {results.map((r) => {
                  const raw = r.cover_photo_url || "";
                  const thumb = thumbUrl(raw, 40);
                  const SUPA_URL =
                    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
                  const absoluteFallback = /^https?:\/\//i.test(raw)
                    ? raw
                    : SUPA_URL
                    ? `${SUPA_URL}/storage/v1/object/public/${raw.replace(
                        /^\/+/,
                        ""
                      )}`
                    : "";

                  return (
                    <li
                      key={r.id}
                      onClick={() => choose(r)}
                      className="px-4 py-1.5 cursor-pointer hover:bg-[var(--ivory-cream)]"
                    >
                      <div className="flex items-center gap-3">
                        {/* Thumbnail with robust fallback */}
                        <div className="relative w-9 h-9 flex-shrink-0">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              aria-hidden="true"
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                const t = e.currentTarget as HTMLImageElement;
                                // First fallback: try absolute object URL
                                if (
                                  absoluteFallback &&
                                  t.src !== absoluteFallback
                                ) {
                                  t.src = absoluteFallback;
                                  return;
                                }
                                // Final fallback: hide the image and reveal placeholder
                                t.style.display = "none";
                                const ph =
                                  t.nextElementSibling as HTMLElement | null;
                                if (ph) ph.style.display = "flex";
                              }}
                            />
                          ) : null}
                          {/* Hidden placeholder to reveal if image fails */}
                          <div
                            style={{ display: thumb ? "none" : "flex" }}
                            className="absolute inset-0 w-9 h-9 rounded-full bg-gray-100 ring-1 ring-gray-200 items-center justify-center text-gray-400"
                          >
                            <Icon name="image" size={13} />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-[var(--dark-grey)] font-medium truncate">
                            {r.title}
                          </div>
                          {r.location_free && (
                            <div className="text-xs text-gray-500 truncate">
                              {r.location_free}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-0.5 block text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">
          Radius (km)
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 items-center">
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/40 px-3 py-1.5">
            <input
              type="range"
              min={1}
              max={300}
              step={1}
              value={value.radiusKm ?? 25}
              onChange={(e) =>
                onChange({ ...value, radiusKm: Number(e.target.value) })
              }
              className="w-full"
              disabled={!value.centerSiteId}
            />
          </div>
          <div className="w-24 rounded-xl bg-white shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/40 px-2.5 py-1.5">
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              value={value.radiusKm ?? 25}
              onChange={(e) =>
                onChange({
                  ...value,
                  radiusKm: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="w-full bg-transparent outline-none text-right text-xs"
              disabled={!value.centerSiteId}
            />
          </div>
        </div>
        <p className="mt-1 text-[0.7rem] text-gray-500">
          {value.centerSiteId
            ? `Searching within ${value.radiusKm ?? 25} km of the selected site.`
            : "Choose a site to enable radius search."}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── Inline RPC Helper ───────────────────────────── */
async function fetchSitesWithinRadius({
  lat,
  lng,
  radiusKm,
  name,
}: {
  lat: number;
  lng: number;
  radiusKm: number;
  name?: string | null;
}) {
  const { data, error } = await withTimeout(
    supabase.rpc("sites_within_radius", {
      center_lat: lat,
      center_lng: lng,
      radius_km: radiusKm,
      name_ilike: name ?? null,
    }),
    FILTER_QUERY_TIMEOUT_MS,
    "searchFilters.sitesWithinRadius"
  );

  if (error) {
    console.error("Error fetching sites within radius:", error);
    throw error;
  }
  return (data || []) as {
    id: string;
    title: string;
    latitude: number;
    longitude: number;
    distance_km: number; // used by cards
  }[];
}

/* ───────────────────────────── Exported helpers ───────────────────────────── */
export function hasRadius(f: Filters) {
  const p: NearbyParams = {
    centerSiteId: f.centerSiteId ?? null,
    centerLat: f.centerLat ?? null,
    centerLng: f.centerLng ?? null,
    radiusKm: f.radiusKm ?? null,
  };
  return isPlacesNearbyActive(p);
}

export async function fetchSitesByFilters(filters: Filters) {
  if (hasRadius(filters)) {
    const rows = await fetchSitesWithinRadius({
      lat: filters.centerLat as number,
      lng: filters.centerLng as number,
      radiusKm: filters.radiusKm as number,
      name: filters.name?.trim() || null,
    });
    rows.sort(
      (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)
    );
    return rows;
  }

  const qb = supabase
    .from("sites")
    .select("id,title,latitude,longitude,avg_rating,province_id")
    .eq("is_published", true)
    .is("deleted_at", null);

  if (filters.name?.trim()) qb.ilike("title", `%${filters.name.trim()}%`);
  if (filters.regionIds?.length) qb.in("province_id", filters.regionIds as any);

  qb.order("title", { ascending: true });
  const { data, error } = await withTimeout(
    qb,
    FILTER_QUERY_TIMEOUT_MS,
    "searchFilters.fetchSitesByFilters"
  );
  if (error) throw error;
  return data ?? [];
}

/* ───────────────────────────── Main Component ───────────────────────────── */
interface SearchFiltersProps {
  filters: Filters;
  onFilterChange: (newFilters: Partial<Filters>) => void;
  onSearch: () => void;
  onHeadingChange?: (title: string) => void;
  onOpenNearbyModal?: () => void;
}

type DomainTab =
  | "all"
  | "architecture"
  | "nature"
  | "cultural"
  | "archaeology";

export default function SearchFilters({
  filters,
  onFilterChange,
  onSearch,
  onHeadingChange,
  onOpenNearbyModal,
}: SearchFiltersProps) {
  const [options, setOptions] = useState<FilterOptions>({
    categories: [],
    regions: [],
  });
  const [topRegions, setTopRegions] = useState<Option[]>([]);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [draftRegionIds, setDraftRegionIds] = useState<string[]>([]);
  const [draftActiveParentId, setDraftActiveParentId] = useState<string | null>(
    null
  );
  const [isHeritageTypeModalOpen, setIsHeritageTypeModalOpen] = useState(false);
  const [draftHeritageTypeIds, setDraftHeritageTypeIds] = useState<string[]>(
    []
  );

  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);

  // Keep centerSiteTitle in sync whenever filters.centerSiteId changes externally
  useEffect(() => {
    let active = true;
    if (!filters.centerSiteId) {
      setCenterSiteTitle(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("sites")
        .select("id,title")
        .eq("id", filters.centerSiteId)
        .maybeSingle();
      if (active && data) setCenterSiteTitle(data.title);
    })();
    return () => {
      active = false;
    };
  }, [filters.centerSiteId]);

  const [regionNames, setRegionNames] = useState<Record<string, string>>({});
  const [regionParents, setRegionParents] = useState<
    Record<string, string | null>
  >({});

  const [subsByParent, setSubsByParent] = useState<Record<string, Option[]>>(
    {}
  );
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);

  const [domainTab, setDomainTab] = useState<DomainTab>("all");

  // All tab: Heritage Type & Historical Period
  const [heritageTypeOptions, setHeritageTypeOptions] = useState<Option[]>([]);
  const [historicalPeriodOptions, setHistoricalPeriodOptions] = useState<
    Option[]
  >([]);

  // Architecture tab
  const [architectureRootId, setArchitectureRootId] = useState<string | null>(
    null
  );
  const [architectureTypeOptions, setArchitectureTypeOptions] = useState<
    Option[]
  >([]);
  const [architecturalStyleOptions, setArchitecturalStyleOptions] = useState<
    Option[]
  >([]);
  const [architecturalFeatureOptions, setArchitecturalFeatureOptions] =
    useState<Option[]>([]);

  // Nature tab
  const [naturalRootId, setNaturalRootId] = useState<string | null>(null);
  const [naturalTypeOptions, setNaturalTypeOptions] = useState<Option[]>([]);

  // Cultural Landscape tab
  const [culturalRootId, setCulturalRootId] = useState<string | null>(null);
  const [culturalTypeOptions, setCulturalTypeOptions] = useState<Option[]>([]);

  // Archaeology tab
  const [archaeologyRootId, setArchaeologyRootId] = useState<string | null>(
    null
  );
  const [archaeologyTypeOptions, setArchaeologyTypeOptions] = useState<
    Option[]
  >([]);

  useEffect(() => {
    (async () => {
      const [{ data: cat }, { data: regTop }] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,icon_key,parent_id,slug")
          .order("sort_order", { ascending: true })
          .order("name"),
        supabase
          .from("regions")
          .select("id,name,icon_key")
          .is("parent_id", null)
          .order("name"),
      ]);

      const catsRaw = (cat || []) as any[];
      const cats: CategoryRow[] = catsRaw.map((c) => ({
        id: c.id,
        name: c.name,
        icon_key: c.icon_key,
        parent_id: c.parent_id,
        slug: c.slug,
      }));

      const top = (regTop as Option[]) || [];
      setOptions({ categories: cats as any, regions: top });
      setTopRegions(top);

      setRegionNames((m) => {
        const next = { ...m };
        top.forEach((t) => (next[t.id] = t.name));
        return next;
      });
      setRegionParents((m) => {
        const next = { ...m };
        top.forEach((t) => (next[t.id] = t.id));
        return next;
      });

      // Heritage Type subtree (for All tab)
      const heritageRoot = cats.find((c) => c.slug === "heritage-type");
      if (heritageRoot) {
        const subtree = collectCategorySubtree(cats, heritageRoot.id, false);
        setHeritageTypeOptions(
          subtree.map(({ id, name, icon_key }) => ({ id, name, icon_key }))
        );
      } else {
        setHeritageTypeOptions([]);
      }

      // Historical Period subtree (shared by All / Arch / Archaeology)
      const periodRoot = cats.find((c) => c.slug === "historical-period");
      if (periodRoot) {
        const subtree = collectCategorySubtree(cats, periodRoot.id, false);
        setHistoricalPeriodOptions(
          subtree.map(({ id, name, icon_key }) => ({ id, name, icon_key }))
        );
      } else {
        setHistoricalPeriodOptions([]);
      }

      // Architecture root
      const architectureRoot = cats.find((c) => c.slug === "architecture");
      if (architectureRoot) {
        setArchitectureRootId(architectureRoot.id);
        const archSubtree = collectCategorySubtree(
          cats,
          architectureRoot.id,
          false
        );
        setArchitectureTypeOptions(
          archSubtree.map(({ id, name, icon_key }) => ({ id, name, icon_key }))
        );
      } else {
        setArchitectureRootId(null);
        setArchitectureTypeOptions([]);
      }

      // Architectural Style root
      const styleRoot = cats.find((c) => c.slug === "architectural-style");
      if (styleRoot) {
        const styleSubtree = collectCategorySubtree(cats, styleRoot.id, false);
        setArchitecturalStyleOptions(
          styleSubtree.map(({ id, name, icon_key }) => ({
            id,
            name,
            icon_key,
          }))
        );
      } else {
        setArchitecturalStyleOptions([]);
      }

      // Architectural Features root
      const featureRoot = cats.find((c) => c.slug === "architectural-features");
      if (featureRoot) {
        const featureSubtree = collectCategorySubtree(
          cats,
          featureRoot.id,
          false
        );
        setArchitecturalFeatureOptions(
          featureSubtree.map(({ id, name, icon_key }) => ({
            id,
            name,
            icon_key,
          }))
        );
      } else {
        setArchitecturalFeatureOptions([]);
      }

      // Natural Heritage & Landscapes root (by slug OR name)
      const naturalRoot =
        cats.find((c) => c.slug === "natural-heritage-landscapes") ||
        cats.find((c) => c.name === "Natural Heritage & Landscapes");
      if (naturalRoot) {
        setNaturalRootId(naturalRoot.id);
        const naturalSubtree = collectCategorySubtree(
          cats,
          naturalRoot.id,
          false
        );
        setNaturalTypeOptions(
          naturalSubtree.map(({ id, name, icon_key }) => ({
            id,
            name,
            icon_key,
          }))
        );
      } else {
        setNaturalRootId(null);
        setNaturalTypeOptions([]);
      }

      // Cultural Landscape root (by slug OR name)
      const culturalRoot =
        cats.find((c) => c.slug === "cultural-landscape") ||
        cats.find(
          (c) =>
            c.name === "Cultural Landscape" ||
            c.name === "Cultural Landscapes"
        );
      if (culturalRoot) {
        setCulturalRootId(culturalRoot.id);
        const culturalSubtree = collectCategorySubtree(
          cats,
          culturalRoot.id,
          false
        );
        setCulturalTypeOptions(
          culturalSubtree.map(({ id, name, icon_key }) => ({
            id,
            name,
            icon_key,
          }))
        );
      } else {
        setCulturalRootId(null);
        setCulturalTypeOptions([]);
      }

      // Archaeology root (by slug OR name)
      const archaeologyRoot =
        cats.find((c) => c.slug === "archaeology") ||
        cats.find((c) => c.name === "Archaeology");
      if (archaeologyRoot) {
        setArchaeologyRootId(archaeologyRoot.id);
        const archaeologySubtree = collectCategorySubtree(
          cats,
          archaeologyRoot.id,
          false
        );
        setArchaeologyTypeOptions(
          archaeologySubtree.map(({ id, name, icon_key }) => ({
            id,
            name,
            icon_key,
          }))
        );
      } else {
        setArchaeologyRootId(null);
        setArchaeologyTypeOptions([]);
      }
    })();
  }, []);

  // Sets for grouping logic
  const heritageTypeIdSet = useMemo(
    () => new Set(heritageTypeOptions.map((c) => c.id)),
    [heritageTypeOptions]
  );
  const historicalPeriodIdSet = useMemo(
    () => new Set(historicalPeriodOptions.map((c) => c.id)),
    [historicalPeriodOptions]
  );
  const architectureTypeIdSet = useMemo(
    () => new Set(architectureTypeOptions.map((c) => c.id)),
    [architectureTypeOptions]
  );
  const architecturalStyleIdSet = useMemo(
    () => new Set(architecturalStyleOptions.map((c) => c.id)),
    [architecturalStyleOptions]
  );
  const architecturalFeatureIdSet = useMemo(
    () => new Set(architecturalFeatureOptions.map((c) => c.id)),
    [architecturalFeatureOptions]
  );
  const naturalTypeIdSet = useMemo(
    () => new Set(naturalTypeOptions.map((c) => c.id)),
    [naturalTypeOptions]
  );
  const culturalTypeIdSet = useMemo(
    () => new Set(culturalTypeOptions.map((c) => c.id)),
    [culturalTypeOptions]
  );
  const archaeologyTypeIdSet = useMemo(
    () => new Set(archaeologyTypeOptions.map((c) => c.id)),
    [archaeologyTypeOptions]
  );

  const loadSubregions = async (parentId: string) => {
    if (subsByParent[parentId]) return;
    const { data, error } = await supabase
      .from("regions")
      .select("id,name,icon_key")
      .eq("parent_id", parentId)
      .order("name");
    if (!error) {
      const rows = ((data || []) as Option[]) || [];
      setSubsByParent((m) => ({ ...m, [parentId]: rows }));
      setRegionNames((m) => {
        const next = { ...m };
        rows.forEach((r) => (next[r.id] = r.name));
        return next;
      });
      setRegionParents((m) => {
        const next = { ...m };
        rows.forEach((r) => (next[r.id] = parentId));
        return next;
      });
    }
  };


  const ensureRegionMetaForId = async (id: string) => {
    if (id in regionParents) return (regionParents[id] ?? id) as string;

    const { data } = await supabase
      .from("regions")
      .select("id,name,parent_id")
      .eq("id", id)
      .maybeSingle();

    if (!data) return id;

    setRegionNames((m) => ({ ...m, [id]: data.name }));
    const parentId = (data.parent_id ?? id) as string;
    setRegionParents((m) => ({ ...m, [id]: parentId }));
    return parentId;
  };

  // Toggle region with rule
  const onToggleWithRule = async (id: string) => {
    if (hasRadius(filters)) {
      onFilterChange({
        name: "",
        categoryIds: [],
        regionIds: [],
        orderBy: "latest",
        ...clearPlacesNearby(),
      });
    }

    const parentId = await ensureRegionMetaForId(id);
    const parentOf = id in regionParents ? regionParents : { ...regionParents, [id]: parentId };

    const next = applyRegionToggle(filters.regionIds || [], id, parentOf);
    onFilterChange({ regionIds: next });

    setActiveParentId(parentId);
    setExpandedParentId(parentId);
    await loadSubregions(parentId);
  };

  // Remove a parent region and any of its selected subregions
  const clearRegionParent = (parentId: string) => {
    const next = (filters.regionIds || []).filter(
      (id) => id !== parentId && (regionParents[id] ?? id) !== parentId
    );
    onFilterChange({ regionIds: next });
  };

  const openLocationModal = async () => {
    setIsLocationModalOpen(true);
    const currentIds = [...(filters.regionIds || [])];
    setDraftRegionIds(currentIds);

    if (!currentIds.length) {
      setDraftActiveParentId(null);
      return;
    }

    const parentId = await ensureRegionMetaForId(currentIds[0]);
    setDraftActiveParentId(parentId);
    await loadSubregions(parentId);
  };

  const toggleDraftRegionWithRule = async (id: string) => {
    const parentId = await ensureRegionMetaForId(id);
    const parentOf = id in regionParents ? regionParents : { ...regionParents, [id]: parentId };
    setDraftRegionIds((prev) => applyRegionToggle(prev, id, parentOf));
    setDraftActiveParentId(parentId);
    await loadSubregions(parentId);
  };

  const clearAllDraftRegions = () => {
    setDraftRegionIds([]);
    setDraftActiveParentId(null);
  };

  const applyDraftRegions = () => {
    if (hasRadius(filters)) {
      onFilterChange({
        name: "",
        categoryIds: [],
        regionIds: draftRegionIds,
        orderBy: "latest",
        ...clearPlacesNearby(),
      });
    } else {
      onFilterChange({ regionIds: draftRegionIds });
    }
    setActiveParentId(draftActiveParentId);
    setIsLocationModalOpen(false);
    onSearch();
  };

  const clearRegionSelection = () => {
    onFilterChange({ regionIds: [] });
    setActiveParentId(null);
    setExpandedParentId(null);
    setDraftActiveParentId(null);
    setDraftRegionIds([]);
    onSearch();
  };

  const resetSharedUi = () => {
    setActiveParentId(null);
    setExpandedParentId(null);
    setCenterSiteTitle(null);
  };

  const handleReset = () => {
    onFilterChange({
      name: "",
      categoryIds: [],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    });
    resetSharedUi();
    setDomainTab("all");
  };

  // All tab handlers
  const handleHeritageTypeChange = (ids: string[]) => {
    const current = filters.categoryIds || [];
    const preserved = current.filter((id) => !heritageTypeIdSet.has(id));
    onFilterChange({ categoryIds: [...preserved, ...ids] });
  };

  const openHeritageTypeModal = () => {
    let seedIds: string[];
    if (domainTab === "architecture") {
      seedIds = filters.categoryIds.filter((id) => architectureTypeIdSet.has(id));
    } else if (domainTab === "nature") {
      seedIds = filters.categoryIds.filter((id) => naturalTypeIdSet.has(id));
    } else if (domainTab === "cultural") {
      seedIds = filters.categoryIds.filter((id) => culturalTypeIdSet.has(id));
    } else if (domainTab === "archaeology") {
      seedIds = filters.categoryIds.filter((id) => archaeologyTypeIdSet.has(id));
    } else {
      seedIds = filters.categoryIds.filter((id) => heritageTypeIdSet.has(id));
    }
    setDraftHeritageTypeIds(seedIds);
    setIsHeritageTypeModalOpen(true);
  };

  const toggleDraftHeritageType = (id: string) => {
    setDraftHeritageTypeIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const applyDraftHeritageType = () => {
    if (domainTab === "architecture") {
      handleArchitectureTypeChange(draftHeritageTypeIds);
    } else if (domainTab === "nature") {
      handleNatureTypeChange(draftHeritageTypeIds);
    } else if (domainTab === "cultural") {
      handleCulturalTypeChange(draftHeritageTypeIds);
    } else if (domainTab === "archaeology") {
      handleArchaeologyTypeChange(draftHeritageTypeIds);
    } else {
      handleHeritageTypeChange(draftHeritageTypeIds);
    }
    setIsHeritageTypeModalOpen(false);
    onSearch();
  };

  const clearHeritageTypeSelection = () => {
    if (domainTab === "architecture") {
      handleArchitectureTypeChange([]);
    } else if (domainTab === "nature") {
      handleNatureTypeChange([]);
    } else if (domainTab === "cultural") {
      handleCulturalTypeChange([]);
    } else if (domainTab === "archaeology") {
      handleArchaeologyTypeChange([]);
    } else {
      handleHeritageTypeChange([]);
    }
    setDraftHeritageTypeIds([]);
    setIsHeritageTypeModalOpen(false);
    onSearch();
  };

  const handleHistoricalPeriodChange = (ids: string[]) => {
    const current = filters.categoryIds || [];
    const preserved = current.filter((id) => !historicalPeriodIdSet.has(id));
    onFilterChange({ categoryIds: [...preserved, ...ids] });
  };

  // Architecture tab: helper to rebuild all architecture-related category IDs
  const rebuildArchitectureCategoryIds = ({
    newTypeIds,
    newStyleIds,
    newFeatureIds,
    newPeriodIds,
  }: {
    newTypeIds?: string[];
    newStyleIds?: string[];
    newFeatureIds?: string[];
    newPeriodIds?: string[];
  }) => {
    const current = filters.categoryIds || [];

    const currentTypeIds = current.filter((id) =>
      architectureTypeIdSet.has(id)
    );
    const currentStyleIds = current.filter((id) =>
      architecturalStyleIdSet.has(id)
    );
    const currentFeatureIds = current.filter((id) =>
      architecturalFeatureIdSet.has(id)
    );
    const currentPeriodIds = current.filter((id) =>
      historicalPeriodIdSet.has(id)
    );

    const preserved = current.filter(
      (id) =>
        !architectureTypeIdSet.has(id) &&
        !architecturalStyleIdSet.has(id) &&
        !architecturalFeatureIdSet.has(id) &&
        !historicalPeriodIdSet.has(id) &&
        id !== architectureRootId
    );

    // Effective selections after update
    const nextType = newTypeIds ?? currentTypeIds;
    const nextStyle = newStyleIds ?? currentStyleIds;
    const nextFeature = newFeatureIds ?? currentFeatureIds;
    const nextPeriod = newPeriodIds ?? currentPeriodIds;

    let nextCats = [
      ...preserved,
      ...nextType,
      ...nextStyle,
      ...nextFeature,
      ...nextPeriod,
    ];

    // Deduplicate
    nextCats = Array.from(new Set(nextCats));

    // Include Architecture root ONLY when there are NO arch-specific selections.
    // If only Period is selected, keep root to constrain the domain to Architecture.
    const hasArchSpecific = nextType.length + nextStyle.length + nextFeature.length > 0;
    if (!hasArchSpecific && architectureRootId && !nextCats.includes(architectureRootId)) {
      nextCats.push(architectureRootId);
    }

    onFilterChange({ categoryIds: nextCats });
  };

  const handleArchitectureTypeChange = (ids: string[]) => {
    rebuildArchitectureCategoryIds({ newTypeIds: ids });
  };

  const handleArchitecturalStyleChange = (ids: string[]) => {
    rebuildArchitectureCategoryIds({ newStyleIds: ids });
  };

  const handleArchitecturalFeatureChange = (ids: string[]) => {
    rebuildArchitectureCategoryIds({ newFeatureIds: ids });
  };

  const handleArchitecturePeriodChange = (ids: string[]) => {
    rebuildArchitectureCategoryIds({ newPeriodIds: ids });
  };

  // Nature tab: helper to rebuild nature-related category IDs
  const rebuildNatureCategoryIds = ({
    newTypeIds,
  }: {
    newTypeIds?: string[];
  }) => {
    const current = filters.categoryIds || [];
    const currentTypeIds = current.filter((id) => naturalTypeIdSet.has(id));

    const preserved = current.filter(
      (id) => !naturalTypeIdSet.has(id) && id !== naturalRootId
    );

    const nextType = newTypeIds ?? currentTypeIds;

    let nextCats = [...preserved, ...nextType];
    nextCats = Array.from(new Set(nextCats));

    // Include Natural root ONLY when there are NO nature selections.
    if (nextType.length === 0 && naturalRootId && !nextCats.includes(naturalRootId)) {
      nextCats.push(naturalRootId);
    }

    onFilterChange({ categoryIds: nextCats });
  };

  const handleNatureTypeChange = (ids: string[]) => {
    rebuildNatureCategoryIds({ newTypeIds: ids });
  };

  // Cultural Landscape: helper
  const rebuildCulturalCategoryIds = ({
    newTypeIds,
  }: {
    newTypeIds?: string[];
  }) => {
    const current = filters.categoryIds || [];
    const currentTypeIds = current.filter((id) => culturalTypeIdSet.has(id));

    const preserved = current.filter(
      (id) => !culturalTypeIdSet.has(id) && id !== culturalRootId
    );

    const nextType = newTypeIds ?? currentTypeIds;

    let nextCats = [...preserved, ...nextType];
    nextCats = Array.from(new Set(nextCats));

    // Include Cultural root ONLY when there are NO cultural selections.
    if (nextType.length === 0 && culturalRootId && !nextCats.includes(culturalRootId)) {
      nextCats.push(culturalRootId);
    }

    onFilterChange({ categoryIds: nextCats });
  };

  const handleCulturalTypeChange = (ids: string[]) => {
    rebuildCulturalCategoryIds({ newTypeIds: ids });
  };

  // Archaeology: helper (type + period)
  const rebuildArchaeologyCategoryIds = ({
    newTypeIds,
    newPeriodIds,
  }: {
    newTypeIds?: string[];
    newPeriodIds?: string[];
  }) => {
    const current = filters.categoryIds || [];

    const currentTypeIds = current.filter((id) =>
      archaeologyTypeIdSet.has(id)
    );
    const currentPeriodIds = current.filter((id) =>
      historicalPeriodIdSet.has(id)
    );

    // Identify heritage-type "Archaeological Sites" (used as a default)
    const archHeritage = heritageTypeOptions.find(
      (c) => c.name === "Archaeological Sites"
    );
    const archHeritageId = archHeritage?.id;

    const preserved = current.filter(
      (id) =>
        !archaeologyTypeIdSet.has(id) &&
        !historicalPeriodIdSet.has(id) &&
        id !== archaeologyRootId &&
        id !== archHeritageId // drop broad heritage-type default once specific selections appear
    );

    const nextType = newTypeIds ?? currentTypeIds;
    const nextPeriod = newPeriodIds ?? currentPeriodIds;

    let nextCats = [...preserved, ...nextType, ...nextPeriod];
    nextCats = Array.from(new Set(nextCats));

    // Include an archaeology "anchor" ONLY when there is no archaeology TYPE selected.
    // If only Period is selected, keep the domain constrained to Archaeology via anchor.
    const hasArchaeologyType = nextType.length > 0;
    if (!hasArchaeologyType) {
      const anchorId = archaeologyRootId || archHeritageId || null;
      if (anchorId && !nextCats.includes(anchorId)) nextCats.push(anchorId);
    }

    onFilterChange({ categoryIds: nextCats });
  };

  const handleArchaeologyTypeChange = (ids: string[]) => {
    rebuildArchaeologyCategoryIds({ newTypeIds: ids });
  };

  const handleArchaeologyPeriodChange = (ids: string[]) => {
    rebuildArchaeologyCategoryIds({ newPeriodIds: ids });
  };

  /* ───────── Heading text builder ───────── */
  useEffect(() => {
    if (!onHeadingChange) return;

    const catNames = (options.categories as any[])
      .filter((c) => filters.categoryIds?.includes(c.id))
      .map((c) => c.name as string);

    if (hasRadius(filters)) {
      const types = catNames.length ? andJoin(catNames) + " " : "";
      const around = centerSiteTitle
        ? `around ${centerSiteTitle} `
        : "around selected site ";
      const title = `${types}${around}within ${km(filters.radiusKm)}`;
      onHeadingChange(title.trim());
      return;
    }

    const ids = filters.regionIds || [];
    if (!ids.length) {
      const fallback = catNames.length
        ? andJoin(catNames)
        : "All Heritage Sites";
      onHeadingChange(fallback);
      return;
    }

    const parentId = regionParents[ids[0]] ?? ids[0];
    const parentName = regionNames[parentId] ?? "Region";
    const subs = ids.filter((id) => (regionParents[id] ?? id) !== id);
    const subNames = subs
      .map((id) => regionNames[id])
      .filter(Boolean) as string[];

    const where = subNames.length
      ? `${andJoin(subNames)}, ${parentName}`
      : parentName;
    const types = catNames.length ? andJoin(catNames) : "All Heritage Sites";
    onHeadingChange(`${types} in ${where}`);
  }, [
    onHeadingChange,
    filters.regionIds,
    filters.categoryIds,
    filters.centerSiteId,
    filters.radiusKm,
    centerSiteTitle,
    regionNames,
    regionParents,
    options.categories,
  ]);

  // Selected IDs per group
  const selectedArchitectureTypeIds = filters.categoryIds.filter((id) =>
    architectureTypeIdSet.has(id)
  );
  const selectedArchitecturalStyleIds = filters.categoryIds.filter((id) =>
    architecturalStyleIdSet.has(id)
  );
  const selectedArchitecturalFeatureIds = filters.categoryIds.filter((id) =>
    architecturalFeatureIdSet.has(id)
  );
  const selectedArchitecturePeriodIds = filters.categoryIds.filter((id) =>
    historicalPeriodIdSet.has(id)
  );
  const selectedNatureTypeIds = filters.categoryIds.filter((id) =>
    naturalTypeIdSet.has(id)
  );
  const selectedCulturalTypeIds = filters.categoryIds.filter((id) =>
    culturalTypeIdSet.has(id)
  );
  const selectedArchaeologyTypeIds = filters.categoryIds.filter((id) =>
    archaeologyTypeIdSet.has(id)
  );
  const selectedArchaeologyPeriodIds = filters.categoryIds.filter((id) =>
    historicalPeriodIdSet.has(id)
  );

  /* ───────── Master + Domain tab handlers ───────── */

  const applyDomainDefaults = (domain: DomainTab) => {
    const base: Partial<Filters> = {
      name: "",
      categoryIds: [],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    if (domain === "all") {
      onFilterChange(base);
    } else if (domain === "architecture") {
      let categoryIds: string[] = [];
      if (architectureRootId) categoryIds.push(architectureRootId);
      onFilterChange({ ...base, categoryIds });
    } else if (domain === "nature") {
      let categoryIds: string[] = [];
      if (naturalRootId) categoryIds.push(naturalRootId);
      onFilterChange({ ...base, categoryIds });
    } else if (domain === "cultural") {
      let categoryIds: string[] = [];
      if (culturalRootId) categoryIds.push(culturalRootId);
      onFilterChange({ ...base, categoryIds });
    } else if (domain === "archaeology") {
      // Prefer the heritage-type category "Archaeological Sites" if it exists
      const archHeritage = heritageTypeOptions.find(
        (c) => c.name === "Archaeological Sites"
      );
      let categoryIds: string[] = [];
      if (archHeritage) {
        categoryIds.push(archHeritage.id);
      } else if (archaeologyRootId) {
        categoryIds.push(archaeologyRootId);
      }
      onFilterChange({ ...base, categoryIds });
    }
  };

  const handleDomainTabClick = (domain: DomainTab) => {
    // Toggle behaviour: click active pill → back to All
    if (domain === domainTab) {
      setDomainTab("all");
      resetSharedUi();
      applyDomainDefaults("all");
    } else {
      setDomainTab(domain);
      resetSharedUi();
      applyDomainDefaults(domain);
    }
  };

  /* ───────── Render ───────── */

  return (
    <div className="p-4 bg-white h-full flex flex-col text-sm">

      {/* ── Heading ── */}
      <div className="flex items-center gap-2 mb-4">
        <Icon name="search" size={18} className="text-[var(--brand-orange)]" />
        <h2 className="text-xl font-bold text-[var(--navy-deep)] tracking-tight">Search</h2>
      </div>

      {/* ── Fixed: keyword search — placeholder is domain-aware ── */}
      <div className="relative rounded-2xl bg-gray-100 border border-gray-300 focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/30 focus-within:border-[var(--brand-orange)] transition-all mb-3">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <Icon name="search" size={14} />
        </div>
        <input
          type="text"
          value={filters.name}
          onChange={(e) => onFilterChange({ name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={
            domainTab === "architecture" ? "Search Architecture…"
            : domainTab === "nature" ? "Search Nature & Landscapes…"
            : domainTab === "cultural" ? "Search Cultural Landscape…"
            : domainTab === "archaeology" ? "Search Archaeology…"
            : "Search Heritage"
          }
          className="w-full pl-8 pr-3 py-2.5 rounded-2xl bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm"
        />
      </div>

      {/* ── Fixed: Heritage Type (context-aware) + Location ── */}
      <div className="rounded-xl bg-[var(--ivory-cream)] border border-gray-200 p-2 space-y-2 mb-3">
        <HeritageTypeTrigger
          options={
            domainTab === "architecture" ? architectureTypeOptions
            : domainTab === "nature" ? naturalTypeOptions
            : domainTab === "cultural" ? culturalTypeOptions
            : domainTab === "archaeology" ? archaeologyTypeOptions
            : heritageTypeOptions
          }
          selectedIds={
            domainTab === "architecture" ? selectedArchitectureTypeIds
            : domainTab === "nature" ? selectedNatureTypeIds
            : domainTab === "cultural" ? selectedCulturalTypeIds
            : domainTab === "archaeology" ? selectedArchaeologyTypeIds
            : filters.categoryIds.filter((id) => heritageTypeIdSet.has(id))
          }
          onOpen={openHeritageTypeModal}
          onClear={clearHeritageTypeSelection}
        />
        <LocationSearchTrigger
          selectedIds={filters.regionIds}
          regionNames={regionNames}
          regionParents={regionParents}
          onOpen={openLocationModal}
          onClear={clearRegionSelection}
        />
      </div>

      {/* ── Domain pills (2×2 grid) ── */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["architecture", "nature", "cultural", "archaeology"] as DomainTab[]).map((domain) => {
          const label =
            domain === "architecture" ? "Architecture"
            : domain === "nature" ? "Nature & Landscapes"
            : domain === "cultural" ? "Cultural Landscape"
            : "Archaeology";
          const isActive = domainTab === domain;
          return (
            <button
              key={domain}
              type="button"
              onClick={() => handleDomainTabClick(domain)}
              className={`font-explore-tab w-full px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap flex items-center justify-center
              ${isActive
                ? "bg-[var(--brand-orange)] text-white border-[var(--brand-orange)] shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Advanced filters — only for Architecture and Archaeology ── */}
      {(domainTab === "architecture" || domainTab === "archaeology") && (
        <div className="flex-grow min-h-0 overflow-y-auto space-y-3 pb-1">
          {domainTab === "architecture" && (
            <>
              <MultiSelectDropdown
                options={architecturalStyleOptions}
                selectedIds={selectedArchitecturalStyleIds}
                onChange={handleArchitecturalStyleChange}
                placeholder="Architectural Style"
              />
              <MultiSelectDropdown
                options={architecturalFeatureOptions}
                selectedIds={selectedArchitecturalFeatureIds}
                onChange={handleArchitecturalFeatureChange}
                placeholder="Architectural Features"
              />
              <MultiSelectDropdown
                options={historicalPeriodOptions}
                selectedIds={selectedArchitecturePeriodIds}
                onChange={handleArchitecturePeriodChange}
                placeholder="Historical Period"
              />
            </>
          )}
          {domainTab === "archaeology" && (
            <MultiSelectDropdown
              options={historicalPeriodOptions}
              selectedIds={selectedArchaeologyPeriodIds}
              onChange={handleArchaeologyPeriodChange}
              placeholder="Historical Period"
            />
          )}
        </div>
      )}


      <SearchLocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        topRegions={topRegions}
        selectedIds={draftRegionIds}
        activeParentId={draftActiveParentId}
        setActiveParentId={setDraftActiveParentId}
        onClearAll={clearAllDraftRegions}
        onToggleWithRule={toggleDraftRegionWithRule}
        onApply={applyDraftRegions}
        onClear={() => {
          clearAllDraftRegions();
          clearRegionSelection();
          setIsLocationModalOpen(false);
        }}
        regionNames={regionNames}
        regionParents={regionParents}
      />

      <HeritageTypeModal
        isOpen={isHeritageTypeModalOpen}
        onClose={() => setIsHeritageTypeModalOpen(false)}
        options={
          domainTab === "architecture" ? architectureTypeOptions
          : domainTab === "nature" ? naturalTypeOptions
          : domainTab === "cultural" ? culturalTypeOptions
          : domainTab === "archaeology" ? archaeologyTypeOptions
          : heritageTypeOptions
        }
        selectedIds={draftHeritageTypeIds}
        onToggle={toggleDraftHeritageType}
        onApply={applyDraftHeritageType}
        onClear={clearHeritageTypeSelection}
      />

      {/* Proximity search trigger */}
      <div className="pt-3 flex-shrink-0 relative group/proximity">
        <button
          type="button"
          onClick={onOpenNearbyModal}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-sm ${
            filters.centerSiteId
              ? "bg-[var(--brand-orange)]/5 border-[var(--brand-orange)]/40 hover:border-[var(--brand-orange)]"
              : "bg-white border-gray-200 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              filters.centerSiteId
                ? "bg-[var(--brand-orange)]/10"
                : "bg-gray-100"
            }`}
          >
            <Icon
              name="map-marker-alt"
              size={13}
              className={
                filters.centerSiteId
                  ? "text-[var(--brand-orange)]"
                  : "text-gray-400"
              }
            />
          </div>
          {filters.centerSiteId && centerSiteTitle ? (
            <div className="min-w-0 flex-1 text-left">
              <div className="font-medium text-gray-900 truncate text-xs leading-tight">
                {centerSiteTitle}
              </div>
              <div className="text-[0.65rem] text-gray-500 truncate leading-tight">
                Within {filters.radiusKm ?? 25} km · tap to edit
              </div>
            </div>
          ) : (
            <span className="font-medium text-sm text-gray-600">
              Search Around a Site
            </span>
          )}
          {filters.centerSiteId ? (
            /* X button with its own "Clear" tooltip */
            <span className="relative ml-auto flex-shrink-0 group/clearx">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterChange(clearPlacesNearby());
                  onSearch();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onFilterChange(clearPlacesNearby());
                    onSearch();
                  }
                }}
                className="w-5 h-5 rounded-full bg-white ring-1 ring-gray-300 flex items-center justify-center text-gray-400 hover:text-[var(--brand-orange)] hover:ring-[var(--brand-orange)]/40 transition-colors"
              >
                <Icon name="times" size={8} />
              </span>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[0.65rem] rounded-md whitespace-nowrap opacity-0 group-hover/clearx:opacity-100 transition-opacity duration-150 z-50">
                Clear
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-gray-900" />
              </span>
            </span>
          ) : (
            <Icon
              name="chevron-right"
              size={11}
              className="ml-auto text-gray-400 flex-shrink-0"
            />
          )}
        </button>
        {/* "Click to edit" tooltip on main button hover (hides when X is hovered) */}
        {filters.centerSiteId ? (
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[0.7rem] rounded-lg whitespace-nowrap opacity-0 group-hover/proximity:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            Click to edit
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[0.7rem] rounded-lg whitespace-nowrap opacity-0 group-hover/proximity:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            Find heritage sites near a specific location
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2.5 pt-4 mt-3 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={onSearch}
          className="font-explore-button flex-1 py-2.5 rounded-xl bg-[var(--brand-blue)] hover:brightness-110 text-white font-semibold shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 text-sm flex items-center justify-center gap-2"
        >
          <Icon name="search" size={13} />
          Search
        </button>
        <button
          onClick={handleReset}
          className="font-explore-button px-4 rounded-xl bg-white ring-1 ring-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 text-xs transition-all"
          title="Reset filters"
          type="button"
        >
          <Icon
            name="redo-alt"
            size={12}
            className="text-[var(--brand-orange)]"
          />
          Reset
        </button>
      </div>
    </div>
  );
}
