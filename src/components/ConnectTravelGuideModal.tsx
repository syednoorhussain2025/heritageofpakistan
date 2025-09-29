// src/components/ConnectTravelGuideModal.tsx
"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";

type GuideRow = {
  id: string; // guide id
  status: "draft" | "published" | "archived";
  region_id: string;
  region_name: string;
  region_slug: string;
};

export type SelectedGuide = {
  id: string;
  name: string; // display name
  regionId: string;
  status: GuideRow["status"];
};

export default function ConnectTravelGuideModal({
  isOpen,
  onClose,
  onSelect,
  includeDrafts = false,
  initialQuery = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (g: SelectedGuide) => void;
  includeDrafts?: boolean;
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GuideRow[]>([]);
  const [openDd, setOpenDd] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Focus when opened
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ESC closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Click inside modal but outside combobox closes dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      const isInput = target.closest("#rtg-input");
      const isList = target.closest("#rtg-listbox");
      if (!isInput && !isList) setOpenDd(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced server query
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;

    const run = async () => {
      setLoading(true);
      try {
        const term = q.trim();
        const like = `%${term.replace(/\s+/g, "%")}%`; // keep wildcards active

        // ---- Base query against summary, embedding the guide (requires FK metadata) ----
        const baseSummaryQuery = () => {
          let qb = supabase
            .from("region_travel_guide_summary")
            .select(
              `
              guide_id,
              region_name,
              region_slug,
              updated_at,
              region_travel_guides!inner (
                id,
                status,
                region_id
              )
            `
            )
            .order("updated_at", { ascending: false })
            .limit(50);

          if (!includeDrafts) {
            qb = qb.eq("region_travel_guides.status", "published");
          }
          return qb;
        };

        let data: any[] | null = null;
        let error: any = null;

        if (!term) {
          const res = await baseSummaryQuery();
          data = res.data || [];
          error = res.error;
        } else {
          // Try direct ILIKE on denormalized fields first
          const res = await baseSummaryQuery().or(
            `region_name.ilike.${like},region_slug.ilike.${like}`
          );
          data = res.data || [];
          error = res.error;

          // Fallback: if none found (or join policies block it), resolve by regions then fetch guides
          if (!error && data.length === 0) {
            // 1) regions by name/slug
            const r1 = await supabase
              .from("regions")
              .select("id")
              .or(`name.ilike.${like},slug.ilike.${like}`)
              .limit(200);

            const regionIds = (r1.data || []).map((r) => r.id);
            if (regionIds.length > 0) {
              // 2) guides for those regions (respect published filter)
              let gq = supabase
                .from("region_travel_guides")
                .select("id,status,region_id")
                .in("region_id", regionIds)
                .order("updated_at", { ascending: false })
                .limit(100);
              if (!includeDrafts) gq = gq.eq("status", "published");

              const g1 = await gq;

              // 3) hydrate name/slug from summary for display
              if (!g1.error && (g1.data || []).length) {
                const guideIds = g1.data!.map((g) => g.id);
                const s2 = await supabase
                  .from("region_travel_guide_summary")
                  .select("guide_id,region_name,region_slug")
                  .in("guide_id", guideIds);

                const byGuide = new Map(
                  (s2.data || []).map((s) => [s.guide_id, s])
                );

                data = g1.data!.map((g) => ({
                  region_travel_guides: g,
                  region_name: byGuide.get(g.id)?.region_name ?? "",
                  region_slug: byGuide.get(g.id)?.region_slug ?? "",
                }));
              }
            }
          }
        }

        if (error) throw error;

        const mapped: GuideRow[] =
          (data || []).map((row: any) => ({
            id: row.region_travel_guides?.id,
            status: row.region_travel_guides?.status,
            region_id: row.region_travel_guides?.region_id,
            region_name: row.region_name ?? "",
            region_slug: row.region_slug ?? "",
          })) ?? [];

        if (!alive) return;
        setRows(mapped);
        setOpenDd(true);
        setHighlight(mapped.length > 0 ? 0 : -1);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setRows([]);
        setOpenDd(true);
        setHighlight(-1);
      } finally {
        if (alive) setLoading(false);
      }
    };

    const t = setTimeout(run, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, isOpen, includeDrafts]);

  const visible = isOpen;
  const validRows = rows ?? [];

  function selectIndex(idx: number) {
    const r = validRows[idx];
    if (!r) return;
    onSelect({
      id: r.id,
      name: r.region_name || r.region_slug,
      regionId: r.region_id,
      status: r.status,
    });
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openDd && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpenDd(true);
      return;
    }
    if (!openDd) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(validRows.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0) selectIndex(highlight);
    } else if (e.key === "Escape") {
      setOpenDd(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/50 px-3 py-6 sm:p-6">
      <div
        ref={rootRef}
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rtg-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Icon name="book" className="w-5 h-5 text-[var(--brand-orange)]" />
            <h2
              id="rtg-title"
              className="text-base font-semibold text-slate-900"
            >
              Connect Travel Guide
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!includeDrafts && (
              <span className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-[2px]">
                Showing Published
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
              aria-label="Close"
            >
              Close
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pt-4">
          <div
            className="relative"
            role="combobox"
            aria-haspopup="listbox"
            aria-owns="rtg-listbox"
            aria-expanded={openDd}
          >
            <div className="flex items-center gap-2">
              <Icon name="search" className="w-4 h-4 text-slate-500" />
              <input
                id="rtg-input"
                ref={inputRef}
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpenDd(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search guides by region name or slug…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                aria-autocomplete="list"
                aria-controls="rtg-listbox"
              />
            </div>

            {/* Results */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="px-3 py-3 text-sm text-slate-600">
                  Searching…
                </div>
              ) : validRows.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-600">
                  No matching guides.
                </div>
              ) : (
                <ul
                  id="rtg-listbox"
                  ref={listRef}
                  role="listbox"
                  className="max-h-[360px] overflow-auto divide-y divide-slate-100"
                >
                  {validRows.map((r, idx) => {
                    const isActive = idx === highlight;
                    const statusBadge =
                      r.status === "published"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : r.status === "draft"
                        ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                        : "bg-slate-50 text-slate-700 border-slate-200";

                    return (
                      <li
                        key={r.id}
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`px-3 py-3 cursor-pointer ${
                          isActive
                            ? "bg-blue-50"
                            : "bg-white hover:bg-emerald-50"
                        }`}
                        onMouseEnter={() => setHighlight(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectIndex(idx)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 pr-3">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {r.region_name || "—"}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              /{r.region_slug}
                            </div>
                          </div>
                          <span
                            className={`ml-2 inline-flex items-center rounded-full border px-2 py-[2px] text-[11px] ${statusBadge}`}
                          >
                            {r.status[0].toUpperCase() + r.status.slice(1)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Guide ID: {r.id}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Tip: Type a region (e.g., “Lahore”, “Hunza”). Press ↑/↓ to navigate,
            Enter to select.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
