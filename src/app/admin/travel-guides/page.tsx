// src/app/admin/travel-guides/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import AdminGuard from "@/components/AdminGuard";
import { supabase } from "@/lib/supabase/browser";
import SummaryTab from "./SummaryTab";

/**
 * Wrapper page that mirrors your Listing Editor UX:
 * - Fixed left sidebar (sticky), with Region typeahead, Tabs, Save/Publish
 * - Right content area renders the active tab
 * - Uses same Tailwind tokens/colors as your admin UI
 */

type Region = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  is_active: boolean | null;
};

type Guide = {
  id: string;
  region_id: string;
  status: "draft" | "published" | "archived";
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export default function TravelGuideWrapperPage() {
  return (
    <AdminGuard>
      <MainShell />
    </AdminGuard>
  );
}

function MainShell() {
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);

  // tabs
  type TabKey = "summary"; // add future tabs here
  const [active, setActive] = useState<TabKey>("summary");

  // parent-level Save button triggers the active tab's save handler
  const saveHandlers = useRef<Partial<Record<TabKey, () => Promise<void>>>>({});
  function registerSave(tab: TabKey, fn: () => Promise<void>) {
    saveHandlers.current[tab] = fn;
  }

  // ---- Toast state (self-contained) ----
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const toastTimer = useRef<number | null>(null);

  function showToast(message: string, durationMs = 2000) {
    setToast({ visible: true, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
      toastTimer.current = null;
    }, durationMs);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Prevent overlapping saves
  const savingRef = useRef(false);

  async function saveActive() {
    const fn = saveHandlers.current[active];
    if (!fn) {
      alert("Nothing to save on this tab.");
      return;
    }
    if (savingRef.current) return; // skip if a save is already running

    savingRef.current = true;
    try {
      await fn();
      showToast("Saved");
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? e}`);
    } finally {
      savingRef.current = false;
    }
  }

  // -----------------------------
  // Typeahead region search
  // -----------------------------
  const [q, setQ] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [openDd, setOpenDd] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Debounced fetch
  useEffect(() => {
    let alive = true;
    const handler = setTimeout(async () => {
      const term = q.trim();
      if (!term) {
        if (alive) setRegions([]);
        return;
      }
      setLoadingRegions(true);
      try {
        const { data, error } = await supabase
          .from("regions")
          .select("id,name,slug,parent_id,is_active")
          .ilike("name", `%${term}%`)
          .order("name", { ascending: true })
          .limit(24);
        if (error) throw error;
        if (!alive) return;
        setRegions(data ?? []);
        setOpenDd(true);
        setHighlight(data && data.length > 0 ? 0 : -1);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (alive) setLoadingRegions(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(handler);
    };
  }, [q]);

  // Click outside to close dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setOpenDd(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!openDd && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpenDd(true);
      return;
    }
    if (!openDd) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => {
        const next = Math.min((regions?.length ?? 0) - 1, h + 1);
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => {
        const next = Math.max(0, h - 1);
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && regions[highlight]) {
        selectRegion(regions[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpenDd(false);
    }
  }

  function scrollIntoView(idx: number) {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const { top: lTop, bottom: lBottom } = list.getBoundingClientRect();
    if (top < lTop) el.scrollIntoView({ block: "nearest" });
    else if (bottom > lBottom) el.scrollIntoView({ block: "nearest" });
  }

  async function selectRegion(r: Region) {
    setSelectedRegion(r);
    setOpenDd(false);
    setQ(r.name);

    // fetch or create guide for region
    setGuide(null);
    const { data: existing, error: gErr } = await supabase
      .from("region_travel_guides")
      .select("*")
      .eq("region_id", r.id)
      .maybeSingle();
    if (gErr && gErr.code !== "PGRST116") {
      alert(`Error loading guide: ${gErr.message}`);
      return;
    }
    if (!existing) {
      const { data: created, error: cErr } = await supabase
        .from("region_travel_guides")
        .insert({ region_id: r.id, status: "draft" })
        .select("*")
        .single();
      if (cErr) {
        alert(`Error creating guide: ${cErr.message}`);
        return;
      }
      setGuide(created as any);
    } else {
      setGuide(existing as any);
    }
  }

  const tabs: { key: TabKey; label: string; icon: string }[] = useMemo(
    () => [
      { key: "summary", label: "Summary", icon: "book" },
      // future tabs...
    ],
    []
  );

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800">
      <main className="mx-auto max-w-7xl py-8 px-4 sm:px-6 lg:px-8">
        {/* Title / header */}
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="flex items-center gap-3 text-3xl font-bold"
            style={{ color: "var(--brand-blue)" }}
          >
            <Icon
              name="adminmap"
              size={44}
              style={{ color: "var(--brand-blue)" }}
            />
            Travel Guide Manager
          </h1>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900/40 px-4 py-2 text-white hover:bg-slate-900 transition"
            title="Back to Admin Dashboard"
          >
            <Icon name="admin" size={18} />
            <span className="text-sm">Admin</span>
          </Link>
        </div>

        {/* Two-column layout: sticky left rail + content */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
          {/* Left Sidebar (sticky) */}
          <aside className="lg:sticky lg:top-6 h-fit">
            {/* Region typeahead */}
            <div
              className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm mb-4"
              ref={boxRef}
            >
              <div className="mb-2 text-sm font-semibold text-slate-900">
                Select Region
              </div>

              <div
                className="relative"
                role="combobox"
                aria-haspopup="listbox"
                aria-owns="region-listbox"
                aria-expanded={openDd}
              >
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOpenDd(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if ((regions?.length ?? 0) > 0) setOpenDd(true);
                  }}
                  type="text"
                  placeholder="Search regions…"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  aria-autocomplete="list"
                  aria-controls="region-listbox"
                />

                {/* Dropdown */}
                {openDd && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    {loadingRegions ? (
                      <div className="px-3 py-2 text-sm text-slate-600">
                        Searching…
                      </div>
                    ) : regions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-600">
                        No matches
                      </div>
                    ) : (
                      <ul
                        id="region-listbox"
                        role="listbox"
                        ref={listRef}
                        className="max-h-[320px] overflow-auto rounded-md"
                      >
                        {regions.map((r, idx) => {
                          const isActive = idx === highlight;
                          return (
                            <li
                              key={r.id}
                              id={`region-opt-${idx}`}
                              data-idx={idx}
                              role="option"
                              aria-selected={isActive}
                              onMouseEnter={() => setHighlight(idx)}
                              onMouseDown={(e) => e.preventDefault()} // keep input focus
                              onClick={() => selectRegion(r)}
                              className={`cursor-pointer px-3 py-2 text-sm border-b last:border-b-0 ${
                                isActive
                                  ? "bg-emerald-50 border-emerald-200 text-slate-900"
                                  : "bg-white hover:bg-emerald-50 border-slate-200 text-slate-700"
                              }`}
                            >
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-slate-500">
                                /{r.slug}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tabs list */}
            <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sections
              </div>
              <nav className="flex flex-col gap-1">
                {tabs.map((t) => {
                  const isActive = active === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setActive(t.key)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? "bg-blue-50 text-slate-900 border border-blue-200"
                          : "bg-white hover:bg-emerald-50 text-slate-700 border border-transparent hover:border-emerald-200"
                      }`}
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Icon name={t.icon} size={14} />
                      </span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Save / Publish controls */}
            <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => saveActive()}
                  className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-600"
                >
                  Save
                </button>
                {guide && <PublishControls guide={guide} onChange={setGuide} />}
              </div>
            </div>
          </aside>

          {/* Right content area */}
          <section className="min-w-0">
            {/* Region context header */}
            <div className="mb-4 rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Region</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {selectedRegion
                      ? selectedRegion.name
                      : "No region selected"}
                  </div>
                  {guide && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Guide ID: {guide.id}
                    </div>
                  )}
                </div>
                {guide && <StatusBadge status={guide.status} />}
              </div>
            </div>

            {/* Active tab */}
            <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
              {!selectedRegion || !guide ? (
                <div className="py-12 text-center text-slate-600">
                  <div className="mb-2 text-base font-medium">
                    Start by selecting a region
                  </div>
                  <div className="text-sm">
                    Type to search, then pick a region from the dropdown.
                  </div>
                </div>
              ) : (
                <>
                  {active === "summary" && (
                    <SummaryTab
                      guide={guide}
                      onRegisterSave={(fn) => registerSave("summary", fn)}
                    />
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Toast (bottom-center) */}
      <div
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center transition-opacity duration-200 ${
          toast.visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto rounded-full bg-slate-900 text-white px-4 py-2 shadow-lg border border-slate-800/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon name="check" size={16} />
            <span>{toast.message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Guide["status"] }) {
  const style =
    status === "published"
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : status === "archived"
      ? "bg-red-50 text-red-900 border-red-200"
      : "bg-slate-50 text-slate-900 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${style}`}
    >
      {status === "published"
        ? "Published"
        : status === "archived"
        ? "Archived"
        : "Draft"}
    </span>
  );
}

function PublishControls({
  guide,
  onChange,
}: {
  guide: Guide;
  onChange: (g: Guide) => void;
}) {
  async function setStatus(next: Guide["status"]) {
    try {
      const patch: Partial<Guide> =
        next === "published"
          ? { status: "published", published_at: new Date().toISOString() }
          : { status: next };
      const { data, error } = await supabase
        .from("region_travel_guides")
        .update(patch)
        .eq("id", guide.id)
        .select("*")
        .single();
      if (error) throw error;
      onChange(data as any);
    } catch (e: any) {
      alert(`Failed to update status: ${e?.message ?? e}`);
    }
  }

  const isPublished = guide.status === "published";

  return (
    <div className="flex gap-2">
      <button
        onClick={() => setStatus(isPublished ? "draft" : "published")}
        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold border transition ${
          isPublished
            ? "bg-red-50 text-red-900 border-red-200 hover:bg-red-100"
            : "bg-blue-50 text-slate-900 border-blue-200 hover:bg-emerald-50 hover:border-emerald-200"
        }`}
      >
        {isPublished ? "Unpublish" : "Publish"}
      </button>
      <button
        onClick={() => setStatus("archived")}
        className="rounded-lg px-4 py-2 text-sm border bg-slate-50 text-slate-900 hover:bg-slate-100"
      >
        Archive
      </button>
    </div>
  );
}
