"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { searchRegions, type TravelMode } from "@/lib/trips";

/** UI icon wrapper (mirrors usage in the builder) */
function KIcon({
  name,
  size = 18,
  className,
}: {
  name:
    | "map-marker-alt"
    | "best-time-to-visit"
    | "travel-guide"
    | "car"
    | "hike"
    | "train";
  size?: number;
  className?: string;
}) {
  return <Icon name={name} size={size} className={className} />;
}

/** icon+label metadata (same labels as the builder) */
const MODE_META: Record<
  TravelMode | "train",
  { label: string; icon: Parameters<typeof KIcon>[0]["name"] }
> = {
  airplane: { label: "Airplane", icon: "best-time-to-visit" },
  bus: { label: "Bus", icon: "travel-guide" },
  car: { label: "Car", icon: "car" },
  walk: { label: "Walk/Trek", icon: "hike" },
  train: { label: "Train", icon: "train" },
};

/** Minimal shape the editor needs from the row being edited */
export type TravelRowInput = {
  id: string;
  from_region_id?: string | null;
  to_region_id?: string | null;
  mode: TravelMode | "train";
  duration_minutes?: number | null;
  distance_km?: number | null;
  /** optional display fields if available */
  from_region_name?: string | null;
  to_region_name?: string | null;
  travel_start_at?: string | null;
  travel_end_at?: string | null;
};

export type TravelDraft = {
  from_region_id: string | null;
  from_region_name: string | null;
  to_region_id: string | null;
  to_region_name: string | null;
  mode: TravelMode | "train";
  duration_hours: number | null;
  duration_mins: number | null;
  distance_km: number | null;
  travel_start_at: string | null;
  travel_end_at: string | null;
};

export type BuilderTravelDetailsProps = {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Close handler (ESC / overlay / cancel) */
  onClose: () => void;
  /** Row being edited (null = nothing to edit) */
  row: TravelRowInput | null;
  /**
   * Save handler. You’ll typically call your API (e.g., updateTravelLeg) in here,
   * then update parent state. Receives (row.id, normalized totalMinutes + fields).
   */
  onSave: (args: {
    id: string;
    /** If your backend doesn’t support “train”, map it to “bus” at the call site */
    mode: TravelMode | "train";
    from_region_id: string | null;
    to_region_id: string | null;
    distance_km: number | null;
    /** Computed from hours+mins; may be null */
    duration_minutes: number | null;
    /** Optional timestamp fields; pass through as-is or strip if unsupported */
    travel_start_at: string | null;
    travel_end_at: string | null;

    /** Friendly names (for optimistic UI in parent) */
    from_region_name: string | null;
    to_region_name: string | null;
  }) => Promise<void> | void;
};

/* ---------- Local reusable fade modal (scoped) ---------- */
function FadeModal({
  isOpen,
  onClose,
  maxWidthClass = "max-w-lg",
  children,
  z = 80,
}: {
  isOpen: boolean;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
  z?: number;
}) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[${z}] flex items-center justify-center p-4 transition-colors duration-200 ${
        visible ? "bg-black/30" : "bg-black/0"
      }`}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} transform rounded-2xl border bg-white shadow-2xl transition-all duration-200 ${
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- Component ---------- */
export default function Buildertraveldetails({
  isOpen,
  onClose,
  row,
  onSave,
}: BuilderTravelDetailsProps) {
  const [travelFromQuery, setTravelFromQuery] = useState("");
  const [travelToQuery, setTravelToQuery] = useState("");
  const [travelFromOpts, setTravelFromOpts] = useState<any[]>([]);
  const [travelToOpts, setTravelToOpts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initialDraft: TravelDraft | null = useMemo(() => {
    if (!row) return null;
    const mins = row.duration_minutes ?? null;
    const h = mins != null ? Math.floor(mins / 60) : null;
    const m = mins != null ? mins % 60 : null;
    return {
      from_region_id: row.from_region_id ?? null,
      from_region_name: row.from_region_name ?? null,
      to_region_id: row.to_region_id ?? null,
      to_region_name: row.to_region_name ?? null,
      mode: row.mode,
      duration_hours: h,
      duration_mins: m,
      distance_km: row.distance_km ?? null,
      travel_start_at: row.travel_start_at ?? null,
      travel_end_at: row.travel_end_at ?? null,
    };
  }, [row]);

  const [draft, setDraft] = useState<TravelDraft | null>(initialDraft);

  /** Refresh draft when a new row opens */
  useEffect(() => {
    setDraft(initialDraft);
    setTravelFromQuery("");
    setTravelToQuery("");
    setTravelFromOpts([]);
    setTravelToOpts([]);
    setErrorMsg(null);
  }, [initialDraft, isOpen]);

  /** region search (From) */
  useEffect(() => {
    let live = true;
    (async () => {
      if (travelFromQuery.trim().length < 2) return setTravelFromOpts([]);
      try {
        const res = await searchRegions(travelFromQuery.trim());
        if (live) setTravelFromOpts(res || []);
      } catch {
        if (live) setTravelFromOpts([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [travelFromQuery]);

  /** region search (To) */
  useEffect(() => {
    let live = true;
    (async () => {
      if (travelToQuery.trim().length < 2) return setTravelToOpts([]);
      try {
        const res = await searchRegions(travelToQuery.trim());
        if (live) setTravelToOpts(res || []);
      } catch {
        if (live) setTravelToOpts([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [travelToQuery]);

  if (!row) return null;

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const totalMinutes =
        (draft.duration_hours ?? 0) * 60 + (draft.duration_mins ?? 0);
      await onSave({
        id: row.id,
        mode: draft.mode,
        from_region_id: draft.from_region_id,
        to_region_id: draft.to_region_id,
        distance_km: draft.distance_km,
        duration_minutes: Number.isFinite(totalMinutes) ? totalMinutes : null,
        travel_start_at: draft.travel_start_at || null,
        travel_end_at: draft.travel_end_at || null,
        from_region_name: draft.from_region_name,
        to_region_name: draft.to_region_name,
      });
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to save travel.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FadeModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      z={80}
    >
      {draft && (
        <div className="p-5">
          <div className="mb-3 text-lg font-semibold text-slate-800">
            Edit travel
          </div>

          {errorMsg && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {/* From / To */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  From
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Search region…"
                  value={travelFromQuery}
                  onChange={(e) => setTravelFromQuery(e.target.value)}
                />
                {travelFromOpts.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border">
                    {travelFromOpts.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() =>
                          setDraft(
                            (d) =>
                              d && {
                                ...d,
                                from_region_id: r.id,
                                from_region_name: r.name,
                              }
                          )
                        }
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                {!!draft.from_region_name && (
                  <div className="mt-1 text-xs text-slate-600">
                    Selected: {draft.from_region_name}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  To
                </label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Search region…"
                  value={travelToQuery}
                  onChange={(e) => setTravelToQuery(e.target.value)}
                />
                {travelToOpts.length > 0 && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-md border">
                    {travelToOpts.map((r) => (
                      <button
                        key={r.id}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        onClick={() =>
                          setDraft(
                            (d) =>
                              d && {
                                ...d,
                                to_region_id: r.id,
                                to_region_name: r.name,
                              }
                          )
                        }
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                {!!draft.to_region_name && (
                  <div className="mt-1 text-xs text-slate-600">
                    Selected: {draft.to_region_name}
                  </div>
                )}
              </div>
            </div>

            {/* Mode buttons */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Mode
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  ["airplane", "bus", "car", "walk", "train"] as (
                    | TravelMode
                    | "train"
                  )[]
                ).map((m) => {
                  const meta = MODE_META[m];
                  const active = draft.mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      className={
                        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
                        (active
                          ? "border-blue-600 text-blue-700 bg-blue-50"
                          : "border-gray-300 hover:bg-gray-50")
                      }
                      onClick={() => setDraft((d) => d && { ...d, mode: m })}
                    >
                      <KIcon name={meta.icon} />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration + Distance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hours
                </label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={draft.duration_hours ?? ""}
                  onChange={(e) =>
                    setDraft(
                      (d) =>
                        d && {
                          ...d,
                          duration_hours: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }
                    )
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Minutes
                </label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={draft.duration_mins ?? ""}
                  onChange={(e) => {
                    const v = e.target.value
                      ? Math.min(Number(e.target.value), 59)
                      : null;
                    setDraft((d) => d && { ...d, duration_mins: v });
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Distance (km)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={draft.distance_km ?? ""}
                  onChange={(e) =>
                    setDraft(
                      (d) =>
                        d && {
                          ...d,
                          distance_km: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }
                    )
                  }
                />
              </div>
            </div>

            {/* Travel Start / End */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Travel Start
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={draft.travel_start_at ?? ""}
                  onChange={(e) =>
                    setDraft(
                      (d) =>
                        d && { ...d, travel_start_at: e.target.value || null }
                    )
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Travel End
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={draft.travel_end_at ?? ""}
                  onChange={(e) =>
                    setDraft(
                      (d) =>
                        d && { ...d, travel_end_at: e.target.value || null }
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              onClick={onClose}
              disabled={saving}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-[var(--brand-orange,#f59e0b)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              onClick={handleSave}
              disabled={saving}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </FadeModal>
  );
}
