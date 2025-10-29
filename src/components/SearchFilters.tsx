// src/components/SearchFilters.tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "./Icon";

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
          className="w-full flex items-center justify-between text-left px-4 py-3 cursor-pointer"
        >
          <div
            className={`text-base truncate
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

          <div className="flex items-center gap-3 pl-3">
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
                className="w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)] hover:bg-white transition-colors"
                title="Clear selection"
              >
                <Icon name="times" size={10} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={16}
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
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--ivory-cream)] focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] placeholder-[var(--espresso-brown)]/60 text-[var(--dark-grey)]"
          />
        </div>
        <ul className="py-2 max-h-60 overflow-auto">
          {filteredOptions.map((opt) => (
            <li
              key={opt.id}
              onClick={() => toggleOption(opt.id)}
              className={`px-3 py-2 cursor-pointer transition-colors font-explore-dropdown-item
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
      const { data, error } = await supabase
        .from("regions")
        .select("id,name,icon_key,parent_id")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(40);
      if (!active) return;
      setSearching(false);
      if (!error) {
        setResults(
          ((data || []) as any[]).map((r) => ({
            id: r.id,
            name: r.name,
            icon_key: r.icon_key,
            parent_id: r.parent_id,
          }))
        );
      }
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
          className="w-full flex items-center justify-between text-left px-4 py-3 cursor-pointer"
        >
          <div
            className={`text-base truncate ${
              selectedIds.length || activeParentId
                ? "text-[var(--dark-grey)] font-semibold"
                : "text-[var(--espresso-brown)]/60"
            }`}
          >
            {label}
          </div>
          <div className="flex items-center gap-3 pl-3">
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
                className="w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)] hover:bg-white transition-colors"
                title="Clear"
              >
                <Icon name="times" size={10} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={16}
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
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--ivory-cream)] focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] placeholder-[var(--espresso-brown)]/60 text-[var(--dark-grey)]"
          />
        </div>

        <div className="py-2 max-h-72 overflow-auto">
          {term.trim().length >= 2 ? (
            searching ? (
              <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
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
                    className={`px-3 py-2 cursor-pointer hover:bg-[var(--ivory-cream)] ${
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
                    className={`px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-[var(--ivory-cream)] ${
                      isSelected
                        ? "text-[var(--terracotta-red)] font-semibold"
                        : "text-[var(--dark-grey)]"
                    }`}
                  >
                    <Icon
                      name={top.icon_key || "map"}
                      size={16}
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
    <div className="relative group mt-3" ref={ref}>
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
          className="w-full flex items-center justify-between text-left px-4 py-3 cursor-pointer"
        >
          <div className="text-base truncate text-[var(--dark-grey)]">
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
                className="w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                title="Clear these subregions"
              >
                <Icon name="times" size={10} />
              </div>
            )}
            <Icon
              name="chevron-down"
              size={16}
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
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--ivory-cream)] focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] placeholder-[var(--espresso-brown)]/60 text-[var(--dark-grey)]"
          />
        </div>

        <div className="py-2 max-h-72 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
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
                    className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between ${
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
                        <Icon name="times" size={10} />
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
    onChange({
      centerSiteId: null,
      centerLat: null,
      centerLng: null,
      radiusKm: null,
    });
    onSitePicked?.(null);
    setSelectedPreview(null);
    setQuery("");
  };

  return (
    <div className="space-y-3">
      <div ref={boxRef}>
        <div className="relative rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] hover:ring-[var(--mustard-accent)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
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
                  <div className="relative w-10 h-10 flex-shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        aria-hidden="true"
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40"
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
                      className="absolute inset-0 w-10 h-10 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40 items-center justify-center text-[var(--taupe-grey)]"
                    >
                      <Icon name="image" size={14} />
                    </div>
                  </div>
                );
              })()}

              <div className="min-w-0 flex-1">
                <div className="text-[var(--dark-grey)] font-medium truncate">
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
                className="mr-1 w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                title="Clear"
              >
                <Icon name="times" size={10} />
              </div>
            </div>
          ) : (
            // Search input (when nothing selected)
            <div className="flex items-center">
              <Icon
                name="map-marker-alt"
                size={16}
                className="ml-3 mr-2 text-[var(--taupe-grey)]"
              />
              <input
                className="w-full px-2 py-3 rounded-xl bg-transparent outline-none text-[var(--dark-grey)] placeholder-[var(--espresso-brown)]/60"
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
                  className="mr-3 w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                  title="Clear"
                >
                  <Icon name="times" size={10} />
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
              <div className="px-4 py-3 text-sm text-[var(--taupe-grey)]">
                Searching…
              </div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="px-4 py-3 text-sm text-[var(--taupe-grey)]">
                No sites found
              </div>
            ) : (
              <ul className="max-h-64 overflow-auto py-2 divide-y divide-[var(--taupe-grey)]/20">
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
                      className="px-4 py-2 cursor-pointer hover:bg-[var(--ivory-cream)]"
                    >
                      <div className="flex items-center gap-3">
                        {/* Thumbnail with robust fallback */}
                        <div className="relative w-10 h-10 flex-shrink-0">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              aria-hidden="true"
                              className="w-10 h-10 rounded-full object-cover ring-1 ring-[var(--taupe-grey)]/40"
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
                            className="absolute inset-0 w-10 h-10 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)]/40 items-center justify-center text-[var(--taupe-grey)]"
                          >
                            <Icon name="image" size={14} />
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
        <label className="mb-1 block text-xs font-medium text-[var(--espresso-brown)]/70">
          Radius (km)
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)] px-4 py-2">
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
          <div className="w-28 rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)] px-3 py-2">
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
              className="w-full bg-transparent outline-none text-right"
              disabled={!value.centerSiteId}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--espresso-brown)]/70">
          {value.centerSiteId
            ? `Searching within ${
                value.radiusKm ?? 25
              } km of the selected site.`
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
  return Boolean(
    f.centerLat != null &&
      f.centerLng != null &&
      f.radiusKm != null &&
      f.radiusKm > 0
  );
}

export async function fetchSitesByFilters(filters: Filters) {
  if (hasRadius(filters)) {
    const rows = await fetchSitesWithinRadius({
      lat: filters.centerLat as number,
      lng: filters.centerLng as number,
      radiusKm: filters.radiusKm as number,
      name: filters.name?.trim() || null,
    });
    // ensure nearest → farthest
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
  const [activeTab, setActiveTab] = useState<"filters" | "cats" | "regs">(
    "filters"
  );

  const [catSearch, setCatSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: cat }, { data: regTop }] = await Promise.all([
        supabase.from("categories").select("id,name,icon_key").order("name"),
        supabase
          .from("regions")
          .select("id,name,icon_key")
          .is("parent_id", null)
          .order("name"),
      ]);
      const top = (regTop as Option[]) || [];
      setOptions({ categories: (cat as Option[]) || [], regions: top });
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
    })();
  }, []);

  const filteredCategories = useMemo(
    () =>
      options.categories.filter((c) =>
        c.name.toLowerCase().includes(catSearch.toLowerCase())
      ),
    [options.categories, catSearch]
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

  // Remote search for regions tab
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

  // Toggle with updated rule (parent persists when sub toggled)
  const onToggleWithRule = async (id: string) => {
    if (hasRadius(filters)) {
      onFilterChange({
        name: "",
        categoryIds: [],
        regionIds: [],
        orderBy: "latest",
        centerSiteId: null,
        centerLat: null,
        centerLng: null,
        radiusKm: null,
      });
      setCenterSiteTitle(null);
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

  const handleReset = () => {
    onFilterChange({
      name: "",
      categoryIds: [],
      regionIds: [],
      orderBy: "latest",
      centerSiteId: null,
      centerLat: null,
      centerLng: null,
      radiusKm: null,
    });
    setActiveParentId(null);
    setExpandedParentId(null);
    setRegSearch("");
    setRegSearchResults([]);
    setCenterSiteTitle(null);
  };

  /* ───────── Heading text builder ───────── */
  useEffect(() => {
    if (!onHeadingChange) return;

    const catNames = options.categories
      .filter((c) => filters.categoryIds?.includes(c.id))
      .map((c) => c.name);

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

  return (
    <div className="p-4 bg-white h-full flex flex-col">
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(["filters", "cats", "regs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`font-explore-tab px-3 py-1.5 rounded-full text-sm font-semibold border transition
            ${
              activeTab === t
                ? "bg-[var(--terracotta-red)] text-white border-[var(--terracotta-red)]"
                : "bg-white text-[var(--dark-grey)] border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
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

      {/* Panels */}
      <div className="flex-grow min-h-0">
        {activeTab === "filters" && (
          <div className="space-y-6">
            {/* Keyword */}
            <div className="relative rounded-xl bg-white shadow-sm ring-1 ring-[var(--taupe-grey)] focus-within:ring-2 focus-within:ring-[var(--mustard-accent)]">
              <input
                type="text"
                value={filters.name}
                onChange={(e) => onFilterChange({ name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="Search Heritage"
                className="w-full px-4 py-3 rounded-xl bg-transparent outline-none text-[var(--dark-grey)] placeholder-[var(--espresso-brown)]/60"
              />
            </div>

            {/* Categories (dropdown) */}
            <MultiSelectDropdown
              options={options.categories}
              selectedIds={filters.categoryIds}
              onChange={(ids) => onFilterChange({ categoryIds: ids })}
              placeholder="Heritage Type"
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
                    parent={topRegions.find((t) => t.id === activeParentId)!}
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
              onSitePicked={(site) => setCenterSiteTitle(site?.title ?? null)}
            />
          </div>
        )}

        {/* Category Tab (now multi-select) */}
        {activeTab === "cats" && (
          <div className="h-full flex flex-col">
            <input
              type="text"
              placeholder="Search categories..."
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm bg-[var(--ivory-cream)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] placeholder-[var(--espresso-brown)]/60 font-explore-input flex-shrink-0"
            />
            <div className="space-y-1 overflow-y-auto scrollbar-hide">
              {filteredCategories.map((c) => {
                const active = filters.categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const set = new Set(filters.categoryIds || []);
                      active ? set.delete(c.id) : set.add(c.id);
                      onFilterChange({ categoryIds: Array.from(set) });
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-center gap-2
                    ${
                      active
                        ? "bg-[var(--terracotta-red)]/10 border-[var(--terracotta-red)]"
                        : "border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
                    }`}
                  >
                    <Icon
                      name={c.icon_key || "folder"}
                      size={16}
                      className="text-[var(--taupe-grey)]"
                    />
                    <span className="font-explore-tab-item text-[var(--dark-grey)]">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Regions Tab (no nested buttons) */}
        {activeTab === "regs" && (
          <div className="h-full flex flex-col">
            <input
              type="text"
              placeholder="Search regions..."
              value={regSearch}
              onChange={(e) => setRegSearch(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm bg-[var(--ivory-cream)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)] placeholder-[var(--espresso-brown)]/60 font-explore-input flex-shrink-0"
            />

            {regSearch.trim().length >= 2 ? (
              <div className="space-y-1 overflow-y-auto scrollbar-hide">
                {regSearching ? (
                  <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
                    Searching…
                  </div>
                ) : regSearchResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-[var(--taupe-grey)]">
                    No regions found
                  </div>
                ) : (
                  regSearchResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onToggleWithRule(r.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border transition flex items-center gap-2
                      ${
                        filters.regionIds.includes(r.id)
                          ? "bg-[var(--terracotta-red)]/10 border-[var(--terracotta-red)]"
                          : "border-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
                      }`}
                    >
                      <Icon
                        name={r.icon_key || "map"}
                        size={16}
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
                  <div className="space-y-2 overflow-y-auto scrollbar-hide">
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
                            className={`w-full flex items-center justify-between px-3 py-3 rounded-lg transition cursor-pointer ${
                              parentSelected
                                ? "bg-[var(--terracotta-red)]/10"
                                : "hover:bg-[var(--ivory-cream)]"
                            }`}
                            title={`Open ${top.name}`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon
                                name={top.icon_key || "map"}
                                size={16}
                                className="text-[var(--taupe-grey)]"
                              />
                              <span
                                className={`font-explore-tab-item ${
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
                                className="ml-2 w-6 h-6 rounded-full bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] flex items-center justify-center text-[var(--taupe-grey)] hover:text-[var(--terracotta-red)]"
                                title="Clear this region"
                              >
                                <Icon name="times" size={10} />
                              </button>
                            ) : (
                              <Icon
                                name="chevron-right"
                                size={16}
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
                  <div className="overflow-y-auto scrollbar-hide">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedParentId(null)}
                          className="px-2 py-1 text-sm rounded ring-1 ring-[var(--taupe-grey)] hover:bg-[var(--ivory-cream)]"
                        >
                          ← Back
                        </button>
                        <div className="text-sm text-[var(--dark-grey)] font-semibold">
                          {regionNames[expandedParentId] || "Region"}
                        </div>
                      </div>

                      <button
                        onClick={() => clearRegionParent(expandedParentId!)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-[var(--ivory-cream)] ring-1 ring-[var(--taupe-grey)] hover:bg-white"
                        title="Clear this region & subregions"
                      >
                        <Icon name="times" size={10} />
                        Clear
                      </button>
                    </div>

                    <div className="rounded-lg border border-[var(--taupe-grey)]/60">
                      <div className="px-3 py-2 border-b border-[var(--taupe-grey)]/40 text-xs text-[var(--espresso-brown)]/70">
                        Choose subregions under “
                        {regionNames[expandedParentId!] || "Region"}”.
                      </div>

                      <div className="p-2 space-y-1">
                        {(() => {
                          const subs = subsByParent[expandedParentId!] || [];
                          if (!subs.length)
                            return (
                              <div className="px-2 py-2 text-sm text-[var(--taupe-grey)]">
                                No subregions
                              </div>
                            );

                          return subs.map((s) => {
                            const active = filters.regionIds.includes(s.id);
                            return (
                              <div
                                key={s.id}
                                className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
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
                                    <Icon name="times" size={10} />
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
      <div className="flex gap-3 pt-4 mt-4 flex-shrink-0">
        <button
          onClick={onSearch}
          className="font-explore-button flex-1 py-2.5 rounded-xl bg-[var(--terracotta-red)] hover:brightness-95 text-white font-semibold shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
        >
          Search
        </button>
        <button
          onClick={handleReset}
          className="font-explore-button px-4 rounded-xl bg-white ring-1 ring-[var(--taupe-grey)] shadow-sm text-[var(--dark-grey)] hover:bg-[var(--ivory-cream)] inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--mustard-accent)]"
          title="Reset filters"
          type="button"
        >
          <Icon
            name="redo-alt"
            size={14}
            className="text-[var(--terracotta-red)]"
          />
          Reset
        </button>
      </div>
    </div>
  );
}
