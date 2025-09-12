"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

/**
 * HbA1c + Glucose Log – Two-Pane UX (+ custom range + graph)
 *
 * Features:
 * - Custom calendar date range selector (30/60/90/180/365/all + custom)
 * - "Graph" button → modal with time-series chart for the current range
 * - Graph toggle: show only fasting entries
 * - HbA1c warning: card turns red + warning message if Estimated HbA1c ≥ 5.7%
 * - CSV import/export; localStorage persistence
 */

// Lazy-load Recharts on client (avoids SSR issues)
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false }
);
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), {
  ssr: false,
});
const Line = dynamic(() => import("recharts").then((m) => m.Line), {
  ssr: false,
});
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
});
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import("recharts").then((m) => m.CartesianGrid),
  { ssr: false }
);
const ReferenceArea = dynamic(
  () => import("recharts").then((m) => m.ReferenceArea),
  { ssr: false }
);
const ReferenceLine = dynamic(
  () => import("recharts").then((m) => m.ReferenceLine),
  { ssr: false }
);

// ---------------- Constants ----------------
const A1C_SLOPE = 28.7; // NGSP/DCCT
const A1C_INTERCEPT = -46.7;
const MGDL_PER_MMOLL = 18;
const LS_KEY = "hba1c_glucose_log_v3";

type Unit = "mgdl" | "mmoll";

type Entry = {
  id: string;
  datetime: string; // ISO
  mgdl: number; // stored in mg/dL
  tag?: string; // fasting | post-meal | exercise | bedtime
  note?: string;
};

type RangeKey = "30d" | "60d" | "90d" | "180d" | "365d" | "all" | "custom";

// ---------------- Helpers ----------------
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : n;

function mmollToMgdl(x: number) {
  return x * MGDL_PER_MMOLL;
}
function mgdlToMmoll(x: number) {
  return x / MGDL_PER_MMOLL;
}

function parseNum(s: string): number | null {
  if (!s) return null;
  const n = Number(String(s).trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number, d = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function rangeStart(key: Exclude<RangeKey, "custom">): Date | null {
  if (key === "all") return null;
  const now = new Date();
  const days = { "30d": 30, "60d": 60, "90d": 90, "180d": 180, "365d": 365 }[
    key
  ]!;
  return new Date(now.getTime() - days * 86400000);
}

function withinPresetRange(dtISO: string, key: Exclude<RangeKey, "custom">) {
  const start = rangeStart(key);
  return !start || new Date(dtISO).getTime() >= start.getTime();
}

function withinCustomRange(dtISO: string, startISO?: string, endISO?: string) {
  const t = new Date(dtISO).getTime();
  const s = startISO ? new Date(startISO).setHours(0, 0, 0, 0) : -Infinity;
  const e = endISO ? new Date(endISO).setHours(23, 59, 59, 999) : Infinity;
  return t >= s && t <= e;
}

function calcStats(values: number[]) {
  if (!values.length)
    return { count: 0, mean: NaN, median: NaN, sd: NaN, min: NaN, max: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const count = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / count;
  const median =
    count % 2
      ? sorted[(count - 1) / 2]
      : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / count);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { count, mean, median, sd, min, max };
}

function meanToA1c(mgdl: number) {
  return (mgdl + Math.abs(A1C_INTERCEPT)) / A1C_SLOPE;
}

function a1cBand(a1c: number) {
  if (!Number.isFinite(a1c))
    return { label: "—", color: "bg-slate-200 text-slate-700" } as const;
  if (a1c < 5.7)
    return {
      label: "Normal",
      color: "bg-[#00b78b]/15 text-[#067a60]",
    } as const;
  if (a1c < 6.5)
    return {
      label: "Prediabetes",
      color: "bg-amber-100 text-amber-800",
    } as const;
  return { label: "Diabetes range", color: "bg-red-100 text-red-700" } as const;
}

// ---------------- Component ----------------
export default function HbA1cLogPage() {
  // state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [unit, setUnit] = useState<Unit>("mgdl");
  const [range, setRange] = useState<RangeKey>("90d");
  const [customStart, setCustomStart] = useState<string>(""); // yyyy-MM-dd
  const [customEnd, setCustomEnd] = useState<string>("");

  // entry inputs
  const [dt, setDt] = useState<string>(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [val, setVal] = useState<string>("");
  const [tag, setTag] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // graph modal
  const [showGraph, setShowGraph] = useState(false);
  const [graphFastingOnly, setGraphFastingOnly] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // load/save
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(entries));
    } catch {}
  }, [entries]);

  // filtering
  const filteredBase = useMemo(() => {
    if (range === "custom") {
      return entries.filter((e) =>
        withinCustomRange(
          e.datetime,
          customStart || undefined,
          customEnd || undefined
        )
      );
    }
    return entries.filter((e) =>
      withinPresetRange(e.datetime, range as Exclude<RangeKey, "custom">)
    );
  }, [entries, range, customStart, customEnd]);

  const filtered = useMemo(() => filteredBase, [filteredBase]);

  const stats = useMemo(
    () => calcStats(filtered.map((e) => e.mgdl)),
    [filtered]
  );
  const estA1c = useMemo(() => meanToA1c(stats.mean), [stats.mean]);
  const band = a1cBand(estA1c);
  const isHighA1c = Number.isFinite(estA1c) && (estA1c as number) >= 5.7; // ≥ 5.7% → warning

  // actions
  function addEntry() {
    const n = parseNum(val);
    if (n == null) return;
    const mgdl = clamp(unit === "mgdl" ? n : mmollToMgdl(n), 20, 800);
    const iso = new Date(dt).toISOString();
    setEntries((prev) => [
      {
        id: uid(),
        datetime: iso,
        mgdl,
        tag: tag || undefined,
        note: note.trim(),
      },
      ...prev,
    ]);
    setVal("");
    setNote("");
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function clearAll() {
    if (confirm("Clear all saved readings?")) setEntries([]);
  }

  function exportCSV() {
    const header = ["id", "datetime", "mgdl", "tag", "note"].join(",");
    const body = entries
      .map((r) =>
        [
          r.id,
          r.datetime,
          String(r.mgdl),
          r.tag ?? "",
          (r.note ?? "").replace(/"/g, '""'),
        ].join(",")
      )
      .join("\n");
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `glucose-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importCSV(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines.shift();
      if (!header) return;
      const cols = header.split(",");
      const idx = {
        id: cols.indexOf("id"),
        datetime: cols.indexOf("datetime"),
        mgdl: cols.indexOf("mgdl"),
        tag: cols.indexOf("tag"),
        note: cols.indexOf("note"),
      };
      const rows: Entry[] = [];
      for (const line of lines) {
        const parts = line.split(",");
        const id = parts[idx.id] || uid();
        const datetime = parts[idx.datetime] || new Date().toISOString();
        const mgdl = Number(parts[idx.mgdl]);
        const tag = parts[idx.tag] || "";
        const note = parts[idx.note] || "";
        if (Number.isFinite(mgdl)) rows.push({ id, datetime, mgdl, tag, note });
      }
      if (rows.length) {
        setEntries((prev) => {
          const map = new Map<string, Entry>(prev.map((e) => [e.id, e]));
          for (const r of rows) map.set(r.id, r);
          return Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.datetime).getTime() - new Date(a.datetime).getTime()
          );
        });
      }
    };
    reader.readAsText(file);
  }

  // chart data (respect fasting toggle inside modal)
  const chartData = useMemo(() => {
    const src = graphFastingOnly
      ? filtered.filter((e) => e.tag === "fasting")
      : filtered;
    return src
      .slice()
      .sort(
        (a, b) =>
          new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      )
      .map((e) => ({
        t: new Date(e.datetime).getTime(),
        mgdl: e.mgdl,
        tag: e.tag ?? "",
      }));
  }, [filtered, graphFastingOnly]);

  const showCustomControls = range === "custom";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="rounded-2xl bg-gradient-to-r from-[#00b78b] to-[#F78300] p-[1px] shadow">
            <div className="rounded-2xl bg-white px-5 py-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Glucose Log → Estimated HbA1c
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Enter glucose readings only. We calculate averages and an HbA1c
                estimate using the NGSP/DCCT relationship.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
          {/* LEFT: Entry + Table */}
          <div className="space-y-6">
            {/* Entry card */}
            <section className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Add reading</h2>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as Unit)}
                    aria-label="Units"
                  >
                    <option value="mgdl">mg/dL</option>
                    <option value="mmoll">mmol/L</option>
                  </select>
                  <button
                    onClick={exportCSV}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importCSV(f);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    Import
                  </button>
                  <button
                    onClick={clearAll}
                    className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-sm text-slate-700">
                    Date & time
                  </label>
                  <input
                    type="datetime-local"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={dt}
                    onChange={(e) => setDt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700">
                    Glucose value
                  </label>
                  <input
                    inputMode="decimal"
                    placeholder={unit === "mgdl" ? "e.g., 154" : "e.g., 8.6"}
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-700">Tag</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="fasting">Fasting</option>
                    <option value="post-meal">Post-meal</option>
                    <option value="exercise">Exercise</option>
                    <option value="bedtime">Bedtime</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-700">
                    Note (optional)
                  </label>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., rice lunch, 30m walk"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={addEntry}
                  className="rounded-xl bg-[#00b78b] px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-95"
                >
                  Add reading
                </button>
                <button
                  onClick={() => setVal("")}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Clear value
                </button>
                <div className="ml-auto hidden gap-2 sm:flex">
                  {["fasting", "post-meal", "exercise", "bedtime"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTag(t)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        tag === t
                          ? "border-[#F78300] bg-[#F78300]/10 text-[#9a5400]"
                          : "border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Table + Range card */}
            <section className="rounded-2xl border p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Saved readings</h2>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {(
                    ["30d", "60d", "90d", "180d", "365d", "all"] as RangeKey[]
                  ).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRange(k)}
                      className={`rounded-full border px-3 py-1 ${
                        range === k
                          ? "border-[#00b78b] bg-[#00b78b]/10"
                          : "border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    onClick={() => setRange("custom")}
                    className={`rounded-full border px-3 py-1 ${
                      range === "custom"
                        ? "border-[#00b78b] bg-[#00b78b]/10"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    custom
                  </button>
                  <button
                    onClick={() => setShowGraph(true)}
                    className="ml-2 rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-50"
                  >
                    Graph
                  </button>
                </div>
              </div>

              {showCustomControls && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-slate-600">
                      Start date
                    </label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">
                      End date
                    </label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={
                        () => setCustomStart((prev) => prev) // trigger memo recompute
                      }
                      className="h-[42px] w-full rounded-xl bg-[#00b78b] text-sm font-semibold text-white shadow hover:opacity-95"
                    >
                      Apply range
                    </button>
                    <button
                      onClick={() => {
                        setCustomStart("");
                        setCustomEnd("");
                      }}
                      className="h-[42px] w-full rounded-xl border border-slate-300 text-sm hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-slate-700">
                      <th className="px-3 py-2">Date/time</th>
                      <th className="px-3 py-2">mg/dL</th>
                      <th className="px-3 py-2">mmol/L</th>
                      <th className="px-3 py-2">Tag</th>
                      <th className="px-3 py-2">Note</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-slate-500" colSpan={6}>
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-2 rounded-full bg-[#00b78b]"></div>{" "}
                            No readings in this range. Add your first reading
                            above.
                          </div>
                        </td>
                      </tr>
                    )}
                    {filtered.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-3 py-2">
                          {new Date(e.datetime).toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmt(e.mgdl, 0)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmt(mgdlToMmoll(e.mgdl), 1)}
                        </td>
                        <td className="px-3 py-2">
                          {e.tag ? (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                              {e.tag}
                            </span>
                          ) : (
                            ""
                          )}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[22rem] truncate"
                          title={e.note}
                        >
                          {e.note || ""}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeEntry(e.id)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-red-50 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* RIGHT: Sticky Summary */}
          <aside className="md:sticky md:top-24">
            <section className="space-y-4">
              {/* Primary KPI (red warning state if HbA1c ≥ 5.7%) */}
              <div
                className={
                  "rounded-2xl p-[1px] shadow " +
                  (isHighA1c
                    ? "bg-red-500"
                    : "bg-gradient-to-br from-[#00b78b] to-[#F78300]")
                }
                aria-live="polite"
              >
                <div
                  className={`rounded-2xl p-4 ${
                    isHighA1c ? "bg-red-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3
                      className={`text-base font-semibold ${
                        isHighA1c ? "text-red-800" : "text-slate-800"
                      }`}
                    >
                      Estimated HbA1c
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        isHighA1c ? "bg-red-100 text-red-800" : band.color
                      }`}
                    >
                      {isHighA1c ? "Above normal" : band.label}
                    </span>
                  </div>
                  <div
                    className={`mt-2 text-4xl font-bold tabular-nums ${
                      isHighA1c ? "text-red-800" : "text-slate-900"
                    }`}
                  >
                    {fmt(estA1c, 1)}%
                  </div>
                  <p
                    className={`mt-1 text-xs ${
                      isHighA1c ? "text-red-700" : "text-slate-600"
                    }`}
                  >
                    Based on mean glucose over the selected range.
                  </p>

                  {isHighA1c && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mt-0.5 h-5 w-5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l6.518 11.59c.75 1.335-.213 2.99-1.743 2.99H3.482c-1.53 0-2.493-1.655-1.743-2.99L8.257 3.1zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V8a1 1 0 112 0v3a1 1 0 01-1 1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <div className="font-medium">
                          Warning: Estimated HbA1c is above the normal range
                          (&lt; 5.7%).
                        </div>
                        <p className="mt-0.5">
                          Consider lifestyle optimization and discussing with
                          your clinician. Certain conditions (anemia, CKD,
                          pregnancy) can affect HbA1c accuracy.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Secondary KPIs */}
              <div className="grid gap-4">
                <KPI
                  title="Mean glucose (mg/dL)"
                  value={fmt(stats.mean, 0)}
                  accent="#00b78b"
                  subtitle="Used to estimate HbA1c"
                />
                <KPI
                  title="Mean glucose (mmol/L)"
                  value={fmt(mgdlToMmoll(stats.mean), 1)}
                  accent="#3b82f6"
                  subtitle="mg/dL ÷ 18"
                />
                <KPI
                  title="Readings in range"
                  value={String(stats.count)}
                  accent="#F78300"
                  subtitle="Filtered by date chips"
                />
              </div>

              {/* Distribution card */}
              <div className="rounded-2xl border p-4 shadow-sm">
                <h3 className="text-base font-semibold">Distribution</h3>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <Metric title="Median (mg/dL)" value={fmt(stats.median, 0)} />
                  <Metric title="SD (mg/dL)" value={fmt(stats.sd, 0)} />
                  <Metric
                    title="Min/Max (mg/dL)"
                    value={`${fmt(stats.min, 0)} / ${fmt(stats.max, 0)}`}
                  />
                </div>
                {/* Simple range bar */}
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                  {Number.isFinite(stats.min) &&
                    Number.isFinite(stats.max) &&
                    Number.isFinite(stats.mean) && (
                      <div
                        className="relative h-2 rounded-full bg-[#00b78b]"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              ((stats.mean - (stats.min || 0)) /
                                Math.max(
                                  1,
                                  (stats.max || 1) - (stats.min || 0)
                                )) *
                                100
                            )
                          )}%`,
                        }}
                      >
                        <span className="absolute -top-6 right-0 text-xs text-slate-600">
                          mean
                        </span>
                      </div>
                    )}
                </div>
              </div>

              {/* Notes */}
              <div className="rounded-2xl border p-4 text-sm text-slate-600 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800">
                  Method & Caveats
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    HbA1c estimate from mean glucose:{" "}
                    <code>(mean mg/dL + 46.7) / 28.7</code>.
                  </li>
                  <li>Conversions: mmol/L = mg/dL ÷ 18.</li>
                  <li>
                    HbA1c may be unreliable in anemia, CKD, hemoglobinopathies,
                    pregnancy.
                  </li>
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </main>

      {/* Graph Modal */}
      {showGraph && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowGraph(false)}
          />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Glucose over time</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={graphFastingOnly}
                    onChange={(e) => setGraphFastingOnly(e.target.checked)}
                  />{" "}
                  Fasting only
                </label>
                <button
                  onClick={() => setShowGraph(false)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 h-[380px] w-full">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  No data in selected range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[
                        chartData[0].t,
                        chartData[chartData.length - 1].t,
                      ]}
                      tickFormatter={(t) =>
                        new Date(t).toLocaleDateString(undefined, {
                          month: "short",
                          day: "2-digit",
                        })
                      }
                    />
                    <YAxis
                      domain={[0, "dataMax+40"]}
                      tickFormatter={(v) => String(v)}
                      label={{
                        value: "mg/dL",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [
                        `${fmt(Number(value), 0)} mg/dL`,
                        name === "mgdl" ? "Glucose" : name,
                      ]}
                      labelFormatter={(label: any) =>
                        new Date(Number(label)).toLocaleString()
                      }
                    />
                    {/* Reference zones */}
                    <ReferenceArea
                      y1={70}
                      y2={99}
                      label={{
                        value: "Fasting normal (70–99)",
                        position: "insideTopLeft",
                      }}
                      fill="#00b78b"
                      fillOpacity={0.07}
                    />
                    <ReferenceLine
                      y={140}
                      stroke="#F78300"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{
                        value: "Post-meal target ≤140",
                        position: "insideTopRight",
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="mgdl"
                      stroke="#2563eb"
                      dot={{ r: 2 }}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({
  title,
  value,
  accent,
  subtitle,
}: {
  title: string;
  value: string;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-[1px] shadow"
      style={{ background: `linear-gradient(135deg, ${accent}, ${accent}30)` }}
    >
      <div className="rounded-2xl bg-white p-4">
        <div className="text-xs text-slate-600">{title}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
          {value}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-slate-600">{title}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
