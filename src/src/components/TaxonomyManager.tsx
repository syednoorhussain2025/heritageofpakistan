// src/components/TaxonomyManager.tsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";

// --- TYPE DEFINITIONS ---
type Row = {
  id: string | number;
  name: string;
  slug: string | null;
  parent_id: string | number | null;
  description: string | null;
  sort_order: number | null;
  icon_key: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type IconRow = { name: string; svg_content: string };
type Props = { title: string; table: "categories" | "regions" };

// --- UTILITY FUNCTIONS ---
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
const Spinner = ({ className = "w-4 h-4" }: { className?: string }) => (
  <span
    className={`inline-block ${className} animate-spin rounded-full border-2 border-slate-300 border-t-transparent`}
    aria-hidden="true"
  />
);
const Skeleton = ({ className = "" }: { className?: string }) => (
  <div
    className={`animate-pulse rounded-md bg-slate-200/80 ${className}`}
    aria-hidden="true"
  />
);

/* ──────────────────────────────────────────────────────────────────────────
   Google Maps (Places + draggable pin) — GEO-ONLY (lat/lng)
────────────────────────────────────────────────────────────────────────── */
function useGoogleMaps() {
  const [ready, setReady] = useState<boolean>(
    !!(globalThis as any)?.google?.maps
  );
  useEffect(() => {
    const g = (globalThis as any)?.google;
    if (g?.maps) {
      setReady(true);
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    const existing = document.getElementById("gmaps-script");
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

function PickableMap({
  lat,
  lng,
  onPick,
  className,
}: {
  lat?: number | null;
  lng?: number | null;
  onPick: (lat: number, lng: number) => void;
  className?: string;
}) {
  const ready = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Keep latest onPick without putting it in the effect deps
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  const center = useMemo(() => {
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
    return { lat: 30.3753, lng: 69.3451 };
  }, [lat, lng]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const g = (globalThis as any).google;
    if (!g?.maps) return;

    const map = new g.maps.Map(containerRef.current, {
      center,
      zoom: 6,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: false,
      gestureHandling: "greedy",
    });

    const marker = new g.maps.Marker({
      position: center,
      map,
      draggable: true,
      cursor: "grab",
      draggableCursor: "grabbing",
    });

    map.addListener("click", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(p);
      onPickRef.current?.(p.lat, p.lng); // GEO-ONLY
    });
    marker.addListener("dragend", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      onPickRef.current?.(p.lat, p.lng); // GEO-ONLY
    });

    // Search control (Places) — geometry only
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search location…";
    Object.assign(input.style, {
      boxSizing: "border-box",
      border: "1px solid #d1d5db",
      borderRadius: "8px",
      width: "320px",
      height: "38px",
      padding: "0 12px",
      margin: "10px",
      outline: "none",
      background: "#fff",
      fontSize: "14px",
      zIndex: "1000",
    } as CSSStyleDeclaration);

    // Anti-autofill
    input.setAttribute("autocomplete", "nope");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("spellcheck", "false");
    input.name = "gmaps-search-" + Math.random().toString(36).slice(2);

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") ev.preventDefault();
    });
    map.controls[g.maps.ControlPosition.TOP_LEFT].push(input);

    if (g.maps.places && typeof g.maps.places.Autocomplete === "function") {
      const autocomplete = new g.maps.places.Autocomplete(input, {
        fields: ["geometry"],
      });
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const p = { lat: loc.lat(), lng: loc.lng() };
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else {
          map.setCenter(p);
          map.setZoom(14);
        }
        marker.setPosition(p);
        onPickRef.current?.(p.lat, p.lng); // GEO-ONLY
      });
    }

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
    // IMPORTANT: keep deps constant length to avoid the warning
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setPosition(center);
    map.setCenter(center);
  }, [center]);

  if (!ready) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-gray-600 bg-white border border-gray-200 rounded-lg ${className}`}
      >
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          ? "Loading map…"
          : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map"}
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className={`rounded-lg border border-gray-200 ${className}`}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Toast (saving / saved)
────────────────────────────────────────────────────────────────────────── */
function Toast({
  state,
  lastSavedAt,
  message,
}: {
  state: "idle" | "saving" | "saved";
  lastSavedAt: Date | null;
  message?: string;
}) {
  if (state === "idle") return null;
  const label =
    state === "saving"
      ? message || "Saving…"
      : message ||
        `Saved ${
          lastSavedAt
            ? new Intl.DateTimeFormat(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(lastSavedAt)
            : "just now"
        }`;
  return (
    <div className="fixed bottom-4 right-4 z-[10000]">
      <div className="flex items-center gap-2 rounded-lg bg-slate-900/90 text-white px-3 py-2 shadow-lg backdrop-blur">
        {state === "saving" ? (
          <Spinner className="w-3.5 h-3.5" />
        ) : (
          <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current">
            <path d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3A1 1 0 016.207 9.793L8.5 12.086l6.543-6.543a1 1 0 011.414 0z" />
          </svg>
        )}
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Ensure slug uniqueness helpers
────────────────────────────────────────────────────────────────────────── */
async function ensureUniqueSlug(
  table: "categories" | "regions",
  baseSlug: string,
  excludeId?: string | number | null
) {
  const s0 = slugify(baseSlug || "");
  if (!s0) return s0;
  let candidate = s0;
  let n = 2;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("slug", candidate)
      .limit(1);
    if (error) break;
    const exists =
      Array.isArray(data) && data.length > 0 && data[0].id !== excludeId;
    if (!exists) return candidate;
    candidate = `${s0}-${n++}`;
  }
  return candidate;
}

/* ──────────────────────────────────────────────────────────────────────────
   Searchable Parent select
────────────────────────────────────────────────────────────────────────── */
function ParentSearchSelect({
  value,
  options,
  onChange,
  disabled,
  noneLabel = "— None —",
}: {
  value: string | number | null | undefined;
  options: { id: string | number; name: string }[];
  onChange: (v: string | number | null) => void;
  disabled?: boolean;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected =
    value == null ? null : options.find((o) => String(o.id) === String(value));
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.name.toLowerCase().includes(needle));
  }, [q, options]);

  const choose = (v: string | number | null) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full mt-1 flex items-center justify-between px-3 py-2 text-slate-900 bg-slate-100 rounded-md shadow-sm border border-transparent hover:shadow focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300] disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-left">
          {selected ? selected.name : noneLabel}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md bg-white shadow-lg ring-1 ring-black/5">
          <div className="p-2 border-b border-slate-200">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search parent…"
              className="w-full px-3 py-2 text-sm bg-slate-50 rounded-md border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
            />
          </div>
          <ul
            role="listbox"
            className="max-h-56 overflow-auto py-1"
            aria-label="Parent options"
          >
            <li>
              <button
                type="button"
                onClick={() => choose(null)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                  value == null ? "bg-slate-50 font-medium" : ""
                }`}
              >
                {noneLabel}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No results</li>
            ) : (
              filtered.map((o) => (
                <li key={String(o.id)}>
                  <button
                    type="button"
                    onClick={() => choose(o.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      String(value) === String(o.id)
                        ? "bg-slate-50 font-medium"
                        : ""
                    }`}
                  >
                    {o.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Edit Pane
────────────────────────────────────────────────────────────────────────── */
function EditPane({
  item,
  parentOptions,
  onSave,
  onCancel,
  onRemove,
  table,
  allIcons,
  saving,
}: {
  item: Row;
  parentOptions: { id: Row["id"]; name: string }[];
  onSave: (
    patch: Partial<Row>,
    opts?: { keepEditing?: boolean }
  ) => Promise<void>;
  onCancel: () => void;
  onRemove: (id: Row["id"]) => void;
  table: "categories" | "regions";
  allIcons: IconRow[];
  saving: boolean;
}) {
  const [local, setLocal] = useState<Row>(item);
  const [slugLocked, setSlugLocked] = useState<boolean>(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  // Autosave UI state
  const [toastState, setToastState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const prevSavingRef = useRef<boolean>(false);
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLocal(item);
    const customized = !!item.slug && item.slug !== slugify(item.name ?? "");
    setSlugLocked(customized);
  }, [item]);

  // Build patch (NEVER include id)
  const computePatch = useCallback((base: Row, current: Row): Partial<Row> => {
    const patch: Partial<Row> = {};
    (Object.keys(current) as Array<keyof Row>).forEach((key) => {
      if (key === "id") return;
      if (current[key] !== base[key]) (patch as any)[key] = current[key];
    });
    if (!patch.slug && !current.slug) patch.slug = slugify(current.name);
    else if (typeof patch.slug === "string") patch.slug = slugify(patch.slug);
    return patch;
  }, []);

  const saveWithUI = async ({
    keepEditing = true,
    showToast = true,
    toastLabelSaving = "Saving…",
    onlyFields,
  }: {
    keepEditing?: boolean;
    showToast?: boolean;
    toastLabelSaving?: string;
    onlyFields?: (keyof Row)[];
  } = {}) => {
    let patch = computePatch(item, local);

    if (onlyFields && onlyFields.length > 0) {
      patch = Object.fromEntries(
        Object.entries(patch).filter(([k]) =>
          (onlyFields as string[]).includes(k)
        )
      ) as Partial<Row>;
    }

    if (Object.keys(patch).length === 0) return;

    if (typeof patch.slug === "string" && patch.slug) {
      patch.slug = await ensureUniqueSlug(table, patch.slug, item.id);
    }

    if (showToast) setToastState("saving");
    try {
      await onSave(patch, { keepEditing });
      if (showToast) {
        setLastSavedAt(new Date());
        setToastState("saved");
      }
    } catch (e: any) {
      const msg = e?.message || "";
      const looksLikeUnique =
        msg.includes("duplicate key") ||
        msg.includes("unique constraint") ||
        e?.code === "23505";
      if (looksLikeUnique && typeof patch.slug === "string") {
        const uniqueSlug = await ensureUniqueSlug(table, patch.slug, item.id);
        if (uniqueSlug !== patch.slug) {
          patch.slug = uniqueSlug;
          if (onlyFields && onlyFields.length > 0) {
            patch = Object.fromEntries(
              Object.entries(patch).filter(([k]) =>
                (onlyFields as string[]).includes(k)
              )
            ) as Partial<Row>;
          }
          await onSave(patch, { keepEditing });
          if (showToast) {
            setLastSavedAt(new Date());
            setToastState("saved");
          }
          return;
        }
      }
      alert(msg || "Save failed");
      setToastState("idle");
    }
  };

  const parseOrNull = (v: string) => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // Auto-save every 10 seconds
  useEffect(() => {
    if (autosaveTimer.current) clearInterval(autosaveTimer.current);
    autosaveTimer.current = setInterval(() => {
      void saveWithUI({
        keepEditing: true,
        showToast: true,
        toastLabelSaving: "Auto-saving…",
      });
    }, 10_000);
    return () => {
      if (autosaveTimer.current) clearInterval(autosaveTimer.current);
    };
  }, [item, local, computePatch, table]);

  // Hook toast state to parent saving
  useEffect(() => {
    const wasSaving = prevSavingRef.current;
    if (wasSaving && !saving && toastState === "saving") {
      setLastSavedAt(new Date());
      setToastState("saved");
    }
    prevSavingRef.current = saving;
  }, [saving, toastState]);

  useEffect(() => {
    if (toastState !== "saved") return;
    const t = setTimeout(() => setToastState("idle"), 2500);
    return () => clearTimeout(t);
  }, [toastState]);

  return (
    <>
      <IconPickerModal
        isOpen={isIconPickerOpen}
        onClose={() => setIsIconPickerOpen(false)}
        icons={allIcons}
        currentIcon={local.icon_key}
        onSelect={(iconName) => {
          setLocal((prev) => ({ ...prev, icon_key: iconName }));
          setIsIconPickerOpen(false);
        }}
      />

      <div className="p-6 bg-white rounded-2xl h-full flex flex-col shadow-xl shadow-slate-300/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Editing: {item.name}
            </h2>
            <p className="text-sm text-slate-500">
              Make changes to your{" "}
              {table === "categories" ? "category" : "region"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => saveWithUI({ keepEditing: true, showToast: true })}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Spinner /> : null}
            <span>Save</span>
          </button>
        </div>

        <div className="flex-grow min-h-0 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 items-start">
            <div className="space-y-5 md:col-span-2 lg:col-span-5">
              {/* Name / Slug (manual; not affected by map) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Name
                  </label>
                  <input
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full px-3 py-2 mt-1 text-slate-900 placeholder-slate-400 bg-slate-100 rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                    value={local.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setLocal((prev) => ({
                        ...prev,
                        name: newName,
                        slug: slugLocked ? prev.slug : slugify(newName),
                      }));
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">
                      Slug
                    </label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#F78300] hover:underline"
                      onClick={() => {
                        setSlugLocked(true);
                        setLocal((prev) => ({
                          ...prev,
                          slug: slugify(prev.name),
                        }));
                      }}
                      title="Generate slug from Name"
                    >
                      Sync from Name
                    </button>
                  </div>
                  <input
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="w-full px-3 py-2 mt-1 text-slate-900 placeholder-slate-400 bg-slate-100 rounded-md shadow-sm border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                    value={local.slug ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSlugLocked(true);
                      setLocal((prev) => ({ ...prev, slug: v }));
                    }}
                  />
                </div>
              </div>

              {/* Parent / Icon */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Parent
                  </label>
                  <ParentSearchSelect
                    value={local.parent_id ?? null}
                    options={parentOptions.filter((p) => p.id !== item.id)}
                    onChange={(val) =>
                      setLocal((prev) => ({
                        ...prev,
                        parent_id: val === null ? null : (val as any),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Icon
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsIconPickerOpen(true)}
                    className="w-full mt-1 flex items-center gap-3 px-3 py-2 text-slate-900 bg-slate-100 rounded-md shadow-sm border border-transparent hover:shadow focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                  >
                    {local.icon_key ? (
                      <Icon
                        name={local.icon_key}
                        size={20}
                        className="text-[#F78300]"
                      />
                    ) : (
                      <div className="w-5 h-5 bg-slate-200 rounded" />
                    )}
                    <span className="text-slate-600">
                      {local.icon_key || "Select an icon"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Location (regions only) */}
              {table === "regions" && (
                <div className="pt-2 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Location (optional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-600">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        autoComplete="off"
                        className="w-full px-3 py-2 mt-1 text-slate-900 bg-slate-100 rounded-md border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                        value={
                          typeof local.latitude === "number"
                            ? local.latitude
                            : local.latitude ?? ""
                        }
                        onChange={(e) =>
                          setLocal((prev) => ({
                            ...prev,
                            latitude: parseOrNull(e.target.value),
                          }))
                        }
                        placeholder="e.g. 31.520370"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        autoComplete="off"
                        className="w-full px-3 py-2 mt-1 text-slate-900 bg-slate-100 rounded-md border border-transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/50 focus:border-[#F78300]"
                        value={
                          typeof local.longitude === "number"
                            ? local.longitude
                            : local.longitude ?? ""
                        }
                        onChange={(e) =>
                          setLocal((prev) => ({
                            ...prev,
                            longitude: parseOrNull(e.target.value),
                          }))
                        }
                        placeholder="e.g. 74.358748"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Map */}
            <div
              className={`md:col-span-2 lg:col-span-7 ${
                table === "regions" ? "block" : "hidden lg:block"
              }`}
            >
              {table === "regions" && (
                <div className="lg:sticky lg:top-4">
                  <PickableMap
                    lat={
                      typeof local.latitude === "number" ? local.latitude : null
                    }
                    lng={
                      typeof local.longitude === "number"
                        ? local.longitude
                        : null
                    }
                    onPick={(plat, plng) =>
                      setLocal((prev) => ({
                        ...prev,
                        latitude: Number(plat.toFixed(6)),
                        longitude: Number(plng.toFixed(6)),
                      }))
                    }
                    className="w-full h-72 md:h-80 lg:h-[520px]"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Click, drag the pin, or use the search box to set
                      coordinates.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        saveWithUI({
                          keepEditing: true,
                          showToast: true,
                          onlyFields: ["latitude", "longitude"],
                        })
                      }
                      disabled={saving}
                      className="ml-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? <Spinner className="w-3 h-3" /> : null}
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-slate-100 flex-shrink-0">
          <button
            className="px-4 py-2 text-sm font-semibold text-red-600 rounded-md hover:bg-red-50"
            onClick={() => onRemove(item.id)}
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700"
              onClick={() =>
                saveWithUI({ keepEditing: false, showToast: true })
              }
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <Toast state={toastState} lastSavedAt={lastSavedAt} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main Component
────────────────────────────────────────────────────────────────────────── */
export default function TaxonomyManager({ title, table }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [allIcons, setAllIcons] = useState<IconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<Row["id"] | null>(null);

  // Height calc
  const [containerH, setContainerH] = useState<number | null>(null);
  useEffect(() => {
    const calc = () => {
      const headerEl =
        (document.querySelector("[data-app-header]") as HTMLElement) ||
        (document.querySelector("header") as HTMLElement) ||
        null;
      const headerH = headerEl ? headerEl.offsetHeight : 0;
      const bottomMargin = 8;
      const h = Math.max(320, window.innerHeight - headerH - bottomMargin);
      setContainerH(h);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: taxonomyData, error: taxonomyError },
      { data: iconData, error: iconError },
    ] = await Promise.all([
      supabase
        .from(table)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("icons").select("name, svg_content"),
    ]);

    if (taxonomyError) {
      console.error("Error loading data:", taxonomyError);
      alert(taxonomyError.message);
    } else {
      setRows((taxonomyData as Row[]) || []);
    }

    if (iconError) {
      console.error("Error loading icons:", iconError);
      alert(iconError.message);
    } else {
      setAllIcons((iconData as IconRow[]) || []);
    }
    setLoading(false);
  }, [table]);

  useEffect(() => {
    load();
  }, [load]);

  const parentOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    const filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.slug ?? "").toLowerCase().includes(needle)
    );
    const parentIds = new Set(filtered.map((r) => r.parent_id).filter(Boolean));
    return rows.filter(
      (r) => filtered.some((f) => f.id === r.id) || parentIds.has(r.id)
    );
  }, [rows, q]);

  const selectedItem = useMemo(
    () => rows.find((r) => r.id === selectedId),
    [rows, selectedId]
  );

  async function createItem() {
    const baseName = "New " + (table === "categories" ? "Category" : "Region");
    const baseSlug = slugify(baseName) + "-" + String(Date.now()).slice(-6);
    const uniqueSlug = await ensureUniqueSlug(table, baseSlug, null);
    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .insert({ name: baseName, slug: uniqueSlug } as any)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    const newItem = data as Row;
    setRows([...rows, newItem]);
    setSelectedId(newItem.id);
  }

  // Update (never pass id to patch)
  async function updateItem(
    patch: Partial<Row>,
    opts: { keepEditing?: boolean } = {}
  ) {
    if (!selectedId || Object.keys(patch).length === 0) {
      if (!opts.keepEditing) setSelectedId(null);
      return;
    }
    if ("id" in patch) {
      const { id, ...rest } = patch as any;
      patch = rest;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .update(patch)
      .eq("id", selectedId as any)
      .select()
      .single();
    setSaving(false);
    if (error) {
      throw error;
    }
    setRows(rows.map((r) => (r.id === selectedId ? (data as Row) : r)));
    if (!opts.keepEditing) setSelectedId(null);
  }

  async function removeItem(id: Row["id"]) {
    if (
      !confirm(
        "Are you sure you want to delete this item? This action cannot be undone."
      )
    )
      return;
    setSaving(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setSaving(false);
    if (error) return alert(error.message);
    setRows(rows.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function TreeLine({ r, level = 0 }: { r: Row; level?: number }) {
    const children = rows.filter((x) => x.parent_id === r.id);
    const isSelected = selectedId === r.id;
    return (
      <div className="space-y-1">
        <div
          onClick={() => setSelectedId(r.id)}
          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
            isSelected ? "bg-blue-50 shadow" : "hover:bg-slate-50"
          }`}
          style={{ paddingLeft: `${0.5 + level * 1.5}rem` }}
        >
          <div className="flex items-center gap-2">
            {r.icon_key ? (
              <Icon name={r.icon_key} size={16} className="text-[#F78300]" />
            ) : (
              <div className="w-4 h-4 rounded bg-slate-200" />
            )}
            <span className="font-medium text-slate-900">{r.name}</span>
          </div>
        </div>
        {children.length > 0 && (
          <div>
            {children
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((c) => (
                <TreeLine key={c.id} r={c} level={level + 1} />
              ))}
          </div>
        )}
      </div>
    );
  }

  const rootItems = useMemo(
    () =>
      filteredRows
        .filter((r) => r.parent_id == null)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [filteredRows]
  );

  const managerIconKey = table === "categories" ? "categorytax" : "regiontax";

  return (
    <AdminGuard>
      <div
        className="bg-slate-100/70 p-6 md:p-8 md:px-10 pb-0 overflow-hidden"
        style={containerH ? { height: containerH } : undefined}
      >
        <div className="max-w-7xl mx-auto h-full text-slate-800 overflow-hidden">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4 h-full min-h-0">
            {/* Left column */}
            <div className="space-y-4 md:col-span-1 lg:col-span-1 flex flex-col h-full min-h-0">
              <h1 className="text-2xl font-bold text-slate-900 flex-shrink-0 flex items-center gap-2">
                <Icon
                  name={managerIconKey}
                  size={22}
                  className="text-slate-700"
                />
                {title}
              </h1>

              <Link
                href="/admin"
                className="text-sm text-slate-500 hover:text-slate-700 hover:underline flex items-center gap-1"
              >
                ← Back to Admin
              </Link>

              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 placeholder-slate-400 bg-white rounded-md shadow-sm border border transparent focus:outline-none focus:ring-2 focus:ring-[#F78300]/40 focus:border-[#F78300]"
                />
                <button
                  className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md whitespace-nowrap hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
                  onClick={createItem}
                  disabled={saving}
                >
                  {saving ? (
                    <Spinner />
                  ) : (
                    <span className="leading-none">＋</span>
                  )}
                  <span>Add New</span>
                </button>
              </div>

              <div className="flex-1 p-2 space-y-1 bg-white rounded-2xl overflow-y-auto min-h-0 shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                {loading ? (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : rootItems.length > 0 ? (
                  rootItems.map((r, idx) => (
                    <div
                      key={r.id}
                      className={`pb-1 mb-1 ${
                        idx < rootItems.length - 1
                          ? "border-b border-slate-100"
                          : ""
                      }`}
                    >
                      <TreeLine r={r} />
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm text-center text-slate-500">
                    No items found.
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="md:col-span-2 lg:col-span-3 h-full min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-full p-8 bg-white rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-4">
                    <Spinner className="w-8 h-8" />
                    <p className="text-slate-600 text-sm">Loading editor…</p>
                    <div className="w-80 space-y-3 mt-2">
                      <Skeleton className="h-6" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                      <Skeleton className="h-24" />
                    </div>
                  </div>
                </div>
              ) : selectedItem ? (
                <EditPane
                  item={selectedItem}
                  parentOptions={parentOptions}
                  onSave={updateItem}
                  onCancel={() => setSelectedId(null)}
                  onRemove={removeItem}
                  table={table}
                  allIcons={allIcons}
                  saving={saving}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-8 text-center bg-white rounded-2xl shadow-xl shadow-slate-300/50 backdrop-blur-sm">
                  <div className="text-slate-500 flex flex-col items-center">
                    <Icon
                      name={managerIconKey}
                      size={64}
                      className="text-slate-300 mb-3"
                    />
                    <h3 className="text-lg font-medium text-slate-800">
                      Select an item to edit
                    </h3>
                    <p className="mt-1 text-sm">
                      Choose an item from the list on the left to make changes,
                      or add a new one.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Make Places dropdown appear over modals etc. */}
        <style jsx global>{`
          .pac-container {
            z-index: 99999 !important;
          }
        `}</style>
      </div>
    </AdminGuard>
  );
}
