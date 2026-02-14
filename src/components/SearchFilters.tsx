// src/components/SearchFilters.tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/browser";
import Icon from "./Icon";
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
            ? "ring-[var(--mustard-accent)] shadow-md"
            : "ring-[var(--taupe-grey)] hover:ring-[var(--mustard-accent)]"
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
                ? "text-[var(--espresso-brown)]/60 font-normal"
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
                className="w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)] hover:bg-white transition-colors"
                title="Clear selection"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-[var(--taupe-grey)] ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Dropdown panel */}
      <div
        className={`absolute left-0 right-0 z-20 mt-2 bg-white rounded-xl shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ease-out
        ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-[var(--taupe-grey)]/40">
          <input
            type="text"
            placeholder="Search…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
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
                  ? "bg-[var(--terracotta-red)]/10 text-[var(--terracotta-red)] font-semibold"
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
    set.has(toggleId) ? set.delete(toggleId) : set.add(toggleId);
    return Array.from(set);
  }

  set.has(toggleId) ? set.delete(toggleId) : set.add(toggleId);
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
            ? "ring-[var(--mustard-accent)] shadow-md"
            : "ring-[var(--taupe-grey)] hover:ring-[var(--mustard-accent)]"
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
                : "text-[var(--espresso-brown)]/60"
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
                className="w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)] hover:bg-white transition-colors"
                title="Clear"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-[var(--taupe-grey)] ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Panel */}
      <div
        className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-[var(--taupe-grey)]/40">
          <input
            type="text"
            placeholder="Search regions…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
          />
        </div>

        <div className="py-1.5 max-h-72 overflow-auto text-sm">
          {term.trim().length >= 2 ? (
            searching ? (
              <div className="px-3 py-1.5 text-xs text-[var(--taupe-grey)]">
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-[var(--taupe-grey)]">
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
                        ? "text-[var(--terracotta-red)] font-semibold"
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
                        ? "text-[var(--terracotta-red)] font-semibold"
                        : "text-[var(--dark-grey)]"
                    }`}
                  >
                    <Icon
                      name={top.icon_key || "map"}
                      size={14}
                      className="text-[var(--taupe-grey)]"
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
            ? "ring-[var(--mustard-accent)] shadow-md"
            : "ring-[var(--taupe-grey)] hover:ring-[var(--mustard-accent)]"
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
                className="w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                title="Clear these subregions"
              >
                <Icon name="times" size={9} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={14}
              className={`transition-transform text-[var(--taupe-grey)] ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </div>

      {/* Panel */}
      <div
        className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-200 ease-out ${
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="p-2 border-b border-[var(--taupe-grey)]/40">
          <input
            type="text"
            placeholder="Search subregions…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
          />
        </div>

        <div className="py-1.5 max-h-72 overflow-auto text-sm">
          {loading ? (
            <div className="px-3 py-1.5 text-xs text-[var(--taupe-grey)]">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-[var(--taupe-grey)]">
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
                        ? "bg-[var(--terracotta-red)]/10 text-[var(--terracotta-red)] font-semibold"
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
        <div className="relative rounded-xl bg-[var(--taupe-grey)]/10 shadow-sm focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
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
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40"
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
                      className="absolute inset-0 w-9 h-9 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40 items-center justify-center text-[var(--taupe-grey)]"
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
                  <div className="text-xs text-[var(--espresso-brown)]/70 truncate">
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
                className="mr-1 w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
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
                className="ml-3 mr-2 text-[var(--taupe-grey)]"
              />
              <input
                className="w-full px-2 py-2.5 rounded-xl bg-transparent outline-none text-[var(--dark-grey)] placeholder-[var(--espresso-brown)]/60 text-sm"
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
                  className="mr-3 w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                  title="Clear"
                >
                  <Icon name="times" size={9} />
                </div>
              )}
            </div>
          )}

          {/* Dropdown */}
          <div
            className={`absolute left-0 right-0 z-30 mt-2 bg-white rounded-xl shadow-2xl ring-1 ring-[var(--taupe-grey)] transition-all duration-150 ${
              open
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-2 pointer-events-none"
            }`}
          >
            {loading ? (
              <div className="px-4 py-2 text-xs text-[var(--taupe-grey)]">
                Searching…
              </div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="px-4 py-2 text-xs text-[var(--taupe-grey)]">
                No sites found
              </div>
            ) : (
              <ul className="max-h-64 overflow-auto py-1.5 divide-y divide-[var(--taupe-grey)]/20 text-sm">
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
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40"
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
                            className="absolute inset-0 w-9 h-9 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40 items-center justify-center text-[var(--taupe-grey)]"
                          >
                            <Icon name="image" size={13} />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-[var(--dark-grey)] font-medium truncate">
                            {r.title}
                          </div>
                          {r.location_free && (
                            <div className="text-xs text-[var(--espresso-brown)]/70 truncate">
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
        <label className="mb-0.5 block text-[0.7rem] font-medium text-[var(--espresso-brown)]/70">
          Radius (km)
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 items-center">
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)] px-3 py-1.5">
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
          <div className="w-24 rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)] px-2.5 py-1.5">
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
        <p className="mt-1 text-[0.7rem] text-[var(--espresso-brown)]/70">
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
  const { data, error } = await supabase.rpc("sites_within_radius", {
    center_lat: lat,
    center_lng: lng,
    radius_km: radiusKm,
    name_ilike: name ?? null,
  });

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
  const { data, error } = await qb;
  if (error) throw error;
  return data ?? [];
}

/* ───────────────────────────── Main Component ───────────────────────────── */
interface SearchFiltersProps {
  filters: Filters;
  onFilterChange: (newFilters: Partial<Filters>) => void;
  onSearch: () => void;
  onHeadingChange?: (title: string) => void;
}

type MasterTab = "all" | "region";
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
}: SearchFiltersProps) {
  const [options, setOptions] = useState<FilterOptions>({
    categories: [],
    regions: [],
  });
  const [topRegions, setTopRegions] = useState<Option[]>([]);
  const [activeParentId, setActiveParentId] = useState<string | null>(null);

  const [centerSiteTitle, setCenterSiteTitle] = useState<string | null>(null);

  const [regionNames, setRegionNames] = useState<Record<string, string>>({});
  const [regionParents, setRegionParents] = useState<
    Record<string, string | null>
  >({});

  const [subsByParent, setSubsByParent] = useState<Record<string, Option[]>>(
    {}
  );
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const [regSearch, setRegSearch] = useState("");
  const [regSearching, setRegSearching] = useState(false);
  const [regSearchResults, setRegSearchResults] = useState<Option[]>([]);

  const [masterTab, setMasterTab] = useState<MasterTab>("all");
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
  const [architectureSearch, setArchitectureSearch] = useState("");

  // Nature tab
  const [naturalRootId, setNaturalRootId] = useState<string | null>(null);
  const [naturalTypeOptions, setNaturalTypeOptions] = useState<Option[]>([]);
  const [natureSearch, setNatureSearch] = useState("");

  // Cultural Landscape tab
  const [culturalRootId, setCulturalRootId] = useState<string | null>(null);
  const [culturalTypeOptions, setCulturalTypeOptions] = useState<Option[]>([]);
  const [culturalSearch, setCulturalSearch] = useState("");

  // Archaeology tab
  const [archaeologyRootId, setArchaeologyRootId] = useState<string | null>(
    null
  );
  const [archaeologyTypeOptions, setArchaeologyTypeOptions] = useState<
    Option[]
  >([]);
  const [archaeologySearch, setArchaeologySearch] = useState("");

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

  const architectureSearchResults = useMemo(() => {
    const term = architectureSearch.trim().toLowerCase();
    if (!term) return [];
    return architectureTypeOptions.filter((c) =>
      c.name.toLowerCase().includes(term)
    );
  }, [architectureSearch, architectureTypeOptions]);

  const natureSearchResults = useMemo(() => {
    const term = natureSearch.trim().toLowerCase();
    if (!term) return [];
    return naturalTypeOptions.filter((c) =>
      c.name.toLowerCase().includes(term)
    );
  }, [natureSearch, naturalTypeOptions]);

  const culturalSearchResults = useMemo(() => {
    const term = culturalSearch.trim().toLowerCase();
    if (!term) return [];
    return culturalTypeOptions.filter((c) =>
      c.name.toLowerCase().includes(term)
    );
  }, [culturalSearch, culturalTypeOptions]);

  const archaeologySearchResults = useMemo(() => {
    const term = archaeologySearch.trim().toLowerCase();
    if (!term) return [];
    return archaeologyTypeOptions.filter((c) =>
      c.name.toLowerCase().includes(term)
    );
  }, [archaeologySearch, archaeologyTypeOptions]);

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

  // Remote search for Regions tab
  useEffect(() => {
    let active = true;
    (async () => {
      const term = regSearch.trim();
      if (term.length < 2) {
        setRegSearchResults([]);
        setRegSearching(false);
        return;
      }
      setRegSearching(true);
      const { data, error } = await supabase
        .from("regions")
        .select("id,name,icon_key,parent_id")
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(40);
      if (!active) return;
      if (!error) {
        const rows = (data || []) as any[];
        setRegSearchResults(
          rows.map((r) => ({ id: r.id, name: r.name, icon_key: r.icon_key }))
        );
        setRegionNames((m) => {
          const next = { ...m };
          rows.forEach((r) => (next[r.id] = r.name));
          return next;
        });
        setRegionParents((m) => {
          const next = { ...m };
          rows.forEach((r) => (next[r.id] = r.parent_id ?? r.id));
          return next;
        });
      }
      setRegSearching(false);
    })();
    return () => {
      active = false;
    };
  }, [regSearch]);

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

    if (!(id in regionParents)) {
      const { data } = await supabase
        .from("regions")
        .select("id,name,parent_id")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        setRegionNames((m) => ({ ...m, [id]: data.name }));
        setRegionParents((m) => ({ ...m, [id]: data.parent_id ?? id }));
      }
    }

    const next = applyRegionToggle(filters.regionIds || [], id, regionParents);
    onFilterChange({ regionIds: next });

    const parentId = (regionParents[id] ?? id) as string;
    setActiveParentId(parentId);
    setExpandedParentId(parentId);
    await loadSubregions(parentId);
  };

  const clearAllRegions = () => {
    onFilterChange({ regionIds: [] });
    setActiveParentId(null);
    setExpandedParentId(null);
  };

  // Remove a parent region and any of its selected subregions
  const clearRegionParent = (parentId: string) => {
    const next = (filters.regionIds || []).filter(
      (id) => id !== parentId && (regionParents[id] ?? id) !== parentId
    );
    onFilterChange({ regionIds: next });
  };

  const resetSharedUi = () => {
    setActiveParentId(null);
    setExpandedParentId(null);
    setRegSearch("");
    setRegSearchResults([]);
    setCenterSiteTitle(null);
    setArchitectureSearch("");
    setNatureSearch("");
    setCulturalSearch("");
    setArchaeologySearch("");
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
    setMasterTab("all");
    setDomainTab("all");
  };

  // All tab handlers
  const handleHeritageTypeChange = (ids: string[]) => {
    const current = filters.categoryIds || [];
    const preserved = current.filter((id) => !heritageTypeIdSet.has(id));
    onFilterChange({ categoryIds: [...preserved, ...ids] });
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

  const handleArchitectureSearchPick = (id: string) => {
    // Narrow to the picked architecture type ONLY (no architecture root)
    const base: Partial<Filters> = {
      name: "",
      categoryIds: [id],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    onFilterChange(base);
    resetSharedUi();
    onSearch();
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

  const handleNatureSearchPick = (id: string) => {
    // Narrow to the picked nature type ONLY (no natural root)
    const base: Partial<Filters> = {
      name: "",
      categoryIds: [id],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    onFilterChange(base);
    resetSharedUi();
    onSearch();
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

  const handleCulturalSearchPick = (id: string) => {
    // Narrow to the picked cultural type ONLY (no cultural root)
    const base: Partial<Filters> = {
      name: "",
      categoryIds: [id],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    onFilterChange(base);
    resetSharedUi();
    onSearch();
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

  const handleArchaeologySearchPick = (id: string) => {
    // Narrow to the picked archaeology type ONLY (no archaeology root)
    const base: Partial<Filters> = {
      name: "",
      categoryIds: [id],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    onFilterChange(base);
    resetSharedUi();
    onSearch();
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

  const handleMasterTabClick = (tab: MasterTab) => {
    if (tab === masterTab) return;
    setMasterTab(tab);
    resetSharedUi();

    const base: Partial<Filters> = {
      name: "",
      categoryIds: [],
      regionIds: [],
      orderBy: "latest",
      ...clearPlacesNearby(),
    };

    if (tab === "all") {
      applyDomainDefaults(domainTab);
    } else {
      // Region master tab
      onFilterChange(base);
    }
  };

  const handleDomainTabClick = (domain: DomainTab) => {
    if (masterTab !== "all") {
      // Only meaningful when master is "all"
      setMasterTab("all");
    }

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
    <div className="p-3 bg-white h-full flex flex-col text-sm">
      {/* Master Tabs: All / Region (overall tabs) */}
      <div className="flex mb-3 border-b border-[var(--taupe-grey)]/60 text-xs">
        {(["all", "region"] as MasterTab[]).map((t) => (
          <button
            key={t}
            onClick={() => handleMasterTabClick(t)}
            className={`px-3 pt-2 pb-1 -mb-[1px] font-semibold border-b-2 transition-colors
            ${
              masterTab === t
                ? "border-[var(--terracotta-red)] text-[var(--dark-grey)]"
                : "border-transparent text-[var(--espresso-brown)]/70 hover:text-[var(--dark-grey)]"
            }`}
          >
            {t === "all" ? "All" : "Region"}
          </button>
        ))}
      </div>

      {/* Domain Pills (2×2 grid) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          "architecture",
          "nature",
          "cultural",
          "archaeology",
        ].map((d) => {
          const domain = d as DomainTab;
          const label =
            domain === "architecture"
              ? "Architecture"
              : domain === "nature"
              ? "Nature & Landscapes"
              : domain === "cultural"
              ? "Cultural Landscape"
              : "Archaeology";
          const isActive = masterTab === "all" && domainTab === domain;
          return (
            <button
              key={domain}
              type="button"
              onClick={() => handleDomainTabClick(domain)}
              className={`font-explore-tab w-full px-3 py-1.5 rounded-full text-xs font-semibold border transition whitespace-nowrap flex items-center justify-center
              ${
                isActive
                  ? "bg-[var(--terracotta-red)] text-white border-[var(--terracotta-red)]"
                  : "bg-white text-[var(--dark-grey)] border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div className="flex-grow min-h-0">
        {/* MASTER: All */}
        {masterTab === "all" && (
          <>
            {/* All-domain panel (no specific pill selected) */}
            {domainTab === "all" && (
              <div className="space-y-4">
                {/* Keyword */}
                <div className="relative rounded-xl bg-[var(--taupe-grey)]/10 shadow-sm focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
                  <input
                    type="text"
                    value={filters.name}
                    onChange={(e) => onFilterChange({ name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                    placeholder="Search Heritage"
                    className="w-full px-3 py-2.5 rounded-xl bg-transparent outline-none text-[var(--dark-grey)] placeholder-[var(--espresso-brown)]/60 text-sm"
                  />
                </div>

                {/* Heritage Type */}
                <MultiSelectDropdown
                  options={heritageTypeOptions}
                  selectedIds={filters.categoryIds.filter((id) =>
                    heritageTypeIdSet.has(id)
                  )}
                  onChange={handleHeritageTypeChange}
                  placeholder="Heritage Type"
                />

                {/* Historical Period */}
                <MultiSelectDropdown
                  options={historicalPeriodOptions}
                  selectedIds={filters.categoryIds.filter((id) =>
                    historicalPeriodIdSet.has(id)
                  )}
                  onChange={handleHistoricalPeriodChange}
                  placeholder="Historical Period"
                />

                {/* Regions: Two dropdowns */}
                <div className="space-y-1">
                  <TopLevelRegionSelect
                    topRegions={topRegions}
                    activeParentId={activeParentId}
                    setActiveParentId={setActiveParentId}
                    selectedIds={filters.regionIds}
                    onClearAll={clearAllRegions}
                    onToggleWithRule={onToggleWithRule}
                    regionNames={regionNames}
                    regionParents={regionParents}
                  />

                  {activeParentId &&
                    topRegions.find((t) => t.id === activeParentId) && (
                      <SubRegionSelect
                        parent={topRegions.find(
                          (t) => t.id === activeParentId
                        )!}
                        selectedIds={filters.regionIds}
                        onToggleWithRule={onToggleWithRule}
                      />
                    )}
                </div>

                {/* Location + Radius */}
                <LocationRadiusFilter
                  value={{
                    centerSiteId: filters.centerSiteId ?? null,
                    centerLat: filters.centerLat ?? null,
                    centerLng: filters.centerLng ?? null,
                    radiusKm: filters.radiusKm ?? undefined,
                  }}
                  onChange={(v) => onFilterChange(v)}
                  onSitePicked={(site) =>
                    setCenterSiteTitle(site?.title ?? null)
                  }
                />
              </div>
            )}

            {/* Architecture Panel */}
            {domainTab === "architecture" && (
              <div className="h-full flex flex-col space-y-3.5">
                {/* Architecture search */}
                <div>
                  <input
                    type="text"
                    placeholder="Search Architecture…"
                    value={architectureSearch}
                    onChange={(e) => setArchitectureSearch(e.target.value)}
                    className="w-full mb-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] font-explore-input"
                  />
                  {architectureSearch.trim().length >= 2 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                      {architectureSearchResults.length === 0 ? (
                        <div className="px-2 py-1 text-[var(--taupe-grey)]">
                          No architecture categories found
                        </div>
                      ) : (
                        architectureSearchResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleArchitectureSearchPick(c.id)}
                            className="w-full text-left px-3 py-1.5 rounded-lg border border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] flex items-center gap-2"
                          >
                            <Icon
                              name={c.icon_key || "landmark"}
                              size={13}
                              className="text-[var(--taupe-grey)]"
                            />
                            <span className="font-explore-tab-item text-[var(--dark-grey)]">
                              {c.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Architecture Type */}
                <MultiSelectDropdown
                  options={architectureTypeOptions}
                  selectedIds={selectedArchitectureTypeIds}
                  onChange={handleArchitectureTypeChange}
                  placeholder="Architecture Type"
                />

                {/* Architectural Style */}
                <MultiSelectDropdown
                  options={architecturalStyleOptions}
                  selectedIds={selectedArchitecturalStyleIds}
                  onChange={handleArchitecturalStyleChange}
                  placeholder="Architectural Style"
                />

                {/* Architectural Features */}
                <MultiSelectDropdown
                  options={architecturalFeatureOptions}
                  selectedIds={selectedArchitecturalFeatureIds}
                  onChange={handleArchitecturalFeatureChange}
                  placeholder="Architectural Features"
                />

                {/* Historical Period (for architecture) */}
                <MultiSelectDropdown
                  options={historicalPeriodOptions}
                  selectedIds={selectedArchitecturePeriodIds}
                  onChange={handleArchitecturePeriodChange}
                  placeholder="Historical Period"
                />

                {/* Regions for Architecture */}
                <div className="space-y-1">
                  <TopLevelRegionSelect
                    topRegions={topRegions}
                    activeParentId={activeParentId}
                    setActiveParentId={setActiveParentId}
                    selectedIds={filters.regionIds}
                    onClearAll={clearAllRegions}
                    onToggleWithRule={onToggleWithRule}
                    regionNames={regionNames}
                    regionParents={regionParents}
                  />

                  {activeParentId &&
                    topRegions.find((t) => t.id === activeParentId) && (
                      <SubRegionSelect
                        parent={topRegions.find(
                          (t) => t.id === activeParentId
                        )!}
                        selectedIds={filters.regionIds}
                        onToggleWithRule={onToggleWithRule}
                      />
                    )}
                </div>

                {/* Architecture tab radius search */}
                <LocationRadiusFilter
                  value={{
                    centerSiteId: filters.centerSiteId ?? null,
                    centerLat: filters.centerLat ?? null,
                    centerLng: filters.centerLng ?? null,
                    radiusKm: filters.radiusKm ?? undefined,
                  }}
                  onChange={(v) => onFilterChange(v)}
                  onSitePicked={(site) =>
                    setCenterSiteTitle(site?.title ?? null)
                  }
                />
              </div>
            )}

            {/* Nature Panel */}
            {domainTab === "nature" && (
              <div className="h-full flex flex-col space-y-3.5">
                {/* Nature search */}
                <div>
                  <input
                    type="text"
                    placeholder="Search Nature…"
                    value={natureSearch}
                    onChange={(e) => setNatureSearch(e.target.value)}
                    className="w-full mb-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] font-explore-input"
                  />
                  {natureSearch.trim().length >= 2 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                      {natureSearchResults.length === 0 ? (
                        <div className="px-2 py-1 text-[var(--taupe-grey)]">
                          No natural heritage categories found
                        </div>
                      ) : (
                        natureSearchResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleNatureSearchPick(c.id)}
                            className="w-full text-left px-3 py-1.5 rounded-lg border border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] flex items-center gap-2"
                          >
                            <Icon
                              name={c.icon_key || "leaf"}
                              size={13}
                              className="text-[var(--taupe-grey)]"
                            />
                            <span className="font-explore-tab-item text-[var(--dark-grey)]">
                              {c.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Natural Heritage Type */}
                <MultiSelectDropdown
                  options={naturalTypeOptions}
                  selectedIds={selectedNatureTypeIds}
                  onChange={handleNatureTypeChange}
                  placeholder="Natural Heritage Type"
                />

                {/* Regions */}
                <div className="space-y-1">
                  <TopLevelRegionSelect
                    topRegions={topRegions}
                    activeParentId={activeParentId}
                    setActiveParentId={setActiveParentId}
                    selectedIds={filters.regionIds}
                    onClearAll={clearAllRegions}
                    onToggleWithRule={onToggleWithRule}
                    regionNames={regionNames}
                    regionParents={regionParents}
                  />

                  {activeParentId &&
                    topRegions.find((t) => t.id === activeParentId) && (
                      <SubRegionSelect
                        parent={topRegions.find(
                          (t) => t.id === activeParentId
                        )!}
                        selectedIds={filters.regionIds}
                        onToggleWithRule={onToggleWithRule}
                      />
                    )}
                </div>

                {/* Nature tab radius search */}
                <LocationRadiusFilter
                  value={{
                    centerSiteId: filters.centerSiteId ?? null,
                    centerLat: filters.centerLat ?? null,
                    centerLng: filters.centerLng ?? null,
                    radiusKm: filters.radiusKm ?? undefined,
                  }}
                  onChange={(v) => onFilterChange(v)}
                  onSitePicked={(site) =>
                    setCenterSiteTitle(site?.title ?? null)
                  }
                />
              </div>
            )}

            {/* Cultural Landscape Panel */}
            {domainTab === "cultural" && (
              <div className="h-full flex flex-col space-y-3.5">
                {/* Cultural Landscape search */}
                <div>
                  <input
                    type="text"
                    placeholder="Search Cultural Landscape…"
                    value={culturalSearch}
                    onChange={(e) => setCulturalSearch(e.target.value)}
                    className="w-full mb-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] font-explore-input"
                  />
                  {culturalSearch.trim().length >= 2 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                      {culturalSearchResults.length === 0 ? (
                        <div className="px-2 py-1 text-[var(--taupe-grey)]">
                          No cultural landscape categories found
                        </div>
                      ) : (
                        culturalSearchResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleCulturalSearchPick(c.id)}
                            className="w-full text-left px-3 py-1.5 rounded-lg border border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] flex items-center gap-2"
                          >
                            <Icon
                              name={c.icon_key || "globe-europe"}
                              size={13}
                              className="text-[var(--taupe-grey)]"
                            />
                            <span className="font-explore-tab-item text-[var(--dark-grey)]">
                              {c.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Type Dropdown */}
                <MultiSelectDropdown
                  options={culturalTypeOptions}
                  selectedIds={selectedCulturalTypeIds}
                  onChange={handleCulturalTypeChange}
                  placeholder="Type"
                />

                {/* Regions */}
                <div className="space-y-1">
                  <TopLevelRegionSelect
                    topRegions={topRegions}
                    activeParentId={activeParentId}
                    setActiveParentId={setActiveParentId}
                    selectedIds={filters.regionIds}
                    onClearAll={clearAllRegions}
                    onToggleWithRule={onToggleWithRule}
                    regionNames={regionNames}
                    regionParents={regionParents}
                  />

                  {activeParentId &&
                    topRegions.find((t) => t.id === activeParentId) && (
                      <SubRegionSelect
                        parent={topRegions.find(
                          (t) => t.id === activeParentId
                        )!}
                        selectedIds={filters.regionIds}
                        onToggleWithRule={onToggleWithRule}
                      />
                    )}
                </div>

                {/* Cultural tab radius search */}
                <LocationRadiusFilter
                  value={{
                    centerSiteId: filters.centerSiteId ?? null,
                    centerLat: filters.centerLat ?? null,
                    centerLng: filters.centerLng ?? null,
                    radiusKm: filters.radiusKm ?? undefined,
                  }}
                  onChange={(v) => onFilterChange(v)}
                  onSitePicked={(site) =>
                    setCenterSiteTitle(site?.title ?? null)
                  }
                />
              </div>
            )}

            {/* Archaeology Panel */}
            {domainTab === "archaeology" && (
              <div className="h-full flex flex-col space-y-3.5">
                {/* Archaeology search */}
                <div>
                  <input
                    type="text"
                    placeholder="Search Archaeology…"
                    value={archaeologySearch}
                    onChange={(e) => setArchaeologySearch(e.target.value)}
                    className="w-full mb-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] font-explore-input"
                  />
                  {archaeologySearch.trim().length >= 2 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                      {archaeologySearchResults.length === 0 ? (
                        <div className="px-2 py-1 text-[var(--taupe-grey)]">
                          No archaeology categories found
                        </div>
                      ) : (
                        archaeologySearchResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleArchaeologySearchPick(c.id)}
                            className="w-full text-left px-3 py-1.5 rounded-lg border border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)] flex items-center gap-2"
                          >
                            <Icon
                              name={c.icon_key || "university"}
                              size={13}
                              className="text-[var(--taupe-grey)]"
                            />
                            <span className="font-explore-tab-item text-[var(--dark-grey)]">
                              {c.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Type Dropdown */}
                <MultiSelectDropdown
                  options={archaeologyTypeOptions}
                  selectedIds={selectedArchaeologyTypeIds}
                  onChange={handleArchaeologyTypeChange}
                  placeholder="Type"
                />

                {/* Historical Period Dropdown */}
                <MultiSelectDropdown
                  options={historicalPeriodOptions}
                  selectedIds={selectedArchaeologyPeriodIds}
                  onChange={handleArchaeologyPeriodChange}
                  placeholder="Historical Period"
                />

                {/* Regions */}
                <div className="space-y-1">
                  <TopLevelRegionSelect
                    topRegions={topRegions}
                    activeParentId={activeParentId}
                    setActiveParentId={setActiveParentId}
                    selectedIds={filters.regionIds}
                    onClearAll={clearAllRegions}
                    onToggleWithRule={onToggleWithRule}
                    regionNames={regionNames}
                    regionParents={regionParents}
                  />

                  {activeParentId &&
                    topRegions.find((t) => t.id === activeParentId) && (
                      <SubRegionSelect
                        parent={topRegions.find(
                          (t) => t.id === activeParentId
                        )!}
                        selectedIds={filters.regionIds}
                        onToggleWithRule={onToggleWithRule}
                      />
                    )}
                </div>

                {/* Archaeology tab radius search */}
                <LocationRadiusFilter
                  value={{
                    centerSiteId: filters.centerSiteId ?? null,
                    centerLat: filters.centerLat ?? null,
                    centerLng: filters.centerLng ?? null,
                    radiusKm: filters.radiusKm ?? undefined,
                  }}
                  onChange={(v) => onFilterChange(v)}
                  onSitePicked={(site) =>
                    setCenterSiteTitle(site?.title ?? null)
                  }
                />
              </div>
            )}
          </>
        )}

        {/* MASTER: Region (full Regions panel) */}
        {masterTab === "region" && (
          <div className="h-full flex flex-col text-sm">
            <input
              type="text"
              placeholder="Search regions..."
              value={regSearch}
              onChange={(e) => setRegSearch(e.target.value)}
              className="w-full mb-2.5 px-3 py-1.5 text-xs rounded-md bg-[var(--taupe-grey)]/15 text-[var(--espresso-brown)] placeholder-[var(--espresso-brown)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] font-explore-input flex-shrink-0"
            />

            {regSearch.trim().length >= 2 ? (
              <div className="space-y-1 overflow-y-auto scrollbar-hide text-xs">
                {regSearching ? (
                  <div className="px-3 py-1.5 text-[var(--taupe-grey)]">
                    Searching…
                  </div>
                ) : regSearchResults.length === 0 ? (
                  <div className="px-3 py-1.5 text-[var(--taupe-grey)]">
                    No regions found
                  </div>
                ) : (
                  regSearchResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onToggleWithRule(r.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg border transition flex items-center gap-2
                      ${
                        filters.regionIds.includes(r.id)
                          ? "bg-[var(--terracotta-red)]/10 border-[var(--terracotta-red)]"
                          : "border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
                      }`}
                    >
                      <Icon
                        name={r.icon_key || "map"}
                        size={14}
                        className="text-[var(--taupe-grey)]"
                      />
                      <span className="font-explore-tab-item text-[var(--dark-grey)]">
                        {r.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                {!expandedParentId ? (
                  <div className="space-y-2 overflow-y-auto scrollbar-hide text-sm">
                    {topRegions.map((top) => {
                      const parentSelected = filters.regionIds.includes(top.id);
                      return (
                        <div
                          key={top.id}
                          className="rounded-lg border border-[var(--taupe-grey)] bg-white"
                        >
                          {/* Entire row accessible clickable container (NOT a button) */}
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) =>
                              onKeyActivate(e, async () => {
                                if (!parentSelected) {
                                  await onToggleWithRule(top.id);
                                } else {
                                  await loadSubregions(top.id);
                                }
                                setExpandedParentId(top.id);
                              })
                            }
                            onClick={async () => {
                              if (!parentSelected) {
                                await onToggleWithRule(top.id);
                              } else {
                                await loadSubregions(top.id);
                              }
                              setExpandedParentId(top.id);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition cursor-pointer ${
                              parentSelected
                                ? "bg-[var(--terracotta-red)]/10"
                                : "hover:bg-[var(--ivory-cream)]"
                            }`}
                            title={`Open ${top.name}`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon
                                name={top.icon_key || "map"}
                                size={14}
                                className="text-[var(--taupe-grey)]"
                              />
                              <span
                                className={`font-explore-tab-item text-sm ${
                                  parentSelected
                                    ? "text-[var(--terracotta-red)] font-semibold"
                                    : "text-[var(--dark-grey)]"
                                }`}
                              >
                                {top.name}
                              </span>
                            </div>

                            {/* Right-side control: × when selected, chevron otherwise */}
                            {parentSelected ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  clearRegionParent(top.id);
                                }}
                                className="ml-2 w-5 h-5 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                                title="Clear this region"
                              >
                                <Icon name="times" size={9} />
                              </button>
                            ) : (
                              <Icon
                                name="chevron-right"
                                size={14}
                                className="text-[var(--taupe-grey)]"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Expanded panel for a parent
                  <div className="overflow-y-auto scrollbar-hide text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedParentId(null)}
                          className="px-2 py-1 text-xs rounded ring-1 ring-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
                        >
                          ← Back
                        </button>
                        <div className="text-xs text-[var(--dark-grey)] font-semibold">
                          {regionNames[expandedParentId] || "Region"}
                        </div>
                      </div>

                      <button
                        onClick={() => clearRegionParent(expandedParentId!)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] hover:bg-white"
                        title="Clear this region & subregions"
                      >
                        <Icon name="times" size={9} />
                        Clear
                      </button>
                    </div>

                    <div className="rounded-lg border border-[var(--taupe-grey)]/60">
                      <div className="px-3 py-1.5 border-b border-[var(--taupe-grey)]/40 text-[0.7rem] text-[var(--espresso-brown)]/70">
                        Choose subregions under “
                        {regionNames[expandedParentId!] || "Region"}”.
                      </div>

                      <div className="p-2 space-y-1 text-xs">
                        {(() => {
                          const subs = subsByParent[expandedParentId!] || [];
                          if (!subs.length)
                            return (
                              <div className="px-2 py-1.5 text-[var(--taupe-grey)]">
                                No subregions
                              </div>
                            );

                          return subs.map((s) => {
                            const active = filters.regionIds.includes(s.id);
                            return (
                              <div
                                key={s.id}
                                className={`flex items-center justify-between rounded px-3 py-1.5 ${
                                  active
                                    ? "bg-[var(--terracotta-red)]/10 text-[var(--terracotta-red)] font-semibold"
                                    : "hover:bg-[var(--ivory-cream)] text-[var(--dark-grey)]"
                                }`}
                              >
                                <button
                                  className="text-left flex-1"
                                  onClick={() => onToggleWithRule(s.id)}
                                  title={`Toggle ${s.name}`}
                                >
                                  {s.name}
                                </button>

                                {active && (
                                  <button
                                    onClick={() => onToggleWithRule(s.id)}
                                    className="ml-2 w-5 h-5 rounded-full flex items-center justify-center ring-1 ring-current"
                                    title="Remove"
                                  >
                                    <Icon name="times" size={9} />
                                  </button>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2.5 pt-3 mt-3 flex-shrink-0">
        <button
          onClick={onSearch}
          className="font-explore-button flex-1 py-2 rounded-xl bg-[var(--terracotta-red)] hover:brightness-95 text-white font-semibold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] text-sm"
        >
          Search
        </button>
        <button
          onClick={handleReset}
          className="font-explore-button px-3.5 rounded-xl bg-white ring-1 ring-[var(--taupe-grey)] shadow-sm text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)] inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] text-xs"
          title="Reset filters"
          type="button"
        >
          <Icon
            name="redo-alt"
            size={12}
            className="text-[var(--terracotta-red)]"
          />
          Reset
        </button>
      </div>
    </div>
  );
}
