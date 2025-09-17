"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Icon from "@/components/Icon";

/**
 * Travel & Details
 * 1) Coordinates + Admin location (province) + Map preview & picker (with search/drag)
 * 2) General Info
 * 3) UNESCO & Protection
 * 4) Climate & Topography
 * 5) Did you know
 * 6) Travel Guide
 * 7) Best Time (preset key)
 * 8) Places to Stay
 */

/* ----------------------------- Icons/Enums ----------------------------- */

const TITLE_ICON_MAP: Record<string, string> = {
  "Where is it / Location": "map",
  "General Info": "info",
  "UNESCO & Protection": "unesco",
  "Climate & Topography": "climate-topography",
  "Did you Know": "lightbulb",
  "Travel Guide": "book",
  "Best Time to Visit (preset)": "climate-geography-environment",
  "Places to Stay": "places-to-stay",
};

const UNESCO_DB_VALUES = {
  NONE: "None",
  INSCRIBED: "Inscribed on the UNESCO World Heritage Site List",
  TENTATIVE: "On the UNESCO World Heritage Tentative List",
} as const;

type UnescoDbValue =
  | typeof UNESCO_DB_VALUES.NONE
  | typeof UNESCO_DB_VALUES.INSCRIBED
  | typeof UNESCO_DB_VALUES.TENTATIVE;

const UNESCO_OPTIONS: Array<{ value: UnescoDbValue; label: string }> = [
  { value: UNESCO_DB_VALUES.NONE, label: "None" },
  {
    value: UNESCO_DB_VALUES.INSCRIBED,
    label: "Inscribed on the UNESCO World Heritage Site List",
  },
  {
    value: UNESCO_DB_VALUES.TENTATIVE,
    label: "On the UNESCO World Heritage Tentative List",
  },
];

/* ----------------------------- Utils ----------------------------- */

function toDbUnesco(value: any): UnescoDbValue {
  if (
    value === UNESCO_DB_VALUES.NONE ||
    value === UNESCO_DB_VALUES.INSCRIBED ||
    value === UNESCO_DB_VALUES.TENTATIVE
  ) {
    return value as UnescoDbValue;
  }
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "" || s === "none") return UNESCO_DB_VALUES.NONE;
  if (s.includes("inscrib")) return UNESCO_DB_VALUES.INSCRIBED;
  if (s.includes("tentative")) return UNESCO_DB_VALUES.TENTATIVE;
  return UNESCO_DB_VALUES.NONE;
}

function nullIfEmpty(v: any) {
  return typeof v === "string" && v.trim() === "" ? null : v;
}

/** Parse to float when valid; otherwise return undefined */
function parseMaybeFloat(v: any): number | undefined {
  const n =
    typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/* ----------------------------- Google Maps Loader ----------------------------- */

/**
 * Dynamically loads Google Maps JS if not loaded.
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (with Places API) in env.
 */
function useGoogleMaps() {
  const [ready, setReady] = useState<boolean>(
    !!(globalThis as any)?.google?.maps
  );

  useEffect(() => {
    if ((globalThis as any)?.google?.maps) {
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
    // include Places library for the search box
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  return ready;
}

/* ----------------------------- Pickable Map ----------------------------- */

type PickableMapProps = {
  lat?: number;
  lng?: number;
  onPick: (lat: number, lng: number) => void;
  className?: string;
  /** When the container becomes visible (e.g., fullscreen), trigger resize */
  visibleKey?: string | number;
};

function PickableMap({
  lat,
  lng,
  onPick,
  className,
  visibleKey,
}: PickableMapProps) {
  const ready = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const center = useMemo(() => {
    const dLat = parseMaybeFloat(lat);
    const dLng = parseMaybeFloat(lng);
    if (dLat !== undefined && dLng !== undefined) {
      return { lat: dLat, lng: dLng };
    }
    // Pakistan fallback center
    return { lat: 30.3753, lng: 69.3451 };
  }, [lat, lng]);

  // Initialize map + marker + search
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const g = (globalThis as any).google;
    if (!g?.maps) return;

    const map = new g.maps.Map(containerRef.current, {
      center,
      zoom: 10,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: false, // we roll our own fullscreen outside
      gestureHandling: "greedy",
    });

    const marker = new g.maps.Marker({
      position: center,
      map,
      // hover-to-drag UX
      draggable: false,
      cursor: "grab",
      draggableCursor: "grabbing",
    });

    // Click map → move marker + update
    map.addListener("click", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(p);
      onPick(p.lat, p.lng);
    });

    // Hover → allow dragging; leave → disable dragging
    marker.addListener("mouseover", () => marker.setDraggable(true));
    marker.addListener("mouseout", () => marker.setDraggable(false));
    marker.addListener("dragend", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      onPick(p.lat, p.lng);
    });

    // ---- Search (Places Autocomplete) ----
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search location…";
    // inline styling so it looks good without extra CSS
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
    } as CSSStyleDeclaration);

    map.controls[g.maps.ControlPosition.TOP_LEFT].push(input);

    let autocomplete: any;
    if (g.maps.places) {
      autocomplete = new g.maps.places.Autocomplete(input, {
        fields: ["geometry", "name", "formatted_address"],
      });
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const p = { lat: loc.lat(), lng: loc.lng() };
        if (place.geometry.viewport) {
          map.fitBounds(place.geometry.viewport);
        } else {
          map.setCenter(p);
          map.setZoom(14);
        }
        marker.setPosition(p);
        onPick(p.lat, p.lng);
      });
    }

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keep marker/center in sync if lat/lng change from inputs
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setPosition(center);
    map.setCenter(center);
  }, [center]);

  // When container becomes visible (e.g., opening overlay), force resize
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const g = (globalThis as any).google;
    if (!g?.maps?.event) return;
    const t = setTimeout(() => {
      g.maps.event.trigger(map, "resize");
      map.setCenter(center);
    }, 50);
    return () => clearTimeout(t);
  }, [visibleKey, center]);

  if (!ready) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-gray-600 bg-white border border-gray-200 rounded-lg ${className}`}
      >
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
          ? "Loading map…"
          : "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (with Places API) to enable the map preview"}
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

/* ----------------------------- Main Component ----------------------------- */

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
  // For fullscreen overlay
  const [mapOpen, setMapOpen] = useState(false);
  const [visibleKey, setVisibleKey] = useState<number>(0);

  const latNum = parseMaybeFloat(form.latitude);
  const lngNum = parseMaybeFloat(form.longitude);

  const handlePick = useCallback(
    (lat: number, lng: number) => {
      setField("latitude", lat.toFixed(6));
      setField("longitude", lng.toFixed(6));
    },
    [setField]
  );

  const handleClearLocation = useCallback(() => {
    setField("latitude", "");
    setField("longitude", "");
    setField("town_city_village", "");
    setField("tehsil", "");
    setField("district", "");
    setField("province_id", null);
  }, [setField]);

  return (
    <div className="space-y-0">
      {/* 1) Coordinates + Admin location + Map Preview */}
      <SectionBlock title="Where is it / Location">
        {/* Desktop: left column with all inputs, right side is the map (col-span-2) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* LEFT: stack ALL location inputs */}
          <div className="flex flex-col gap-4">
            <Labeled label="Latitude">
              <input
                className={inputStyles}
                value={form.latitude || ""}
                onChange={(e) => setField("latitude", e.target.value)}
                placeholder="e.g., 34.811100"
                inputMode="decimal"
              />
            </Labeled>
            <Labeled label="Longitude">
              <input
                className={inputStyles}
                value={form.longitude || ""}
                onChange={(e) => setField("longitude", e.target.value)}
                placeholder="e.g., 74.369400"
                inputMode="decimal"
              />
            </Labeled>
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

          {/* RIGHT: Map area (col-span-2) with actions below */}
          <div className="lg:col-span-2">
            <PickableMap
              lat={latNum}
              lng={lngNum}
              onPick={handlePick}
              visibleKey={visibleKey}
              // slightly taller than before
              className="w-full h-80 md:h-96 lg:h-[360px] xl:h-[400px]"
            />
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setMapOpen(true);
                  setVisibleKey((v) => v + 1);
                }}
                className="text-xs px-3 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
                aria-label="Open fullscreen map"
                title="Open fullscreen map"
              >
                Open Fullscreen
              </button>
              <button
                type="button"
                onClick={handleClearLocation}
                className="text-xs px-3 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                title="Clear location fields"
              >
                Clear All
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Hover the pin to drag it. You can also click the map or use the
              search box to reposition—latitude/longitude update automatically.
            </p>
          </div>
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
              value={toDbUnesco(form.unesco_status)}
              onChange={(e) =>
                setField("unesco_status", toDbUnesco(e.target.value))
              }
            >
              {UNESCO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="UNESCO Line (optional one-liner)">
            <input
              className={inputStyles}
              value={form.unesco_line || ""}
              onChange={(e) => setField("unesco_line", e.target.value)}
              onBlur={(e) =>
                setField("unesco_line", nullIfEmpty(e.target.value))
              }
            />
          </Labeled>

          <Labeled label="Protected under (free text)">
            <input
              className={inputStyles}
              value={form.protected_under || ""}
              onChange={(e) => setField("protected_under", e.target.value)}
              onBlur={(e) =>
                setField("protected_under", nullIfEmpty(e.target.value))
              }
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
              onBlur={(e) =>
                setField("travel_full_guide_url", nullIfEmpty(e.target.value))
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
            onBlur={(e) =>
              setField("best_time_option_key", nullIfEmpty(e.target.value))
            }
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

      {/* Fullscreen Map Overlay */}
      {mapOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60">
          <div className="absolute inset-4 md:inset-10 bg-white rounded-xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <div className="flex items-center gap-2">
                <Icon
                  name="map"
                  className="w-5 h-5 text-[var(--brand-orange)]"
                />
                <span className="font-semibold">Pick location</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleKey((v) => v + 1)}
                  className="text-xs px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  title="Recenter"
                >
                  Recenter
                </button>
                <button
                  type="button"
                  onClick={() => setMapOpen(false)}
                  className="text-xs px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  title="Close"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1">
              <PickableMap
                lat={latNum}
                lng={lngNum}
                onPick={handlePick}
                visibleKey={visibleKey}
                className="w-full h-full rounded-b-xl"
              />
            </div>
            <div className="px-4 py-2 border-t text-xs text-gray-600">
              Hover the pin to drag it. Current:&nbsp;
              {latNum !== undefined && lngNum !== undefined
                ? `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`
                : "—"}
            </div>
          </div>
        </div>
      )}
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
    <div className="mx-4 sm:mx-6 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-28 my-12 md:my-16 lg:my-20">
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
