// src/app/admin/travel-guides/SummaryTab.tsx
"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Guide = {
  id: string;
  region_id: string;
  status: "draft" | "published" | "archived";
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type Summary = {
  guide_id: string;
  section: "summary";
  location: string | null;
  how_to_reach: string | null;
  nearest_major_city: string | null;
  road_type_condition: string | null;
  altitude: string | null;
  mountain_range: string | null;
  climate_type: string | null;
  temp_winter: string | null;
  temp_summers: string | null;

  /** stored as boolean in DB; rendered as Yes/No */
  airport_access: boolean;
  /** stored as boolean in DB; rendered as Yes/No; enabled only if airport_access = true */
  international_airport: boolean;

  access_options:
    | "by_road_only"
    | "by_trek_only"
    | "by_jeep_and_trek_only"
    | "by_road_and_railway"
    | "by_road_and_airport"
    | "by_road_railway_airport"
    | null;

  best_time_to_visit:
    | "year_long"
    | "winters"
    | "summers"
    | "spring"
    | "spring_and_summers"
    | "winter_and_spring"
    | null;

  /** NEW: free text long form description */
  best_time_to_visit_long: string | null;

  hotels_available: "yes" | "no" | "limited_options" | null;
  spending_night_recommended: "yes" | "not_recommended" | "not_suitable" | null;
  camping: "possible" | "not_suitable" | "with_caution" | null;
  places_to_eat: "yes" | "no" | "limited_options" | null;

  landform:
    | "mountains"
    | "plains"
    | "river"
    | "plateau"
    | "mountain_peak"
    | "valley"
    | "desert"
    | "coastal"
    | "wetlands"
    | "forest"
    | "canyon_gorge"
    | "glacier"
    | "lake_basin"
    | "steppe"
    | null;
};

const ACCESS_OPTIONS = [
  ["by_road_only", "By Road Only"],
  ["by_trek_only", "By Trek Only"],
  ["by_jeep_and_trek_only", "By Jeep and Trek Only"],
  ["by_road_and_railway", "By Road and Railway"],
  ["by_road_and_airport", "By Road and Airport"],
  ["by_road_railway_airport", "By Road, Railway & Airport"],
] as const;

const BEST_TIME = [
  ["year_long", "Year long"],
  ["winters", "Winters"],
  ["summers", "Summers"],
  ["spring", "Spring"],
  ["spring_and_summers", "Spring and Summers"],
  ["winter_and_spring", "Winter and Spring"],
] as const;

const YES_NO_LIMITED = [
  ["yes", "Yes"],
  ["no", "No"],
  ["limited_options", "Limited Options"],
] as const;

const YES_RECS = [
  ["yes", "Yes"],
  ["not_recommended", "Not Recommended"],
  ["not_suitable", "Not Suitable"],
] as const;

const CAMPING = [
  ["possible", "Possible"],
  ["not_suitable", "Not Suitable"],
  ["with_caution", "With Caution"],
] as const;

const LANDFORMS = [
  ["mountains", "Mountains"],
  ["plains", "Plains"],
  ["river", "River"],
  ["plateau", "Plateau"],
  ["mountain_peak", "Mountain Peak"],
  ["valley", "Valley"],
  ["desert", "Desert"],
  ["coastal", "Coastal"],
  ["wetlands", "Wetlands"],
  ["forest", "Forest"],
  ["canyon_gorge", "Canyon / Gorge"],
  ["glacier", "Glacier"],
  ["lake_basin", "Lake Basin"],
  ["steppe", "Steppe"],
] as const;

export default function SummaryTab({
  guide,
  onRegisterSave,
}: {
  guide: Guide;
  onRegisterSave: (saveFn: () => Promise<void>) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);

  // ensure summary row exists for this guide
  useEffect(() => {
    let mounted = true;

    async function ensureSummary() {
      const { data, error } = await supabase
        .from("region_travel_guide_summary")
        .select("*")
        .eq("guide_id", guide.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        alert(`Error loading summary: ${error.message}`);
        return;
      }

      if (!data) {
        const { data: created, error: cErr } = await supabase
          .from("region_travel_guide_summary")
          .insert({
            guide_id: guide.id,
            section: "summary",
            airport_access: false,
            international_airport: false,
            best_time_to_visit_long: null, // NEW default
          })
          .select("*")
          .single();
        if (cErr) {
          alert(`Error creating summary: ${cErr.message}`);
          return;
        }
        if (mounted) setSummary(created as any);
      } else {
        // Backfill on read in case column was just added
        const withBackfill = {
          best_time_to_visit_long:
            (data as any).best_time_to_visit_long ?? null,
          international_airport: (data as any).international_airport ?? false,
          ...data,
        };
        if (mounted) setSummary(withBackfill as any);
      }
    }

    ensureSummary();
    return () => {
      mounted = false;
    };
  }, [guide.id]);

  // expose save handler to wrapper's Save button
  useEffect(() => {
    const saveFn = async () => {
      if (!summary) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from("region_travel_guide_summary")
          .update(summary)
          .eq("guide_id", summary.guide_id);
        if (error) throw error;
      } finally {
        setSaving(false);
      }
    };
    onRegisterSave(saveFn);
  }, [summary, onRegisterSave]);

  // field binders
  function bind<K extends keyof Summary>(key: K) {
    return {
      value: (summary?.[key] ?? "") as any,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
      ) => setSummary((s) => (s ? { ...s, [key]: e.target.value || null } : s)),
    };
  }

  // Yes/No selects → boolean
  function bindYesNoBool(
    key: "airport_access" | "international_airport"
  ): { value: "yes" | "no"; onChange: (v: "yes" | "no") => void } {
    const boolVal = (summary?.[key] as boolean) ?? false;
    return {
      value: boolVal ? "yes" : "no",
      onChange: (v: "yes" | "no") =>
        setSummary((s) => {
          if (!s) return s;
          const next: any = { ...s, [key]: v === "yes" };
          if (key === "airport_access" && v === "no") {
            next.international_airport = false;
          }
          return next;
        }),
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Travel Summary</h2>
        <span className="text-xs text-slate-500">
          {saving ? "Saving…" : "Ready"}
        </span>
      </div>

      {!summary ? (
        <div className="py-16 text-center text-slate-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldText label="Location" {...bind("location")} />
          <FieldText
            label="Nearest Major City"
            {...bind("nearest_major_city")}
          />
          <FieldTextArea
            label="How to Reach"
            rows={3}
            {...bind("how_to_reach")}
          />
          <FieldText
            label="Road Type & Condition"
            {...bind("road_type_condition")}
          />
          <FieldText label="Altitude" {...bind("altitude")} />
          <FieldText label="Mountain Range" {...bind("mountain_range")} />
          <FieldText label="Climate Type" {...bind("climate_type")} />
          <FieldText label="Temp in Winter" {...bind("temp_winter")} />
          <FieldText label="Temp in Summers" {...bind("temp_summers")} />

          {/* Airport Access (Yes/No) */}
          <FieldYesNo
            label="Airport Access"
            {...bindYesNoBool("airport_access")}
          />

          {/* International Airport (Yes/No) — only if Airport Access is Yes */}
          <FieldYesNo
            label="International Airport"
            {...bindYesNoBool("international_airport")}
            disabled={!summary.airport_access}
            hint={
              !summary.airport_access
                ? "Enable Airport Access to set this"
                : undefined
            }
          />

          <FieldSelect
            label="Access Options"
            value={summary.access_options ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s ? { ...s, access_options: (v || null) as any } : s
              )
            }
            options={[["", "— Select —"], ...ACCESS_OPTIONS]}
          />

          <FieldSelect
            label="Best Time to Visit"
            value={summary.best_time_to_visit ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s ? { ...s, best_time_to_visit: (v || null) as any } : s
              )
            }
            options={[["", "— Select —"], ...BEST_TIME]}
          />

          {/* NEW: Long form free text */}
          <FieldTextArea
            label="Best Time to Visit (Long)"
            rows={5}
            placeholder="Describe seasonal details, monsoon windows, road conditions by month, etc."
            {...bind("best_time_to_visit_long")}
          />

          <FieldSelect
            label="Hotels Available"
            value={summary.hotels_available ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s ? { ...s, hotels_available: (v || null) as any } : s
              )
            }
            options={[["", "— Select —"], ...YES_NO_LIMITED]}
          />

          <FieldSelect
            label="Spending Night Recommended"
            value={summary.spending_night_recommended ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s
                  ? { ...s, spending_night_recommended: (v || null) as any }
                  : s
              )
            }
            options={[["", "— Select —"], ...YES_RECS]}
          />

          <FieldSelect
            label="Camping"
            value={summary.camping ?? ""}
            onChange={(v) =>
              setSummary((s) => (s ? { ...s, camping: (v || null) as any } : s))
            }
            options={[["", "— Select —"], ...CAMPING]}
          />

          <FieldSelect
            label="Places to Eat"
            value={summary.places_to_eat ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s ? { ...s, places_to_eat: (v || null) as any } : s
              )
            }
            options={[["", "— Select —"], ...YES_NO_LIMITED]}
          />

          <FieldSelect
            label="Landform"
            value={summary.landform ?? ""}
            onChange={(v) =>
              setSummary((s) =>
                s ? { ...s, landform: (v || null) as any } : s
              )
            }
            options={[["", "— Select —"], ...LANDFORMS]}
          />
        </div>
      )}
    </div>
  );
}

/* ---- field components (labels bold) ---- */

function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
      />
    </label>
  );
}

function FieldTextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  rows?: number;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        value={value || ""}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
      />
    </label>
  );
}

/** Reusable Yes/No select that binds to string value */
function FieldYesNo({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: "yes" | "no";
  onChange: (v: "yes" | "no") => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
        value={value}
        onChange={(e) => onChange((e.target.value as "yes" | "no") || "no")}
        disabled={disabled}
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-slate-800">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([val, label]) => (
          <option key={val} value={val}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
