"use client";

/**
 * MobileFilterBar — chip-first filter bar for the mobile Explore screen.
 *
 * 5 chips: Search | Location | Type | Advanced | Nearby
 * Each chip opens a focused bottom sheet. Results update live via onFilterChange.
 * Desktop is unaffected — this component is mobile-only (lg:hidden).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPublicClient } from "@/lib/supabase/browser";
import Icon from "@/components/Icon";
import { clearPlacesNearby, isPlacesNearbyActive } from "@/lib/placesNearby";
import { getThumbOrVariantUrlNoTransform } from "@/lib/imagevariants";
import type { Filters } from "@/components/SearchFilters";

/* ─────────────────────────── Types ─────────────────────────── */
type Option = { id: string; name: string; icon_key: string | null };

type CategoryRow = {
  id: string;
  name: string;
  icon_key: string | null;
  parent_id: string | null;
  slug: string;
};

type Bucket = {
  id: string;
  label: string;
  icon_key: string | null;
  category_ids: string[];
};

type Region = { id: string; name: string; icon_key: string | null; parent_id: string | null };

type AdvancedDomain = "architecture" | "archaeology" | "nature";

/* ─────────────────────────── Helpers ─────────────────────────── */
function collectSubtree(all: CategoryRow[], rootId: string): Option[] {
  const parentById: Record<string, string | null> = {};
  all.forEach((c) => { parentById[c.id] = c.parent_id; });
  return all
    .filter((c) => {
      if (c.id === rootId) return false;
      let cur: string | null = c.id;
      const seen = new Set<string>();
      while (cur) {
        if (cur === rootId) return true;
        if (seen.has(cur)) break;
        seen.add(cur);
        cur = parentById[cur] ?? null;
      }
      return false;
    })
    .map(({ id, name, icon_key }) => ({ id, name, icon_key }));
}

function thumbUrl(raw?: string | null) {
  return getThumbOrVariantUrlNoTransform(raw ?? "", "thumb") || raw || "";
}

/* ─────────────────────────── Bottom sheet wrapper ─────────────────────────── */
function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) { setVisible(false); return; }
    let id2: number;
    const id = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[6000] flex items-end justify-center touch-none">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="relative w-full bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight: "88dvh",
          transform: visible ? `translateY(${dragY}px)` : "translateY(100%)",
          transition: isDraggingRef.current ? "none" : "transform 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* Drag handle */}
        <div
          className="shrink-0 pt-2.5 pb-1 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={(e) => { dragStartRef.current = e.touches[0].clientY; isDraggingRef.current = false; }}
          onTouchMove={(e) => {
            if (dragStartRef.current === null) return;
            const dy = e.touches[0].clientY - dragStartRef.current;
            if (dy > 0) { isDraggingRef.current = true; setDragY(dy); }
          }}
          onTouchEnd={(e) => {
            if (dragStartRef.current === null) return;
            const dy = e.changedTouches[0].clientY - dragStartRef.current;
            dragStartRef.current = null;
            isDraggingRef.current = false;
            setDragY(0);
            if (dy > 80) onClose();
          }}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <Icon name="times" size={13} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto touch-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─────────────────────────── Chip button ─────────────────────────── */
function Chip({
  label,
  active,
  dimmed,
  onTap,
  onClear,
}: {
  label: string;
  active: boolean;
  dimmed?: boolean;
  onTap: () => void;
  onClear?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
        dimmed
          ? "opacity-40 bg-white border-gray-200 text-gray-500 cursor-not-allowed"
          : active
          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
          : "bg-white border-gray-200 text-gray-600 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
      }`}
    >
      <span className="truncate max-w-[120px]">{label}</span>
      {active && onClear && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center hover:bg-white/50 transition-colors flex-shrink-0"
        >
          <Icon name="times" size={7} className="text-white" />
        </span>
      )}
      {!active && <Icon name="chevron-down" size={10} className="text-gray-400 flex-shrink-0" />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH SHEET
═══════════════════════════════════════════════════════════════ */
function SearchSheet({
  isOpen,
  onClose,
  value,
  onChange,
  popularSites,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (name: string) => void;
  popularSites: { id: string; title: string; cover_photo_thumb_url: string | null; location_free: string | null }[];
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ id: string; title: string; cover_photo_thumb_url: string | null; location_free: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(value);
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await getPublicClient()
        .from("sites")
        .select("id,title,cover_photo_thumb_url,location_free")
        .ilike("title", `%${q}%`)
        .eq("is_published", true)
        .is("deleted_at", null)
        .order("title")
        .limit(10);
      setSuggestions((data as any[]) ?? []);
      setSearching(false);
    }, 250);
  }, [query]);

  const commit = (name: string) => {
    onChange(name);
    onClose();
  };

  const showPopular = !query.trim() && popularSites.length > 0;
  const showSuggestions = query.trim().length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Search Sites">
      <div className="px-4 pt-3 pb-4 space-y-4">
        {/* Input */}
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) commit(query.trim()); }}
            placeholder="Search by site name…"
            className="w-full pl-9 pr-9 py-3 rounded-xl bg-gray-100 border border-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); onChange(""); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-400 transition-colors"
            >
              <Icon name="times" size={8} />
            </button>
          )}
        </div>

        {/* Popular sites (shown before typing) */}
        {showPopular && (
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">Popular Sites</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
              {popularSites.map((site) => (
                <li
                  key={site.id}
                  onClick={() => commit(site.title)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                    {site.cover_photo_thumb_url ? (
                      <img src={thumbUrl(site.cover_photo_thumb_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Icon name="image" size={14} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{site.title}</div>
                    {site.location_free && (
                      <div className="text-xs text-gray-400 truncate">{site.location_free}</div>
                    )}
                  </div>
                  <Icon name="search" size={12} className="text-gray-300 flex-shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Live suggestions while typing */}
        {showSuggestions && (
          <div>
            {searching ? (
              <div className="text-xs text-gray-400 text-center py-4">Searching…</div>
            ) : suggestions.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4">No sites found</div>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                {suggestions.map((site) => (
                  <li
                    key={site.id}
                    onClick={() => commit(site.title)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {site.cover_photo_thumb_url ? (
                        <img src={thumbUrl(site.cover_photo_thumb_url)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Icon name="image" size={14} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{site.title}</div>
                      {site.location_free && (
                        <div className="text-xs text-gray-400 truncate">{site.location_free}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOCATION SHEET
═══════════════════════════════════════════════════════════════ */
function LocationSheet({
  isOpen,
  onClose,
  selectedRegionId,
  selectedSubregionId,
  onSelect,
  onClear,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedRegionId: string | null;
  selectedSubregionId: string | null;
  onSelect: (regionId: string, subregionId: string | null, regionName: string, subregionName: string | null) => void;
  onClear: () => void;
}) {
  const [topRegions, setTopRegions] = useState<Region[]>([]);
  const [subregions, setSubregions] = useState<Region[]>([]);
  const [activeRegion, setActiveRegion] = useState<Region | null>(null);
  const [regionSearch, setRegionSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [loadingSubs, setLoadingSubs] = useState(false);
  const subCache = useRef<Record<string, Region[]>>({});

  useEffect(() => {
    getPublicClient()
      .from("regions")
      .select("id,name,icon_key,parent_id")
      .is("parent_id", null)
      .order("name")
      .then(({ data }) => setTopRegions((data as Region[]) ?? []));
  }, []);

  const loadSubs = useCallback(async (region: Region) => {
    if (subCache.current[region.id]) {
      setSubregions(subCache.current[region.id]);
      return;
    }
    setLoadingSubs(true);
    const { data } = await getPublicClient()
      .from("regions")
      .select("id,name,icon_key,parent_id")
      .eq("parent_id", region.id)
      .order("name");
    const subs = (data as Region[]) ?? [];
    subCache.current[region.id] = subs;
    setSubregions(subs);
    setLoadingSubs(false);
  }, []);

  const selectRegion = async (region: Region) => {
    setActiveRegion(region);
    setSubSearch("");
    await loadSubs(region);
    onSelect(region.id, null, region.name, null);
  };

  const selectSubregion = (sub: Region) => {
    if (!activeRegion) return;
    onSelect(activeRegion.id, sub.id, activeRegion.name, sub.name);
    onClose();
  };

  const filteredRegions = useMemo(() => {
    const q = regionSearch.trim().toLowerCase();
    return q ? topRegions.filter((r) => r.name.toLowerCase().includes(q)) : topRegions;
  }, [topRegions, regionSearch]);

  const filteredSubs = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return q ? subregions.filter((s) => s.name.toLowerCase().includes(q)) : subregions;
  }, [subregions, subSearch]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Where?">
      <div className="flex flex-col" style={{ minHeight: "60dvh" }}>
        {/* Two-column layout */}
        <div className="flex flex-1 min-h-0 gap-0 divide-x divide-gray-100">

          {/* Left: Regions */}
          <div className="flex-1 flex flex-col min-h-0 px-3 py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--brand-blue)] mb-2">Region</p>
            <div className="mb-2">
              <input
                type="text"
                value={regionSearch}
                onChange={(e) => setRegionSearch(e.target.value)}
                placeholder="Search…"
                className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 border border-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
              />
            </div>
            <div className="flex-1 overflow-y-auto rounded-xl border border-gray-100">
              {/* All Pakistan */}
              <button
                type="button"
                onClick={() => { onClear(); onClose(); }}
                className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors border-b border-gray-100 ${
                  !selectedRegionId ? "text-[var(--brand-orange)] font-semibold bg-[var(--brand-orange)]/5" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon name="map" size={13} className="text-gray-400 flex-shrink-0" />
                <span>All Pakistan</span>
              </button>
              {filteredRegions.map((r) => {
                const isActive = activeRegion?.id === r.id;
                const isSelected = selectedRegionId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectRegion(r)}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                      isActive
                        ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] font-semibold"
                        : isSelected
                        ? "bg-[var(--brand-orange)]/5 text-[var(--brand-orange)] font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon name={r.icon_key ?? "map"} size={13} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 truncate">{r.name}</span>
                    {subregions.length > 0 || isActive ? (
                      <Icon name="chevron-right" size={10} className="text-gray-300 flex-shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Subregions */}
          <div className="flex-1 flex flex-col min-h-0 px-3 py-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-widest text-[var(--brand-blue)] mb-2">
              {activeRegion ? activeRegion.name : "Subregion"}
            </p>
            {!activeRegion ? (
              <div className="flex-1 flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="text-center px-4">
                  <Icon name="map-marker-alt" size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Select a region to see subregions</p>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2">
                  <input
                    type="text"
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 border border-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
                  />
                </div>
                <div className="flex-1 overflow-y-auto rounded-xl border border-gray-100">
                  {loadingSubs ? (
                    <div className="text-xs text-gray-400 text-center py-4">Loading…</div>
                  ) : (
                    <>
                      {/* All of region */}
                      <button
                        type="button"
                        onClick={() => { onSelect(activeRegion.id, null, activeRegion.name, null); onClose(); }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors border-b border-gray-100 ${
                          selectedRegionId === activeRegion.id && !selectedSubregionId
                            ? "text-[var(--brand-orange)] font-semibold bg-[var(--brand-orange)]/5"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <span>All of {activeRegion.name}</span>
                        {selectedRegionId === activeRegion.id && !selectedSubregionId && (
                          <Icon name="check" size={11} className="ml-auto text-[var(--brand-orange)]" />
                        )}
                      </button>
                      {filteredSubs.map((s) => {
                        const isSel = selectedSubregionId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectSubregion(s)}
                            className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                              isSel
                                ? "bg-[var(--brand-orange)]/5 text-[var(--brand-orange)] font-semibold"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span className="flex-1 truncate">{s.name}</span>
                            {isSel && <Icon name="check" size={11} className="text-[var(--brand-orange)]" />}
                          </button>
                        );
                      })}
                      {filteredSubs.length === 0 && (
                        <div className="text-xs text-gray-400 text-center py-4">No subregions</div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TYPE SHEET
═══════════════════════════════════════════════════════════════ */
function TypeSheet({
  isOpen,
  onClose,
  buckets,
  selectedBucketId,
  onSelect,
  onClear,
}: {
  isOpen: boolean;
  onClose: () => void;
  buckets: Bucket[];
  selectedBucketId: string | null;
  onSelect: (bucket: Bucket) => void;
  onClear: () => void;
}) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="What type of site?">
      <div className="px-4 py-3">
        {buckets.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">No type buckets configured yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {/* All types */}
            <li
              onClick={() => { onClear(); onClose(); }}
              className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
                !selectedBucketId
                  ? "bg-[var(--brand-orange)]/5 text-[var(--brand-orange)]"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon name="landmark" size={14} className="text-gray-400" />
              </div>
              <span className="text-sm font-medium flex-1">All Site Types</span>
              {!selectedBucketId && <Icon name="check" size={13} className="text-[var(--brand-orange)]" />}
            </li>
            {buckets.map((b) => {
              const isSelected = selectedBucketId === b.id;
              return (
                <li
                  key={b.id}
                  onClick={() => { onSelect(b); onClose(); }}
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--brand-orange)]/5 text-[var(--brand-orange)]"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[var(--brand-orange)]/10" : "bg-gray-100"}`}>
                    {b.icon_key ? (
                      <Icon name={b.icon_key} size={15} className={isSelected ? "text-[var(--brand-orange)]" : "text-gray-500"} />
                    ) : (
                      <Icon name="landmark" size={14} className="text-gray-400" />
                    )}
                  </div>
                  <span className="text-sm font-medium flex-1">{b.label}</span>
                  {isSelected && <Icon name="check" size={13} className="text-[var(--brand-orange)]" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ADVANCED SHEET
═══════════════════════════════════════════════════════════════ */
function AdvancedSheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onSearch,
}: {
  isOpen: boolean;
  onClose: () => void;
  filters: Filters;
  onFilterChange: (f: Partial<Filters>) => void;
  onSearch: () => void;
}) {
  const [domain, setDomain] = useState<AdvancedDomain | null>(null);

  // Category options per domain
  const [archTypeOpts, setArchTypeOpts] = useState<Option[]>([]);
  const [archStyleOpts, setArchStyleOpts] = useState<Option[]>([]);
  const [archFeatureOpts, setArchFeatureOpts] = useState<Option[]>([]);
  const [periodOpts, setPeriodOpts] = useState<Option[]>([]);
  const [natureOpts, setNatureOpts] = useState<Option[]>([]);
  const [archyTypeOpts, setArchyTypeOpts] = useState<Option[]>([]);

  // Root IDs for domain anchoring
  const archRootRef = useRef<string | null>(null);
  const natureRootRef = useRef<string | null>(null);
  const archyRootRef = useRef<string | null>(null);

  // ID sets for each domain
  const [archTypeIds, setArchTypeIds] = useState<Set<string>>(new Set());
  const [archStyleIds, setArchStyleIds] = useState<Set<string>>(new Set());
  const [archFeatureIds, setArchFeatureIds] = useState<Set<string>>(new Set());
  const [periodIds, setPeriodIds] = useState<Set<string>>(new Set());
  const [natureIds, setNatureIds] = useState<Set<string>>(new Set());
  const [archyTypeIds, setArchyTypeIds] = useState<Set<string>>(new Set());
  const [archyPeriodIds, setArchyPeriodIds] = useState<Set<string>>(new Set());

  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      const { data: cats } = await getPublicClient()
        .from("categories")
        .select("id,name,icon_key,parent_id,slug")
        .order("sort_order", { ascending: true })
        .order("name");

      if (!cats) return;
      const all = cats as CategoryRow[];

      const archRoot = all.find((c) => c.slug === "architecture");
      const styleRoot = all.find((c) => c.slug === "architectural-style");
      const featureRoot = all.find((c) => c.slug === "architectural-features");
      const periodRoot = all.find((c) => c.slug === "historical-period");
      const natureRoot = all.find((c) => c.slug === "natural-heritage-landscapes") ?? all.find((c) => c.name === "Natural Heritage & Landscapes");
      const archyRoot = all.find((c) => c.slug === "archaeology") ?? all.find((c) => c.name === "Archaeology");

      if (archRoot) { archRootRef.current = archRoot.id; setArchTypeOpts(collectSubtree(all, archRoot.id)); }
      if (styleRoot) setArchStyleOpts(collectSubtree(all, styleRoot.id));
      if (featureRoot) setArchFeatureOpts(collectSubtree(all, featureRoot.id));
      if (periodRoot) setPeriodOpts(collectSubtree(all, periodRoot.id));
      if (natureRoot) { natureRootRef.current = natureRoot.id; setNatureOpts(collectSubtree(all, natureRoot.id)); }
      if (archyRoot) { archyRootRef.current = archyRoot.id; setArchyTypeOpts(collectSubtree(all, archyRoot.id)); }

      // Build ID sets from current filters
      const catSet = new Set(filters.categoryIds);
      if (archRoot) setArchTypeIds(new Set(collectSubtree(all, archRoot.id).map((o) => o.id).filter((id) => catSet.has(id))));
      if (styleRoot) setArchStyleIds(new Set(collectSubtree(all, styleRoot.id).map((o) => o.id).filter((id) => catSet.has(id))));
      if (featureRoot) setArchFeatureIds(new Set(collectSubtree(all, featureRoot.id).map((o) => o.id).filter((id) => catSet.has(id))));
      if (periodRoot) {
        const pIds = new Set(collectSubtree(all, periodRoot.id).map((o) => o.id).filter((id) => catSet.has(id)));
        setPeriodIds(pIds);
        setArchyPeriodIds(pIds);
      }
      if (natureRoot) setNatureIds(new Set(collectSubtree(all, natureRoot.id).map((o) => o.id).filter((id) => catSet.has(id))));
      if (archyRoot) setArchyTypeIds(new Set(collectSubtree(all, archyRoot.id).map((o) => o.id).filter((id) => catSet.has(id))));
    })();
  }, []);

  const toggleId = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setFn((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyAndClose = () => {
    // Rebuild categoryIds from all selected sets
    const next = new Set<string>();
    if (domain === "architecture") {
      archTypeIds.forEach((id) => next.add(id));
      archStyleIds.forEach((id) => next.add(id));
      archFeatureIds.forEach((id) => next.add(id));
      periodIds.forEach((id) => next.add(id));
      if (!archTypeIds.size && !archStyleIds.size && !archFeatureIds.size && archRootRef.current) {
        next.add(archRootRef.current);
      }
    } else if (domain === "nature") {
      natureIds.forEach((id) => next.add(id));
      if (!natureIds.size && natureRootRef.current) next.add(natureRootRef.current);
    } else if (domain === "archaeology") {
      archyTypeIds.forEach((id) => next.add(id));
      archyPeriodIds.forEach((id) => next.add(id));
      if (!archyTypeIds.size && archyRootRef.current) next.add(archyRootRef.current);
    }

    // Preserve existing non-advanced category selections
    const advancedIds = new Set([
      ...archTypeOpts.map((o) => o.id),
      ...archStyleOpts.map((o) => o.id),
      ...archFeatureOpts.map((o) => o.id),
      ...periodOpts.map((o) => o.id),
      ...natureOpts.map((o) => o.id),
      ...archyTypeOpts.map((o) => o.id),
      archRootRef.current ?? "",
      natureRootRef.current ?? "",
      archyRootRef.current ?? "",
    ]);
    const preserved = filters.categoryIds.filter((id) => !advancedIds.has(id));
    onFilterChange({ categoryIds: [...preserved, ...Array.from(next)] });
    onSearch();
    onClose();
  };

  const clearDomain = () => {
    setArchTypeIds(new Set());
    setArchStyleIds(new Set());
    setArchFeatureIds(new Set());
    setPeriodIds(new Set());
    setNatureIds(new Set());
    setArchyTypeIds(new Set());
    setArchyPeriodIds(new Set());
    setDomain(null);
    onFilterChange({ categoryIds: filters.categoryIds.filter((id) => {
      const advancedIds = new Set([
        ...archTypeOpts.map((o) => o.id),
        ...archStyleOpts.map((o) => o.id),
        ...archFeatureOpts.map((o) => o.id),
        ...periodOpts.map((o) => o.id),
        ...natureOpts.map((o) => o.id),
        ...archyTypeOpts.map((o) => o.id),
        archRootRef.current ?? "",
        natureRootRef.current ?? "",
        archyRootRef.current ?? "",
      ]);
      return !advancedIds.has(id);
    })});
    onSearch();
  };

  const MultiList = ({ opts, selected, onToggle }: { opts: Option[]; selected: Set<string>; onToggle: (id: string) => void }) => (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden max-h-48 overflow-y-auto">
      {opts.map((o) => {
        const active = selected.has(o.id);
        return (
          <li
            key={o.id}
            onClick={() => onToggle(o.id)}
            className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-sm transition-colors ${
              active ? "bg-[var(--brand-orange)]/5 text-[var(--brand-orange)] font-medium" : "hover:bg-gray-50 text-gray-700"
            }`}
          >
            <span>{o.name}</span>
            {active && <Icon name="check" size={12} className="text-[var(--brand-orange)]" />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Advanced Filters">
      <div className="px-4 py-3 space-y-4">

        {/* Domain selector */}
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-2">Select Domain</p>
          <div className="grid grid-cols-3 gap-2">
            {(["architecture", "archaeology", "nature"] as AdvancedDomain[]).map((d) => {
              const label = d === "architecture" ? "Architecture" : d === "archaeology" ? "Archaeology" : "Nature";
              const icon = d === "architecture" ? "landmark" : d === "archaeology" ? "archive" : "leaf";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(domain === d ? null : d)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    domain === d
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-[var(--brand-orange)]"
                  }`}
                >
                  <Icon name={icon} size={18} className={domain === d ? "text-white" : "text-gray-400"} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Architecture sub-filters */}
        {domain === "architecture" && (
          <div className="space-y-3">
            {archTypeOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Type</p>
                <MultiList opts={archTypeOpts} selected={archTypeIds} onToggle={(id) => toggleId(setArchTypeIds, id)} />
              </div>
            )}
            {archStyleOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Style</p>
                <MultiList opts={archStyleOpts} selected={archStyleIds} onToggle={(id) => toggleId(setArchStyleIds, id)} />
              </div>
            )}
            {archFeatureOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Features</p>
                <MultiList opts={archFeatureOpts} selected={archFeatureIds} onToggle={(id) => toggleId(setArchFeatureIds, id)} />
              </div>
            )}
            {periodOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Historical Period</p>
                <MultiList opts={periodOpts} selected={periodIds} onToggle={(id) => toggleId(setPeriodIds, id)} />
              </div>
            )}
          </div>
        )}

        {/* Nature sub-filters */}
        {domain === "nature" && natureOpts.length > 0 && (
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Natural Heritage Type</p>
            <MultiList opts={natureOpts} selected={natureIds} onToggle={(id) => toggleId(setNatureIds, id)} />
          </div>
        )}

        {/* Archaeology sub-filters */}
        {domain === "archaeology" && (
          <div className="space-y-3">
            {archyTypeOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Type</p>
                <MultiList opts={archyTypeOpts} selected={archyTypeIds} onToggle={(id) => toggleId(setArchyTypeIds, id)} />
              </div>
            )}
            {periodOpts.length > 0 && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Historical Period</p>
                <MultiList opts={periodOpts} selected={archyPeriodIds} onToggle={(id) => toggleId(setArchyPeriodIds, id)} />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 pt-2 pb-2">
          <button
            type="button"
            onClick={applyAndClose}
            className="flex-1 py-3 rounded-xl bg-[var(--brand-blue)] text-white font-semibold text-sm flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <Icon name="search" size={13} />
            Apply
          </button>
          <button
            type="button"
            onClick={clearDomain}
            className="px-5 py-3 rounded-xl bg-white ring-1 ring-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <Icon name="redo-alt" size={12} className="text-[var(--brand-orange)]" />
            Clear
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NEARBY SHEET
═══════════════════════════════════════════════════════════════ */
function NearbySheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onSearch,
}: {
  isOpen: boolean;
  onClose: () => void;
  filters: Filters;
  onFilterChange: (f: Partial<Filters>) => void;
  onSearch: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; latitude: number; longitude: number; cover_photo_thumb_url: string | null; location_free: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{ id: string; title: string; cover: string | null; subtitle: string | null } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Rehydrate preview from existing filters
  useEffect(() => {
    if (!filters.centerSiteId) { setSelectedPreview(null); return; }
    if (selectedPreview?.id === filters.centerSiteId) return;
    getPublicClient()
      .from("sites")
      .select("id,title,cover_photo_thumb_url,location_free")
      .eq("id", filters.centerSiteId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSelectedPreview({ id: data.id, title: data.title, cover: data.cover_photo_thumb_url ?? null, subtitle: data.location_free ?? null });
      });
  }, [filters.centerSiteId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await getPublicClient()
        .from("sites")
        .select("id,title,latitude,longitude,cover_photo_thumb_url,location_free")
        .ilike("title", `%${q}%`)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("title")
        .limit(12);
      setResults((data as any[]) ?? []);
      setSearching(false);
    }, 250);
  }, [query]);

  const chooseSite = (row: typeof results[0]) => {
    if (!row.latitude || !row.longitude) return;
    onFilterChange({
      centerSiteId: row.id,
      centerLat: Number(row.latitude),
      centerLng: Number(row.longitude),
      radiusKm: filters.radiusKm ?? 5,
      centerSiteTitle: row.title,
    });
    setSelectedPreview({ id: row.id, title: row.title, cover: row.cover_photo_thumb_url, subtitle: row.location_free });
    setQuery("");
    setResults([]);
    onSearch();
  };

  const clearSite = () => {
    onFilterChange({ ...clearPlacesNearby(), centerSiteTitle: null });
    setSelectedPreview(null);
    onSearch();
  };

  const nearbyActive = isPlacesNearbyActive({ centerSiteId: filters.centerSiteId ?? null, centerLat: filters.centerLat ?? null, centerLng: filters.centerLng ?? null, radiusKm: filters.radiusKm ?? null });

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Search Around a Site">
      <div className="px-4 py-3 space-y-4">
        {/* Site picker */}
        <div ref={dropdownRef} className="relative">
          {selectedPreview ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--brand-orange)]/40 bg-[var(--brand-orange)]/5">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                {selectedPreview.cover ? (
                  <img src={thumbUrl(selectedPreview.cover)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Icon name="image" size={14} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{selectedPreview.title}</div>
                {selectedPreview.subtitle && <div className="text-xs text-gray-500 truncate">{selectedPreview.subtitle}</div>}
              </div>
              <button type="button" onClick={clearSite} className="w-6 h-6 rounded-full bg-white ring-1 ring-gray-300 flex items-center justify-center text-gray-500 hover:text-[var(--brand-orange)] transition-colors">
                <Icon name="times" size={9} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Icon name="map-marker-alt" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a site…"
                  className="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-100 border border-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] transition-all"
                />
              </div>
              {(searching || results.length > 0) && (
                <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                  {searching ? (
                    <div className="px-4 py-3 text-xs text-gray-400">Searching…</div>
                  ) : (
                    <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                      {results.map((r) => (
                        <li key={r.id} onClick={() => chooseSite(r)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            {r.cover_photo_thumb_url ? (
                              <img src={thumbUrl(r.cover_photo_thumb_url)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300"><Icon name="image" size={12} /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{r.title}</div>
                            {r.location_free && <div className="text-xs text-gray-400 truncate">{r.location_free}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Radius slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">Radius</p>
            <span className="text-sm font-semibold text-gray-700">{filters.radiusKm ?? 5} km</span>
          </div>
          <input
            type="range"
            min={1}
            max={300}
            step={1}
            value={filters.radiusKm ?? 5}
            disabled={!nearbyActive}
            onChange={(e) => {
              onFilterChange({ radiusKm: Number(e.target.value) });
              onSearch();
            }}
            className="w-full disabled:opacity-40"
          />
          <div className="flex justify-between text-[0.6rem] text-gray-400 mt-0.5">
            <span>1 km</span>
            <span>300 km</span>
          </div>
          {!nearbyActive && (
            <p className="text-xs text-gray-400 mt-1">Choose a site to enable radius search.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT — MobileFilterBar
═══════════════════════════════════════════════════════════════ */
export interface MobileFilterBarProps {
  filters: Filters;
  onFilterChange: (f: Partial<Filters>) => void;
  onSearch: () => void;
}

export default function MobileFilterBar({ filters, onFilterChange, onSearch }: MobileFilterBarProps) {
  const [openSheet, setOpenSheet] = useState<"search" | "location" | "type" | "advanced" | "nearby" | null>(null);

  // Buckets loaded from admin config
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);

  // Popular sites for search sheet
  const [popularSites, setPopularSites] = useState<{ id: string; title: string; cover_photo_thumb_url: string | null; location_free: string | null }[]>([]);

  // Location display state
  const [regionName, setRegionName] = useState<string | null>(null);
  const [subregionName, setSubregionName] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedSubregionId, setSelectedSubregionId] = useState<string | null>(null);

  const nearbyActive = isPlacesNearbyActive({
    centerSiteId: filters.centerSiteId ?? null,
    centerLat: filters.centerLat ?? null,
    centerLng: filters.centerLng ?? null,
    radiusKm: filters.radiusKm ?? null,
  });

  // Load buckets + popular sites once
  useEffect(() => {
    (async () => {
      const [{ data: bData }, { data: bcData }, { data: settingsData }] = await Promise.all([
        getPublicClient().from("explore_type_buckets").select("id,label,icon_key,sort_order,is_active").eq("is_active", true).order("sort_order"),
        getPublicClient().from("explore_bucket_categories").select("bucket_id,category_id"),
        getPublicClient().from("app_settings").select("value").eq("key", "explore_popular_sites").maybeSingle(),
      ]);

      const catMap: Record<string, string[]> = {};
      ((bcData ?? []) as { bucket_id: string; category_id: string }[]).forEach(({ bucket_id, category_id }) => {
        if (!catMap[bucket_id]) catMap[bucket_id] = [];
        catMap[bucket_id].push(category_id);
      });

      setBuckets(
        ((bData ?? []) as Omit<Bucket, "category_ids">[]).map((b) => ({ ...b, category_ids: catMap[b.id] ?? [] }))
      );

      const siteIds: string[] = settingsData?.value?.site_ids ?? [];
      if (siteIds.length) {
        const { data: sites } = await getPublicClient()
          .from("sites")
          .select("id,title,cover_photo_thumb_url,location_free")
          .in("id", siteIds);
        if (sites) {
          const ordered = siteIds.map((id) => (sites as any[]).find((s) => s.id === id)).filter(Boolean);
          setPopularSites(ordered);
        }
      }
    })();
  }, []);

  // Chip labels
  const searchLabel = filters.name ? filters.name : "Search";
  const locationLabel = subregionName
    ? `${subregionName}, ${regionName}`
    : regionName
    ? regionName
    : "Location";
  const typeLabel = selectedBucket ? selectedBucket.label : "Type";
  const advancedActive = filters.categoryIds.some((id) =>
    buckets.every((b) => !b.category_ids.includes(id))
  ) && filters.categoryIds.length > 0 && !selectedBucket;
  const advancedLabel = "Advanced";
  const nearbyLabel = nearbyActive
    ? `${filters.radiusKm ?? 5}km · ${filters.centerSiteTitle ?? "Site"}`
    : "Nearby";

  const handleLocationSelect = (regionId: string, subId: string | null, rName: string, sName: string | null) => {
    setSelectedRegionId(regionId);
    setSelectedSubregionId(subId);
    setRegionName(rName);
    setSubregionName(sName);
    const ids = subId ? [subId] : [regionId];
    onFilterChange({ regionIds: ids });
    onSearch();
  };

  const handleLocationClear = () => {
    setSelectedRegionId(null);
    setSelectedSubregionId(null);
    setRegionName(null);
    setSubregionName(null);
    onFilterChange({ regionIds: [] });
    onSearch();
  };

  const handleTypeSelect = (bucket: Bucket) => {
    setSelectedBucket(bucket);
    onFilterChange({ categoryIds: bucket.category_ids });
    onSearch();
  };

  const handleTypeClear = () => {
    setSelectedBucket(null);
    onFilterChange({ categoryIds: [] });
    onSearch();
  };

  const handleSearchChange = (name: string) => {
    onFilterChange({ name });
    onSearch();
  };

  const handleNearbyClear = () => {
    onFilterChange({ ...clearPlacesNearby(), centerSiteTitle: null });
    onSearch();
  };

  const open = (sheet: typeof openSheet) => {
    if (nearbyActive && (sheet === "location" || sheet === "type")) return; // dimmed
    setOpenSheet(sheet);
  };

  return (
    <>
      {/* Chip bar */}
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
        {/* Search */}
        <button
          type="button"
          onClick={() => setOpenSheet("search")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all flex-shrink-0 ${
            filters.name
              ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
              : "bg-white border-gray-200 text-gray-600 hover:border-[var(--brand-orange)] hover:text-[var(--brand-orange)]"
          }`}
        >
          <Icon name="search" size={11} className={filters.name ? "text-white" : "text-gray-400"} />
          <span className="truncate max-w-[100px]">{searchLabel}</span>
          {filters.name && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); handleSearchChange(""); }}
              className="w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center hover:bg-white/50 flex-shrink-0"
            >
              <Icon name="times" size={7} className="text-white" />
            </span>
          )}
        </button>

        {/* Location */}
        <Chip
          label={locationLabel}
          active={!!selectedRegionId}
          dimmed={!!nearbyActive || undefined}
          onTap={() => open("location")}
          onClear={handleLocationClear}
        />

        {/* Type */}
        <Chip
          label={typeLabel}
          active={!!selectedBucket}
          dimmed={!!nearbyActive || undefined}
          onTap={() => open("type")}
          onClear={handleTypeClear}
        />

        {/* Advanced */}
        <Chip
          label={advancedLabel}
          active={advancedActive}
          onTap={() => setOpenSheet("advanced")}
          onClear={() => { onFilterChange({ categoryIds: selectedBucket?.category_ids ?? [] }); onSearch(); }}
        />

        {/* Nearby */}
        <Chip
          label={nearbyLabel}
          active={!!nearbyActive}
          onTap={() => setOpenSheet("nearby")}
          onClear={handleNearbyClear}
        />
      </div>

      {/* Sheets */}
      <SearchSheet
        isOpen={openSheet === "search"}
        onClose={() => setOpenSheet(null)}
        value={filters.name}
        onChange={handleSearchChange}
        popularSites={popularSites}
      />

      <LocationSheet
        isOpen={openSheet === "location"}
        onClose={() => setOpenSheet(null)}
        selectedRegionId={selectedRegionId}
        selectedSubregionId={selectedSubregionId}
        onSelect={handleLocationSelect}
        onClear={handleLocationClear}
      />

      <TypeSheet
        isOpen={openSheet === "type"}
        onClose={() => setOpenSheet(null)}
        buckets={buckets}
        selectedBucketId={selectedBucket?.id ?? null}
        onSelect={handleTypeSelect}
        onClear={handleTypeClear}
      />

      <AdvancedSheet
        isOpen={openSheet === "advanced"}
        onClose={() => setOpenSheet(null)}
        filters={filters}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
      />

      <NearbySheet
        isOpen={openSheet === "nearby"}
        onClose={() => setOpenSheet(null)}
        filters={filters}
        onFilterChange={onFilterChange}
        onSearch={onSearch}
      />
    </>
  );
}
