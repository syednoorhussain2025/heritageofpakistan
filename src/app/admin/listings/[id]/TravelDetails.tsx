// src/app/admin/listings/[id]/TravelDetails.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  ChangeEvent,
} from "react";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabaseClient";

/**
 * Travel & Details
 * 1) Coordinates + Admin location (province) + Map preview & picker (with search/drag)
 * 2) General Info
 * 3) UNESCO & Protection
 * 4) Climate & Topography  ← Connect Travel Guide + field overrides
 * 5) Did you know
 * 6) Travel Guide          ← Connect Travel Guide + field overrides
 * 7) Best Time (preset)
 * 8) Places to Stay        ← Connect Travel Guide + field overrides
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

/* Map region_travel_guide_summary → site fields */
function titleCase(s: string) {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function mapSummaryToSiteFields(s: any): Record<string, any> {
  if (!s) return {};
  const accessOptionsMap: Record<string, string> = {
    by_road_only: "By Road Only",
    by_trek_only: "By Trek Only",
    by_jeep_and_trek_only: "By Jeep and Trek Only",
    by_road_and_railway: "By Road and Railway",
    by_road_and_airport: "By Road and Air",
    by_road_railway_airport: "By Road, Air and Railway",
  };
  const bestTimeMap: Record<string, string> = {
    year_long: "Year long",
    winters: "Winters",
    summers: "Summers",
    spring: "Spring",
    spring_and_summers: "Spring and Summers",
    winter_and_spring: "Winter and Spring",
  };

  return {
    // Climate / topo
    landform: s.landform ?? "",
    altitude: s.altitude ?? "",
    mountain_range: s.mountain_range ?? "",
    weather_type: s.climate_type ?? "",
    avg_temp_winters: s.temp_winter ?? "",
    avg_temp_summers: s.temp_summers ?? "",

    // Travel summary
    travel_location: s.location ?? "",
    travel_how_to_reach: s.how_to_reach ?? "",
    travel_nearest_major_city: s.nearest_major_city ?? "",
    travel_airport_access: s.airport_access ? "Yes" : "No",
    travel_international_airport:
      s.international_airport == null
        ? ""
        : s.international_airport
        ? "Yes"
        : "No",
    travel_access_options: s.access_options
      ? accessOptionsMap[s.access_options] || ""
      : "",
    travel_road_type_condition: s.road_type_condition ?? "",
    travel_best_time_free: s.best_time_to_visit
      ? bestTimeMap[s.best_time_to_visit] || ""
      : "",
    /** NEW: long free text */
    travel_best_time_long: s.best_time_to_visit_long ?? "",

    // Stay
    stay_hotels_available: s.hotels_available
      ? titleCase(String(s.hotels_available).replace(/_/g, " "))
      : "",
    stay_spending_night_recommended: s.spending_night_recommended
      ? titleCase(String(s.spending_night_recommended).replace(/_/g, " "))
      : "",
    stay_camping_possible: s.camping
      ? titleCase(String(s.camping).replace(/_/g, " "))
      : "",
    stay_places_to_eat_available: s.places_to_eat
      ? titleCase(String(s.places_to_eat).replace(/_/g, " "))
      : "",
  };
}

/* ----------------------------- Auto-resizing Textarea ----------------------------- */

type AutoGrowProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  minRows?: number; // default 1
  maxRows?: number; // default 10
  name?: string;
  id?: string;
  inputMode?: React.HTMLAttributes<HTMLTextAreaElement>["inputMode"];
};

function AutoGrow({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  minRows = 1,
  maxRows = 10,
  name,
  id,
  inputMode,
}: AutoGrowProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const lineHeightRef = useRef<number>(20);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight || "20");
    lineHeightRef.current = Number.isFinite(lh) ? lh : lineHeightRef.current;

    const maxH = lineHeightRef.current * maxRows + 2;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    const needed = el.scrollHeight;
    if (needed > maxH) {
      el.style.height = `${maxH}px`;
      el.style.overflowY = "auto";
    } else {
      el.style.height = `${needed}px`;
    }
  }, [maxRows]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight || "20");
    const minH = (Number.isFinite(lh) ? lh : 20) * minRows + 2;
    if (el.clientHeight < minH) el.style.height = `${minH}px`;
  }, [minRows]);

  return (
    <textarea
      ref={ref}
      name={name}
      id={id}
      className={`${className} resize-none leading-6`}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e);
        requestAnimationFrame(resize);
      }}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={minRows}
      style={{ height: "auto" }}
      inputMode={inputMode}
    />
  );
}

/* ----------------------------- Google Maps Loader ----------------------------- */

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
    return { lat: 30.3753, lng: 69.3451 };
  }, [lat, lng]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const g = (globalThis as any).google;
    if (!g?.maps) return;

    const map = new g.maps.Map(containerRef.current, {
      center,
      zoom: 10,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: false,
      gestureHandling: "greedy",
    });

    const marker = new g.maps.Marker({
      position: center,
      map,
      draggable: false,
      cursor: "grab",
      draggableCursor: "grabbing",
    });

    map.addListener("click", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(p);
      onPick(p.lat, p.lng);
    });

    marker.addListener("mouseover", () => marker.setDraggable(true));
    marker.addListener("mouseout", () => marker.setDraggable(false));
    marker.addListener("dragend", (e: any) => {
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      onPick(p.lat, p.lng);
    });

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
    } as CSSStyleDeclaration);

    map.controls[g.maps.ControlPosition.TOP_LEFT].push(input);

    let autocomplete: any;
    if (g.maps.places) {
      autocomplete = new g.maps.places.Autocomplete(input, {
        fields: ["geometry", "name", "formatted_address"],
      });
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        thePlaceChanged();
      });

      function thePlaceChanged() {
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
      }
    }

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setPosition(center);
    map.setCenter(center);
  }, [center]);

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
  // NEW: linking & overrides (all optional to preserve BC)
  linkedGuide,
  inherited,
  overrides,
  onConnectClick,
  onRemoveLink,
  onToggleOverride,
}: {
  form: any; // expects form.overrides?: Record<string, boolean>
  setField: <K extends string>(key: K, value: any) => void;
  provinces: Array<{ id: string | number; name: string }>;
  inputStyles: string;
  readOnlyInputStyles: string;
  linkedGuide?: { id: string; name: string } | null;
  inherited?: Record<string, any>;
  overrides?: Record<string, boolean>;
  onConnectClick?: (section: "climate" | "travel" | "stay") => void;
  onRemoveLink?: () => void;
  onToggleOverride?: (fieldKey: string, next: boolean) => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [visibleKey, setVisibleKey] = useState<number>(0);

  /* --- self-fetch when parent didn't pass linked/inherited --- */
  const [autoLinked, setAutoLinked] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [autoInherited, setAutoInherited] = useState<Record<string, any>>({});
  const guideId = linkedGuide?.id ?? form?.region_travel_guide_id ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!guideId || linkedGuide) return;
      const { data } = await supabase
        .from("region_travel_guides")
        .select("id, region_id, regions:region_id (name)")
        .eq("id", guideId)
        .maybeSingle();

      if (cancelled) return;

      type GuideMeta = {
        id: string;
        regions?: { name: string }[] | { name: string } | null;
      };

      const meta = data as GuideMeta | null;

      if (meta) {
        const regionName = Array.isArray(meta.regions)
          ? meta.regions[0]?.name
          : meta.regions?.name;
        setAutoLinked({
          id: meta.id,
          name: regionName || "Travel Guide",
        });
      } else {
        setAutoLinked(null);
      }

      const { data: summary } = await supabase
        .from("region_travel_guide_summary")
        .select("*")
        .eq("guide_id", guideId)
        .maybeSingle();

      if (cancelled) return;
      setAutoInherited(mapSummaryToSiteFields(summary));
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId]);

  const effectiveLinked = linkedGuide ?? autoLinked;
  const effectiveInherited = useMemo(
    () => ({ ...(inherited || {}), ...(autoInherited || {}) }),
    [inherited, autoInherited]
  );

  /* ---------------- OVERRIDES (single source of truth = form.overrides) ---------------- */
  const effOverrides = useMemo<Record<string, boolean>>(() => {
    // priority: form.overrides (live edits) → prop overrides → empty
    return {
      ...(overrides || {}),
      ...(form?.overrides || {}),
    };
  }, [form?.overrides, overrides]);

  const setOverride = useCallback(
    (key: string, next: boolean) => {
      // Update form.overrides so it's saved with the rest of the form
      const nextMap = { ...(effOverrides || {}), [key]: next };
      setField("overrides" as any, nextMap);
      onToggleOverride?.(key, next);

      if (next) {
        // enabling override — if site value empty, seed with inherited so it sticks
        const current = (form as any)?.[key];
        if (!current || String(current).trim() === "") {
          const inheritVal = (effectiveInherited as any)?.[key] ?? "";
          setField(key as any, inheritVal);
        }
      } else {
        // disabling override — clear to fall back to inherited
        setField(key as any, "");
      }
    },
    [effOverrides, setField, onToggleOverride, form, effectiveInherited]
  );

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

  // Helpers for override state
  const hasGuide = !!effectiveLinked?.id;
  const isOverridden = useCallback(
    (key: string) => !!effOverrides?.[key],
    [effOverrides]
  );
  const isLocked = useCallback(
    (key: string) => hasGuide && !isOverridden(key),
    [hasGuide, isOverridden]
  );
  const displayValue = useCallback(
    (key: string, fallback: any) =>
      isLocked(key) ? effectiveInherited?.[key] ?? "" : fallback ?? "",
    [isLocked, effectiveInherited]
  );
  const readOnlyClass = useCallback(
    (key: string) => (isLocked(key) ? readOnlyInputStyles : inputStyles),
    [isLocked, inputStyles, readOnlyInputStyles]
  );

  const OverrideLabel = ({
    label,
    fieldKey,
  }: {
    label: string;
    fieldKey: string;
  }) => {
    const locked = isLocked(fieldKey);
    const overridden = isOverridden(fieldKey);
    return (
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {hasGuide && (
          <div className="flex items-center gap-2">
            {locked && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-[2px] text-[11px]">
                Inherited
              </span>
            )}
            {overridden && (
              <span className="inline-flex items-center rounded_full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-[2px] text-[11px]">
                Overridden
              </span>
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 hover:bg-slate-50 h-7 w-7"
              title={locked ? "Override this field" : "Reset to inherit"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOverride(
                  fieldKey,
                  locked /* enable if locked; else disable */
                );
              }}
            >
              {locked ? (
                <Icon name="edit" className="w-3.5 h-3.5 text-slate-700" />
              ) : (
                <Icon name="reset" className="w-3.5 h-3.5 text-slate-700" />
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  /* Derived — current effective "Airport Access" value ("Yes"/"No"/"") */
  const effectiveAirportAccess = useMemo(
    () =>
      String(
        displayValue("travel_airport_access", form.travel_airport_access) || ""
      ),
    [displayValue, form.travel_airport_access]
  );

  return (
    <div className="space-y-0">
      {/* 1) Coordinates + Admin location + Map Preview */}
      <SectionBlock title="Where is it / Location">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="flex flex-col gap-4">
            <Labeled label="Latitude">
              <AutoGrow
                className={inputStyles}
                value={form.latitude || ""}
                onChange={(e) => setField("latitude", e.target.value)}
                placeholder="e.g., 34.811100"
                inputMode="decimal"
                minRows={1}
                maxRows={3}
              />
            </Labeled>
            <Labeled label="Longitude">
              <AutoGrow
                className={inputStyles}
                value={form.longitude || ""}
                onChange={(e) => setField("longitude", e.target.value)}
                placeholder="e.g., 74.369400"
                inputMode="decimal"
                minRows={1}
                maxRows={3}
              />
            </Labeled>
            <Labeled label="Town/City/Village">
              <AutoGrow
                className={inputStyles}
                value={form.town_city_village || ""}
                onChange={(e) => setField("town_city_village", e.target.value)}
                minRows={1}
                maxRows={4}
              />
            </Labeled>
            <Labeled label="Tehsil">
              <AutoGrow
                className={inputStyles}
                value={form.tehsil || ""}
                onChange={(e) => setField("tehsil", e.target.value)}
                minRows={1}
                maxRows={4}
              />
            </Labeled>
            <Labeled label="District">
              <AutoGrow
                className={inputStyles}
                value={form.district || ""}
                onChange={(e) => setField("district", e.target.value)}
                minRows={1}
                maxRows={4}
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

          {/* RIGHT: Map area */}
          <div className="lg:col-span-2">
            <PickableMap
              lat={latNum}
              lng={lngNum}
              onPick={handlePick}
              visibleKey={visibleKey}
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
            <AutoGrow
              className={readOnlyInputStyles}
              value={form.title || ""}
              onChange={() => {}}
              readOnly
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Architectural Style">
            <AutoGrow
              className={inputStyles}
              value={form.architectural_style || ""}
              onChange={(e) => setField("architectural_style", e.target.value)}
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Construction Materials">
            <AutoGrow
              className={inputStyles}
              value={form.construction_materials || ""}
              onChange={(e) =>
                setField("construction_materials", e.target.value)
              }
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Local Name">
            <AutoGrow
              className={inputStyles}
              value={form.local_name || ""}
              onChange={(e) => setField("local_name", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Architect">
            <AutoGrow
              className={inputStyles}
              value={form.architect || ""}
              onChange={(e) => setField("architect", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Construction Date">
            <AutoGrow
              className={inputStyles}
              value={form.construction_date || ""}
              onChange={(e) => setField("construction_date", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Built by">
            <AutoGrow
              className={inputStyles}
              value={form.built_by || ""}
              onChange={(e) => setField("built_by", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Dynasty">
            <AutoGrow
              className={inputStyles}
              value={form.dynasty || ""}
              onChange={(e) => setField("dynasty", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Conservation Status">
            <AutoGrow
              className={inputStyles}
              value={form.conservation_status || ""}
              onChange={(e) => setField("conservation_status", e.target.value)}
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Current Use">
            <AutoGrow
              className={inputStyles}
              value={form.current_use || ""}
              onChange={(e) => setField("current_use", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Restored by">
            <AutoGrow
              className={inputStyles}
              value={form.restored_by || ""}
              onChange={(e) => setField("restored_by", e.target.value)}
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Known for">
            <AutoGrow
              className={inputStyles}
              value={form.known_for || ""}
              onChange={(e) => setField("known_for", e.target.value)}
              minRows={1}
              maxRows={8}
            />
          </Labeled>

          <Labeled label="Era">
            <AutoGrow
              className={inputStyles}
              value={form.era || ""}
              onChange={(e) => setField("era", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Inhabited by">
            <AutoGrow
              className={inputStyles}
              value={form.inhabited_by || ""}
              onChange={(e) => setField("inhabited_by", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="National Park Established in">
            <AutoGrow
              className={inputStyles}
              value={form.national_park_established_in || ""}
              onChange={(e) =>
                setField("national_park_established_in", e.target.value)
              }
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Population">
            <AutoGrow
              className={inputStyles}
              value={form.population || ""}
              onChange={(e) => setField("population", e.target.value)}
              minRows={1}
              maxRows={3}
            />
          </Labeled>

          <Labeled label="Ethnic Groups">
            <AutoGrow
              className={inputStyles}
              value={form.ethnic_groups || ""}
              onChange={(e) => setField("ethnic_groups", e.target.value)}
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Languages Spoken">
            <AutoGrow
              className={inputStyles}
              value={form.languages_spoken || ""}
              onChange={(e) => setField("languages_spoken", e.target.value)}
              minRows={1}
              maxRows={6}
            />
          </Labeled>

          <Labeled label="Excavation Status">
            <AutoGrow
              className={inputStyles}
              value={form.excavation_status || ""}
              onChange={(e) => setField("excavation_status", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Excavated by">
            <AutoGrow
              className={inputStyles}
              value={form.excavated_by || ""}
              onChange={(e) => setField("excavated_by", e.target.value)}
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Administered by ">
            <AutoGrow
              className={inputStyles}
              value={form.administered_by || ""}
              onChange={(e) => setField("administered_by", e.target.value)}
              minRows={1}
              maxRows={4}
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
            <AutoGrow
              className={inputStyles}
              value={form.unesco_line || ""}
              onChange={(e) => setField("unesco_line", e.target.value)}
              onBlur={(e) =>
                setField("unesco_line", nullIfEmpty(e.target.value))
              }
              minRows={1}
              maxRows={4}
            />
          </Labeled>

          <Labeled label="Protected under (free text)">
            <AutoGrow
              className={inputStyles}
              value={form.protected_under || ""}
              onChange={(e) => setField("protected_under", e.target.value)}
              onBlur={(e) =>
                setField("protected_under", nullIfEmpty(e.target.value))
              }
              minRows={1}
              maxRows={6}
            />
          </Labeled>
        </div>
      </SectionBlock>

      {/* 4) Climate & Topography */}
      <SectionBlock
        title="Climate & Topography"
        rightActions={
          <ConnectGuideActions
            hasGuide={hasGuide}
            guideName={effectiveLinked?.name}
            onConnect={() =>
              onConnectClick
                ? onConnectClick("climate")
                : document.dispatchEvent(new CustomEvent("connect-guide:open"))
            }
            onRemove={
              onRemoveLink ??
              (() => {
                alert(
                  "Use the “Remove Link” button in the section toolbar to unlink."
                );
              })
            }
          />
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <label className="block">
            <OverrideLabel label="Landform" fieldKey="landform" />
            <AutoGrow
              className={readOnlyClass("landform")}
              value={displayValue("landform", form.landform)}
              onChange={(e) => setField("landform", e.target.value)}
              readOnly={isLocked("landform")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel label="Altitude" fieldKey="altitude" />
            <AutoGrow
              className={readOnlyClass("altitude")}
              value={displayValue("altitude", form.altitude)}
              onChange={(e) => setField("altitude", e.target.value)}
              readOnly={isLocked("altitude")}
              minRows={1}
              maxRows={3}
            />
          </label>

          <label className="block">
            <OverrideLabel label="Mountain Range" fieldKey="mountain_range" />
            <AutoGrow
              className={readOnlyClass("mountain_range")}
              value={displayValue("mountain_range", form.mountain_range)}
              onChange={(e) => setField("mountain_range", e.target.value)}
              readOnly={isLocked("mountain_range")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel label="Weather Type" fieldKey="weather_type" />
            <AutoGrow
              className={readOnlyClass("weather_type")}
              value={displayValue("weather_type", form.weather_type)}
              onChange={(e) => setField("weather_type", e.target.value)}
              readOnly={isLocked("weather_type")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Average Temp in Summers"
              fieldKey="avg_temp_summers"
            />
            <AutoGrow
              className={readOnlyClass("avg_temp_summers")}
              value={displayValue("avg_temp_summers", form.avg_temp_summers)}
              onChange={(e) => setField("avg_temp_summers", e.target.value)}
              readOnly={isLocked("avg_temp_summers")}
              minRows={1}
              maxRows={3}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Average Temp in Winters"
              fieldKey="avg_temp_winters"
            />
            <AutoGrow
              className={readOnlyClass("avg_temp_winters")}
              value={displayValue("avg_temp_winters", form.avg_temp_winters)}
              onChange={(e) => setField("avg_temp_winters", e.target.value)}
              readOnly={isLocked("avg_temp_winters")}
              minRows={1}
              maxRows={3}
            />
          </label>
        </div>
      </SectionBlock>

      {/* 5) Did you know */}
      <SectionBlock title="Did you Know">
        <Labeled label="Interesting fact (free text)">
          <AutoGrow
            className={inputStyles}
            value={form.did_you_know || ""}
            onChange={(e) => setField("did_you_know", e.target.value)}
            minRows={2}
            maxRows={12}
          />
        </Labeled>
      </SectionBlock>

      {/* 6) Travel Guide */}
      <SectionBlock
        title="Travel Guide"
        rightActions={
          <ConnectGuideActions
            hasGuide={hasGuide}
            guideName={effectiveLinked?.name}
            onConnect={() =>
              onConnectClick
                ? onConnectClick("travel")
                : document.dispatchEvent(new CustomEvent("connect-guide:open"))
            }
            onRemove={
              onRemoveLink ??
              (() => alert("Use the “Remove Link” in the toolbar above."))
            }
          />
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <label className="block">
            <OverrideLabel
              label="Location (Travel Guide)"
              fieldKey="travel_location"
            />
            <AutoGrow
              className={readOnlyClass("travel_location")}
              value={displayValue("travel_location", form.travel_location)}
              onChange={(e) => setField("travel_location", e.target.value)}
              readOnly={isLocked("travel_location")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="How to Reach"
              fieldKey="travel_how_to_reach"
            />
            <AutoGrow
              className={readOnlyClass("travel_how_to_reach")}
              value={displayValue(
                "travel_how_to_reach",
                form.travel_how_to_reach
              )}
              onChange={(e) => setField("travel_how_to_reach", e.target.value)}
              readOnly={isLocked("travel_how_to_reach")}
              minRows={1}
              maxRows={6}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Nearest Major City"
              fieldKey="travel_nearest_major_city"
            />
            <AutoGrow
              className={readOnlyClass("travel_nearest_major_city")}
              value={displayValue(
                "travel_nearest_major_city",
                form.travel_nearest_major_city
              )}
              onChange={(e) =>
                setField("travel_nearest_major_city", e.target.value)
              }
              readOnly={isLocked("travel_nearest_major_city")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Airport Access"
              fieldKey="travel_airport_access"
            />
            <select
              className={readOnlyClass("travel_airport_access")}
              value={displayValue(
                "travel_airport_access",
                form.travel_airport_access
              )}
              onChange={(e) => {
                const v = e.target.value;
                setField("travel_airport_access", v);
                if (v !== "Yes") setField("travel_international_airport", "No");
              }}
              disabled={isLocked("travel_airport_access")}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>

          {/* International Airport (Yes/No) */}
          <label className="block">
            <OverrideLabel
              label="International Airport"
              fieldKey="travel_international_airport"
            />
            <select
              className={readOnlyClass("travel_international_airport")}
              value={displayValue(
                "travel_international_airport",
                form.travel_international_airport
              )}
              onChange={(e) =>
                setField("travel_international_airport", e.target.value)
              }
              disabled={
                isLocked("travel_international_airport") ||
                effectiveAirportAccess !== "Yes"
              }
              title={
                effectiveAirportAccess !== "Yes"
                  ? "Enable Airport Access to set this"
                  : undefined
              }
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>

          <label className="block">
            <OverrideLabel
              label="Access Options"
              fieldKey="travel_access_options"
            />
            <select
              className={readOnlyClass("travel_access_options")}
              value={displayValue(
                "travel_access_options",
                form.travel_access_options
              )}
              onChange={(e) =>
                setField("travel_access_options", e.target.value)
              }
              disabled={isLocked("travel_access_options")}
            >
              <option value="">— Select —</option>
              <option>By Road Only</option>
              <option>By Road and Air</option>
              <option>By Road, Air and Railway</option>
            </select>
          </label>

          {/* Road Type & Condition */}
          <label className="block">
            <OverrideLabel
              label="Road Type & Condition"
              fieldKey="travel_road_type_condition"
            />
            <AutoGrow
              className={readOnlyClass("travel_road_type_condition")}
              value={displayValue(
                "travel_road_type_condition",
                form.travel_road_type_condition
              )}
              onChange={(e) =>
                setField("travel_road_type_condition", e.target.value)
              }
              readOnly={isLocked("travel_road_type_condition")}
              minRows={1}
              maxRows={4}
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Best Time to Visit (short free text)"
              fieldKey="travel_best_time_free"
            />
            <AutoGrow
              className={readOnlyClass("travel_best_time_free")}
              value={displayValue(
                "travel_best_time_free",
                form.travel_best_time_free
              )}
              onChange={(e) =>
                setField("travel_best_time_free", e.target.value)
              }
              readOnly={isLocked("travel_best_time_free")}
              minRows={1}
              maxRows={4}
            />
          </label>

          {/* NEW: Best Time to Visit (Long) */}
          <label className="block lg:col-span-2">
            <OverrideLabel
              label="Best Time to Visit (Long)"
              fieldKey="travel_best_time_long"
            />
            <AutoGrow
              className={readOnlyClass("travel_best_time_long")}
              value={displayValue(
                "travel_best_time_long",
                form.travel_best_time_long
              )}
              onChange={(e) =>
                setField("travel_best_time_long", e.target.value)
              }
              readOnly={isLocked("travel_best_time_long")}
              minRows={4}
              maxRows={12}
              placeholder="Describe seasonal details, monsoon windows, monthly road conditions, closures, festivals, etc."
            />
          </label>

          <label className="block">
            <OverrideLabel
              label="Full Travel Guide URL (optional button)"
              fieldKey="travel_full_guide_url"
            />
            <AutoGrow
              className={readOnlyClass("travel_full_guide_url")}
              value={displayValue(
                "travel_full_guide_url",
                form.travel_full_guide_url
              )}
              onChange={(e) =>
                setField("travel_full_guide_url", e.target.value)
              }
              onBlur={(e) =>
                setField("travel_full_guide_url", nullIfEmpty(e.target.value))
              }
              readOnly={isLocked("travel_full_guide_url")}
              minRows={1}
              maxRows={4}
            />
          </label>
        </div>
      </SectionBlock>

      {/* 7) Best Time preset */}
      <SectionBlock title="Best Time to Visit (preset)">
        <Labeled label="Preset Key (temporary; global presets later)">
          <AutoGrow
            className={inputStyles}
            value={form.best_time_option_key || ""}
            onChange={(e) => setField("best_time_option_key", e.target.value)}
            onBlur={(e) =>
              setField("best_time_option_key", nullIfEmpty(e.target.value))
            }
            minRows={1}
            maxRows={4}
          />
        </Labeled>
      </SectionBlock>

      {/* 8) Places to Stay */}
      <SectionBlock
        title="Places to Stay"
        rightActions={
          <ConnectGuideActions
            hasGuide={hasGuide}
            guideName={effectiveLinked?.name}
            onConnect={() =>
              onConnectClick
                ? onConnectClick("stay")
                : document.dispatchEvent(new CustomEvent("connect-guide:open"))
            }
            onRemove={
              onRemoveLink ??
              (() => alert("Use the “Remove Link” in the toolbar above."))
            }
          />
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <label className="block">
            <OverrideLabel
              label="Hotels Available"
              fieldKey="stay_hotels_available"
            />
            <select
              className={readOnlyClass("stay_hotels_available")}
              value={displayValue(
                "stay_hotels_available",
                form.stay_hotels_available
              )}
              onChange={(e) =>
                setField("stay_hotels_available", e.target.value)
              }
              disabled={isLocked("stay_hotels_available")}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Limited Options</option>
            </select>
          </label>

          <label className="block">
            <OverrideLabel
              label="Spending Night Recommended"
              fieldKey="stay_spending_night_recommended"
            />
            <select
              className={readOnlyClass("stay_spending_night_recommended")}
              value={displayValue(
                "stay_spending_night_recommended",
                form.stay_spending_night_recommended
              )}
              onChange={(e) =>
                setField("stay_spending_night_recommended", e.target.value)
              }
              disabled={isLocked("stay_spending_night_recommended")}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>

          <label className="block">
            <OverrideLabel
              label="Camping Possible"
              fieldKey="stay_camping_possible"
            />
            <select
              className={readOnlyClass("stay_camping_possible")}
              value={displayValue(
                "stay_camping_possible",
                form.stay_camping_possible
              )}
              onChange={(e) =>
                setField("stay_camping_possible", e.target.value)
              }
              disabled={isLocked("stay_camping_possible")}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
              <option>Not Recommended</option>
              <option>Not Suitable</option>
            </select>
          </label>

          <label className="block">
            <OverrideLabel
              label="Places to Eat Available"
              fieldKey="stay_places_to_eat_available"
            />
            <select
              className={readOnlyClass("stay_places_to_eat_available")}
              value={displayValue(
                "stay_places_to_eat_available",
                form.stay_places_to_eat_available
              )}
              onChange={(e) =>
                setField("stay_places_to_eat_available", e.target.value)
              }
              disabled={isLocked("stay_places_to_eat_available")}
            >
              <option value="">— Select —</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>
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
  rightActions,
}: {
  title: string;
  children: React.ReactNode;
  rightActions?: React.ReactNode;
}) {
  const iconName = TITLE_ICON_MAP[title];

  return (
    <div className="mx-4 sm:mx-6 md:mx-10 lg:mx-14 xl:mx-20 2xl:mx-28 my-12 md:my-16 lg:my-20">
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-8 md:px-10 py-6 md:py-7 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg md:text-xl font-semibold text-[var(--brand-blue)]">
            {iconName ? (
              <Icon
                name={iconName}
                className="w-6 h-6 md:w-7 md:h-7 text-[var(--brand-orange)]"
                aria-hidden="true"
              />
            ) : null}
            {title}
          </h3>
          {rightActions ?? null}
        </div>
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

function ConnectGuideActions({
  hasGuide,
  guideName,
  onConnect,
  onRemove,
}: {
  hasGuide?: boolean;
  guideName?: string;
  onConnect?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {hasGuide ? (
        <>
          <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-[2px] text-xs">
            Linked: {guideName || "Travel Guide"}
          </span>
          <button
            type="button"
            onClick={onConnect}
            className="text-xs px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
            title="Change Travel Guide"
          >
            Change
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs px-3 py-1 rounded-md border border-red-300 text-red-600 hover:bg-red-50"
            title="Remove link"
          >
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="text-xs px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          title="Connect Travel Guide"
        >
          Connect Travel Guide
        </button>
      )}
    </div>
  );
}
