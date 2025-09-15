"use client";

import React, { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Papa from "papaparse";

/**
 * Travel & Details
 * - Renders all subsections that used to be under the "location" tab:
 *   1) Coordinates + Admin location (province)
 *   2) General Info
 *   3) UNESCO & Protection
 *   4) Climate & Topography
 *   5) Did you know
 *   6) Travel Guide
 *   7) Best Time (preset key)
 *   8) Places to Stay
 *
 * Props are designed to match the integrator’s expectations.
 */

const TITLE_ICON_MAP: Record<string, string> = {
  "Where is it / Location": "map", // keep whatever matches your Icon set (e.g., "location" or "map-pin")
  "General Info": "info",
  "UNESCO & Protection": "unesco",
  "Climate & Topography": "climate-topography",
  "Did you Know": "lightbulb",
  "Travel Guide": "book",
  "Best Time to Visit (preset)": "climate-geography-environment",
  "Places to Stay": "places-to-stay",
};

/* ----------------------------- CSV Import ----------------------------- */

/** Canonical headers for our simple CSV template (one row = one site) */
const TEMPLATE_HEADERS = [
  "title",
  "latitude",
  "longitude",
  "town_city_village",
  "tehsil",
  "district",
  "province", // name; will map to province_id
  "architectural_style",
  "construction_materials",
  "local_name",
  "architect",
  "construction_date",
  "built_by",
  "dynasty",
  "conservation_status",
  "current_use",
  "restored_by",
  "known_for",
  "era",
  "inhabited_by",
  "national_park_established_in",
  "population",
  "ethnic_groups",
  "languages_spoken",
  "excavation_status",
  "excavated_by",
  "administered_by",
  "unesco_status",
  "unesco_line",
  "protected_under",
  "landform",
  "altitude",
  "mountain_range",
  "weather_type",
  "avg_temp_summers",
  "avg_temp_winters",
  "travel_location",
  "travel_how_to_reach",
  "travel_nearest_major_city",
  "travel_airport_access",
  "travel_international_flight",
  "travel_access_options",
  "travel_road_type_condition",
  "travel_best_time_free",
  "travel_full_guide_url",
  "best_time_option_key",
  "stay_hotels_available",
  "stay_spending_night_recommended",
  "stay_camping_possible",
  "stay_places_to_eat_available",
  "did_you_know",
] as const;

type CanonicalKey = (typeof TEMPLATE_HEADERS)[number];

/** Normalize a header (lowercase, remove extra punctuation/spaces) */
function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Map common header variants → canonical keys used by this page */
const HEADER_TO_FIELD: Record<string, CanonicalKey | "province_name"> = {
  // location
  latitude: "latitude",
  lat: "latitude",

  longitude: "longitude",
  lon: "longitude",
  lng: "longitude",

  town: "town_city_village",
  city: "town_city_village",
  village: "town_city_village",
  town_city_village: "town_city_village",

  tehsil: "tehsil",
  district: "district",

  province: "province_name",
  region: "province_name",
  region_province: "province_name",

  // general info
  title: "title",
  name: "title",
  architectural_style: "architectural_style",
  construction_materials: "construction_materials",
  local_name: "local_name",
  architect: "architect",
  construction_date: "construction_date",
  built_by: "built_by",
  dynasty: "dynasty",
  conservation_status: "conservation_status",
  current_use: "current_use",
  restored_by: "restored_by",
  known_for: "known_for",
  era: "era",
  inhabited_by: "inhabited_by",
  national_park_established_in: "national_park_established_in",
  population: "population",
  ethnic_groups: "ethnic_groups",
  languages_spoken: "languages_spoken",
  excavation_status: "excavation_status",
  excavated_by: "excavated_by",
  administered_by: "administered_by",

  // unesco
  unesco_status: "unesco_status",
  unesco_line: "unesco_line",
  protected_under: "protected_under",

  // climate & topography
  landform: "landform",
  altitude: "altitude",
  mountain_range: "mountain_range",
  weather_type: "weather_type",
  avg_temp_summers: "avg_temp_summers",
  average_temp_summers: "avg_temp_summers",
  avg_temp_winters: "avg_temp_winters",
  average_temp_winters: "avg_temp_winters",

  // travel
  travel_location: "travel_location",
  location_travel_guide: "travel_location",
  travel_how_to_reach: "travel_how_to_reach",
  how_to_reach: "travel_how_to_reach",
  travel_nearest_major_city: "travel_nearest_major_city",
  nearest_major_city: "travel_nearest_major_city",
  travel_airport_access: "travel_airport_access",
  airport_access: "travel_airport_access",
  travel_international_flight: "travel_international_flight",
  international_flight: "travel_international_flight",
  travel_access_options: "travel_access_options",
  access_options: "travel_access_options",
  travel_road_type_condition: "travel_road_type_condition",
  road_type_condition: "travel_road_type_condition",
  travel_best_time_free: "travel_best_time_free",
  best_time_free: "travel_best_time_free",
  travel_full_guide_url: "travel_full_guide_url",

  // best time
  best_time_option_key: "best_time_option_key",

  // stay
  stay_hotels_available: "stay_hotels_available",
  hotels_available: "stay_hotels_available",
  stay_spending_night_recommended: "stay_spending_night_recommended",
  spending_night_recommended: "stay_spending_night_recommended",
  stay_camping_possible: "stay_camping_possible",
  camping_possible: "stay_camping_possible",
  stay_places_to_eat_available: "stay_places_to_eat_available",
  places_to_eat_available: "stay_places_to_eat_available",

  // misc
  did_you_know: "did_you_know",
};

/** UNESCO status normalization to match your select options */
function normalizeUnescoStatus(v: any): string | null {
  if (!v) return "None";
  const s = String(v).toLowerCase();
  if (s.includes("inscrib")) {
    return "Inscribed on the UNESCO World Heritage Site List";
  }
  if (s.includes("tentative")) {
    return "On the UNESCO World Heritage Tentative List";
  }
  if (s.includes("none") || s === "" || s === "no") return "None";
  return v;
}

/** Tidy yes/no-ish values */
function normalizeYesNo(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(s)) return "Yes";
  if (["n", "no", "false", "0"].includes(s)) return "No";
  return v;
}

/** Build a CSV template string (headers only) */
const TEMPLATE_CSV = `${TEMPLATE_HEADERS.join(",")}\n`;

/* ----------------------------- Component ----------------------------- */

export default function TravelDetails({
  form,
  setField,
  provinces,
  inputStyles,
  readOnlyInputStyles,
}: {
  form: any;
  setField: <K extends string>(key: K, value: any) => void;
  provinces: Array<{ id: string | number; name: string }>;
  inputStyles: string;
  readOnlyInputStyles: string;
}) {
  return (
    <div className="space-y-0">
      {/* CSV Import bar */}
      <ImporterBar
        provinces={provinces}
        onApply={(kv) => {
          Object.entries(kv).forEach(([key, value]) => {
            // @ts-ignore generic setter
            setField(key as any, value as any);
          });
        }}
      />

      {/* 1) Coordinates + Admin location */}
      <SectionBlock title="Where is it / Location">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Labeled label="Latitude">
            <input
              className={inputStyles}
              value={form.latitude || ""}
              onChange={(e) => setField("latitude", e.target.value)}
            />
          </Labeled>
          <Labeled label="Longitude">
            <input
              className={inputStyles}
              value={form.longitude || ""}
              onChange={(e) => setField("longitude", e.target.value)}
            />
          </Labeled>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Labeled label="Town/City/Village">
            <input
              className={inputStyles}
              value={form.town_city_village || ""}
              onChange={(e) => setField("town_city_village", e.target.value)}
            />
          </Labeled>
          <Labeled label="Tehsil">
            <input
              className={inputStyles}
              value={form.tehsil || ""}
              onChange={(e) => setField("tehsil", e.target.value)}
            />
          </Labeled>
          <Labeled label="District">
            <input
              className={inputStyles}
              value={form.district || ""}
              onChange={(e) => setField("district", e.target.value)}
            />
          </Labeled>
          <Labeled label="Region / Province (dropdown of 6)">
            <select
              className={inputStyles}
              value={form.province_id || ""}
              onChange={(e) =>
                setField(
                  "province_id",
                  e.target.value ? Number(e.target.value) : null
                )
              }
            >
              <option value="">— Select —</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id as any}>
                  {p.name}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
      </SectionBlock>

      {/* 2) General Info */}
      <SectionBlock title="General Info">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Labeled label="Name (auto from Title)">
            <input
              className={readOnlyInputStyles}
              value={form.title || ""}
              readOnly
            />
          </Labeled>

          <Labeled label="Architectural Style">
            <input
              className={inputStyles}
              value={form.architectural_style || ""}
              onChange={(e) => setField("architectural_style", e.target.value)}
            />
          </Labeled>

          <Labeled label="Construction Materials">
            <input
              className={inputStyles}
              value={form.construction_materials || ""}
              onChange={(e) =>
                setField("construction_materials", e.target.value)
              }
            />
          </Labeled>

          <Labeled label="Local Name">
            <input
              className={inputStyles}
              value={form.local_name || ""}
              onChange={(e) => setField("local_name", e.target.value)}
            />
          </Labeled>

          <Labeled label="Architect">
            <input
              className={inputStyles}
              value={form.architect || ""}
              onChange={(e) => setField("architect", e.target.value)}
            />
          </Labeled>

          <Labeled label="Construction Date">
            <input
              className={inputStyles}
              value={form.construction_date || ""}
              onChange={(e) => setField("construction_date", e.target.value)}
            />
          </Labeled>

          <Labeled label="Built by">
            <input
              className={inputStyles}
              value={form.built_by || ""}
              onChange={(e) => setField("built_by", e.target.value)}
            />
          </Labeled>

          <Labeled label="Dynasty">
            <input
              className={inputStyles}
              value={form.dynasty || ""}
              onChange={(e) => setField("dynasty", e.target.value)}
            />
          </Labeled>

          <Labeled label="Conservation Status">
            <input
              className={inputStyles}
              value={form.conservation_status || ""}
              onChange={(e) => setField("conservation_status", e.target.value)}
            />
          </Labeled>

          <Labeled label="Current Use">
            <input
              className={inputStyles}
              value={form.current_use || ""}
              onChange={(e) => setField("current_use", e.target.value)}
            />
          </Labeled>

          <Labeled label="Restored by">
            <input
              className={inputStyles}
              value={form.restored_by || ""}
              onChange={(e) => setField("restored_by", e.target.value)}
            />
          </Labeled>

          <Labeled label="Known for">
            <input
              className={inputStyles}
              value={form.known_for || ""}
              onChange={(e) => setField("known_for", e.target.value)}
            />
          </Labeled>

          <Labeled label="Era">
            <input
              className={inputStyles}
              value={form.era || ""}
              onChange={(e) => setField("era", e.target.value)}
            />
          </Labeled>

          <Labeled label="Inhabited by">
            <input
              className={inputStyles}
              value={form.inhabited_by || ""}
              onChange={(e) => setField("inhabited_by", e.target.value)}
            />
          </Labeled>

          <Labeled label="National Park Established in">
            <input
              className={inputStyles}
              value={form.national_park_established_in || ""}
              onChange={(e) =>
                setField("national_park_established_in", e.target.value)
              }
            />
          </Labeled>

          <Labeled label="Population">
            <input
              className={inputStyles}
              value={form.population || ""}
              onChange={(e) => setField("population", e.target.value)}
            />
          </Labeled>

          <Labeled label="Ethnic Groups">
            <input
              className={inputStyles}
              value={form.ethnic_groups || ""}
              onChange={(e) => setField("ethnic_groups", e.target.value)}
            />
          </Labeled>

          <Labeled label="Languages Spoken">
            <input
              className={inputStyles}
              value={form.languages_spoken || ""}
              onChange={(e) => setField("languages_spoken", e.target.value)}
            />
          </Labeled>

          <Labeled label="Excavation Status">
            <input
              className={inputStyles}
              value={form.excavation_status || ""}
              onChange={(e) => setField("excavation_status", e.target.value)}
            />
          </Labeled>

          <Labeled label="Excavated by">
            <input
              className={inputStyles}
              value={form.excavated_by || ""}
              onChange={(e) => setField("excavated_by", e.target.value)}
            />
          </Labeled>

          <Labeled label="Administered by (label editable later)">
            <input
              className={inputStyles}
              value={form.administered_by || ""}
              onChange={(e) => setField("administered_by", e.target.value)}
            />
          </Labeled>
        </div>
      </SectionBlock>

      {/* 3) UNESCO & Protection */}
      <SectionBlock title="UNESCO & Protection">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Labeled label="UNESCO Status">
            <select
              className={inputStyles}
              value={form.unesco_status || "None"}
              onChange={(e) => setField("unesco_status", e.target.value)}
            >
              <option>None</option>
              <option>Inscribed on the UNESCO World Heritage Site List</option>
              <option>On the UNESCO World Heritage Tentative List</option>
            </select>
          </Labeled>
          <Labeled label="UNESCO Line (optional one-liner)">
            <input
              className={inputStyles}
              value={form.unesco_line || ""}
              onChange={(e) => setField("unesco_line", e.target.value)}
            />
          </Labeled>
          <Labeled label="Protected under (free text)">
            <input
              className={inputStyles}
              value={form.protected_under || ""}
              onChange={(e) => setField("protected_under", e.target.value)}
            />
          </Labeled>
        </div>
      </SectionBlock>

      {/* 4) Climate & Topography */}
      <SectionBlock title="Climate & Topography">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Labeled label="Landform">
            <input
              className={inputStyles}
              value={form.landform || ""}
              onChange={(e) => setField("landform", e.target.value)}
            />
          </Labeled>
          <Labeled label="Altitude">
            <input
              className={inputStyles}
              value={form.altitude || ""}
              onChange={(e) => setField("altitude", e.target.value)}
            />
          </Labeled>
          <Labeled label="Mountain Range">
            <input
              className={inputStyles}
              value={form.mountain_range || ""}
              onChange={(e) => setField("mountain_range", e.target.value)}
            />
          </Labeled>
          <Labeled label="Weather Type">
            <input
              className={inputStyles}
              value={form.weather_type || ""}
              onChange={(e) => setField("weather_type", e.target.value)}
            />
          </Labeled>
          <Labeled label="Average Temp in Summers">
            <input
              className={inputStyles}
              value={form.avg_temp_summers || ""}
              onChange={(e) => setField("avg_temp_summers", e.target.value)}
            />
          </Labeled>
          <Labeled label="Average Temp in Winters">
            <input
              className={inputStyles}
              value={form.avg_temp_winters || ""}
              onChange={(e) => setField("avg_temp_winters", e.target.value)}
            />
          </Labeled>
        </div>
      </SectionBlock>

      {/* 5) Did you know */}
      <SectionBlock title="Did you Know">
        <Labeled label="Interesting fact (free text)">
          <textarea
            className={inputStyles}
            value={form.did_you_know || ""}
            onChange={(e) => setField("did_you_know", e.target.value)}
          />
        </Labeled>
      </SectionBlock>

      {/* 6) Travel Guide */}
      <SectionBlock title="Travel Guide">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Labeled label="Location (Travel Guide)">
            <input
              className={inputStyles}
              value={form.travel_location || ""}
              onChange={(e) => setField("travel_location", e.target.value)}
            />
          </Labeled>
          <Labeled label="How to Reach">
            <input
              className={inputStyles}
              value={form.travel_how_to_reach || ""}
              onChange={(e) => setField("travel_how_to_reach", e.target.value)}
            />
          </Labeled>
          <Labeled label="Nearest Major City">
            <input
              className={inputStyles}
              value={form.travel_nearest_major_city || ""}
              onChange={(e) =>
                setField("travel_nearest_major_city", e.target.value)
              }
            />
          </Labeled>
          <Labeled label="Airport Access">
            <select
              className={inputStyles}
              value={form.travel_airport_access || ""}
              onChange={(e) =>
                setField("travel_airport_access", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Labeled>
          <Labeled label="International Flight">
            <select
              className={inputStyles}
              value={form.travel_international_flight || ""}
              onChange={(e) =>
                setField("travel_international_flight", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>Domestic Only</option>
            </select>
          </Labeled>
          <Labeled label="Access Options">
            <select
              className={inputStyles}
              value={form.travel_access_options || ""}
              onChange={(e) =>
                setField("travel_access_options", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>By Road Only</option>
              <option>By Road and Air</option>
              <option>By Road, Air and Railway</option>
            </select>
          </Labeled>
          <Labeled label="Road Type & Condition">
            <select
              className={inputStyles}
              value={form.travel_road_type_condition || ""}
              onChange={(e) =>
                setField("travel_road_type_condition", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Metalled</option>
              <option>Dirt</option>
              <option>Mixed</option>
            </select>
          </Labeled>
          <Labeled label="Best Time to Visit (short free text)">
            <input
              className={inputStyles}
              value={form.travel_best_time_free || ""}
              onChange={(e) =>
                setField("travel_best_time_free", e.target.value)
              }
            />
          </Labeled>
          <Labeled label="Full Travel Guide URL (optional button)">
            <input
              className={inputStyles}
              value={form.travel_full_guide_url || ""}
              onChange={(e) =>
                setField("travel_full_guide_url", e.target.value)
              }
            />
          </Labeled>
        </div>
      </SectionBlock>

      {/* 7) Best Time preset */}
      <SectionBlock title="Best Time to Visit (preset)">
        <Labeled label="Preset Key (temporary; global presets later)">
          <input
            className={inputStyles}
            value={form.best_time_option_key || ""}
            onChange={(e) => setField("best_time_option_key", e.target.value)}
          />
        </Labeled>
      </SectionBlock>

      {/* 8) Places to Stay */}
      <SectionBlock title="Places to Stay">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Labeled label="Hotels Available">
            <select
              className={inputStyles}
              value={form.stay_hotels_available || ""}
              onChange={(e) =>
                setField("stay_hotels_available", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Limited Options</option>
            </select>
          </Labeled>
          <Labeled label="Spending Night Recommended">
            <select
              className={inputStyles}
              value={form.stay_spending_night_recommended || ""}
              onChange={(e) =>
                setField("stay_spending_night_recommended", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Labeled>
          <Labeled label="Camping Possible">
            <select
              className={inputStyles}
              value={form.stay_camping_possible || ""}
              onChange={(e) =>
                setField("stay_camping_possible", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Not Recommended</option>
              <option>Not Suitable</option>
            </select>
          </Labeled>
          <Labeled label="Places to Eat Available">
            <select
              className={inputStyles}
              value={form.stay_places_to_eat_available || ""}
              onChange={(e) =>
                setField("stay_places_to_eat_available", e.target.value)
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Labeled>
        </div>
      </SectionBlock>
    </div>
  );
}

/* ---------- Importer Bar (CSV only, client-side) ---------- */

function ImporterBar({
  provinces,
  onApply,
}: {
  provinces: Array<{ id: string | number; name: string }>;
  onApply: (kv: Record<string, any>) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const templateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`,
    []
  );

  function mapProvinceNameToId(name: string | null | undefined) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    const hit = provinces.find(
      (p) => String(p.name).trim().toLowerCase() === n
    );
    return hit ? hit.id : null;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Parsing CSV…");
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors?.length) {
          setStatus(`Failed to parse: ${res.errors[0].message}`);
          return;
        }
        const rows = (res.data || []).filter((r) =>
          Object.values(r || {}).some((v) => String(v || "").trim() !== "")
        );
        if (!rows.length) {
          setStatus("No rows found in the CSV.");
          return;
        }

        // For simplicity: take the first row
        const src = rows[0];
        const kv: Record<string, any> = {};
        let applied = 0;

        // map headers → canonical
        for (const [rawKey, rawVal] of Object.entries(src)) {
          const nh = normHeader(rawKey);
          const target = HEADER_TO_FIELD[nh];
          if (!target) continue;

          let val: any = rawVal;

          // field-by-field normalization
          if (target === "unesco_status") {
            val = normalizeUnescoStatus(val);
          }
          if (
            target === "travel_airport_access" ||
            target === "stay_hotels_available" ||
            target === "stay_spending_night_recommended" ||
            target === "stay_places_to_eat_available"
          ) {
            val = normalizeYesNo(val);
          }

          if (target === "province_name") {
            const pid = mapProvinceNameToId(String(val || ""));
            if (pid != null) {
              kv["province_id"] = pid;
              applied++;
            }
            continue;
          }

          // numeric nudge for lat/lng/altitude if they look like numbers
          if (
            ["latitude", "longitude", "altitude"].includes(target) &&
            val !== null &&
            val !== undefined
          ) {
            const num = Number(String(val).replace(/,/g, ""));
            if (!Number.isNaN(num)) val = num;
          }

          kv[target] = val;
          applied++;
        }

        onApply(kv);
        setStatus(`Applied ${applied} fields from “${file.name}”.`);
      },
      error: (err) => {
        setStatus(`Error: ${err?.message || "unknown error"}`);
      },
    });

    // reset input so same file can be uploaded repeatedly
    e.currentTarget.value = "";
  }

  return (
    <div className="mx-4 sm:mx-6 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-28 my-12 md:my-16 lg:my-20">
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Import data (CSV only)
          </div>
          <div className="text-xs text-gray-600">
            Use the template headers for smooth import. We’ll fill this form
            from the first row.
          </div>
          {status ? (
            <div className="text-xs text-gray-700 mt-1">{status}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={templateHref}
            download="site_details_template.csv"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Download CSV template
          </a>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-[var(--brand-orange)] px-3 py-2 text-xs font-semibold text-white hover:opacity-95">
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="sr-only"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small local UI helpers ---------- */

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const iconName = TITLE_ICON_MAP[title];

  return (
    // OUTER MARGINS: increased vertical gap between sections
    <div className="mx-4 sm:mx-6 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-28 my-12 md:my-16 lg:my-20">
      {/* CARD */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-8 md:px-10 py-6 md:py-7 shadow-sm">
        <h3 className="flex items-center gap-2 text-lg md:text-xl font-semibold mb-4 text-[var(--brand-blue)]">
          {iconName ? (
            <Icon
              name={iconName}
              className="w-6 h-6 md:w-7 md:h-7 text-[var(--brand-orange)]"
              aria-hidden="true"
            />
          ) : null}
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1.5 text-gray-800">{label}</div>
      {children}
    </label>
  );
}
