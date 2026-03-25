// src/app/heritage/[region]/[slug]/heritage/HeritageSidebar.tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Site, Taxonomy } from "./heritagedata";
import Icon from "@/components/Icon";

const LocationMapSheet = dynamic(
  () => import("@/components/LocationMapSheet"),
  { ssr: false }
);

import Lottie from "lottie-react";
import mapPinData from "@/assets/map-pin.json";

const MOBILE_PREVIEW_ROWS = 4;

function GeneralInfoSlidePanel({
  rows,
  onClose,
}: {
  rows: Array<{ k: string; v?: string | number | null }>;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  function handleClose() {
    setClosing(true);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[5000] bg-white flex flex-col ${closing ? "animate-slide-out-right" : "animate-slide-in-right"}`}
      onAnimationEnd={() => { if (closing) onClose(); }}
    >
      <div className="flex items-center gap-3 px-4 border-b border-slate-100" style={{ paddingTop: "calc(var(--sat, 44px) + 10px)", paddingBottom: "12px" }}>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600"
          aria-label="Back"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M12.59 4.58a1 1 0 010 1.41L8.66 10l3.93 4.01a1 1 0 11-1.42 1.42l-4.64-4.72a1 1 0 010-1.42l4.64-4.71a1 1 0 011.42 0z" />
          </svg>
        </button>
        <h2 className="text-[17px] font-bold text-[var(--brand-blue)]">General Information</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {rows.map((row, idx) => (
          <KeyVal key={`${row.k}-${idx}`} k={row.k} v={row.v} />
        ))}
      </div>
    </div>,
    document.body
  );
}

/** Minimal shape for the guide summary we may receive from server */
type TravelGuideSummary = {
  location?: string | null;
  how_to_reach?: string | null;
  nearest_major_city?: string | null;

  airport_access?: boolean | null;
  access_options?:
    | "by_road_only"
    | "by_trek_only"
    | "by_jeep_and_trek_only"
    | "by_road_and_railway"
    | "by_road_and_airport"
    | "by_road_railway_airport"
    | null;

  road_type_condition?: string | null;

  best_time_to_visit?:
    | "year_long"
    | "winters"
    | "summers"
    | "spring"
    | "spring_and_summers"
    | "winter_and_spring"
    | null;

  /** free text long description */
  best_time_to_visit_long?: string | null;

  hotels_available?: "yes" | "no" | "limited_options" | null;
  spending_night_recommended?:
    | "yes"
    | "not_recommended"
    | "not_suitable"
    | null;
  camping?: "possible" | "not_suitable" | "with_caution" | null;
  places_to_eat?: "yes" | "no" | "limited_options" | null;

  altitude?: string | null;
  landform?:
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

  mountain_range?: string | null;
  climate_type?: string | null;
  temp_winter?: string | null;
  temp_summers?: string | null;
};

/* ---- Maps for enum -> label ---- */
const ACCESS_OPTIONS_MAP: Record<
  NonNullable<TravelGuideSummary["access_options"]>,
  string
> = {
  by_road_only: "By Road Only",
  by_trek_only: "By Trek Only",
  by_jeep_and_trek_only: "By Jeep and Trek Only",
  by_road_and_railway: "By Road and Railway",
  by_road_and_airport: "By Road and Airport",
  by_road_railway_airport: "By Road, Railway & Airport",
};
const BEST_TIME_MAP: Record<
  NonNullable<TravelGuideSummary["best_time_to_visit"]>,
  string
> = {
  year_long: "Year long",
  winters: "Winters",
  summers: "Summers",
  spring: "Spring",
  spring_and_summers: "Spring and Summers",
  winter_and_spring: "Winter and Spring",
};
const YES_NO_LIMITED_MAP: Record<"yes" | "no" | "limited_options", string> = {
  yes: "Yes",
  no: "No",
  limited_options: "Limited Options",
};
const YES_RECS_MAP: Record<"yes" | "not_recommended" | "not_suitable", string> =
  {
    yes: "Yes",
    not_recommended: "Not Recommended",
    not_suitable: "Not Suitable",
  };
const CAMPING_MAP: Record<"possible" | "not_suitable" | "with_caution", string> =
  {
    possible: "Possible",
    not_suitable: "Not Suitable",
    with_caution: "With Caution",
  };
const LANDFORM_MAP: Record<
  NonNullable<TravelGuideSummary["landform"]>,
  string
> = {
  mountains: "Mountains",
  plains: "Plains",
  river: "River",
  plateau: "Plateau",
  mountain_peak: "Mountain Peak",
  valley: "Valley",
  desert: "Desert",
  coastal: "Coastal",
  wetlands: "Wetlands",
  forest: "Forest",
  canyon_gorge: "Canyon / Gorge",
  glacier: "Glacier",
  lake_basin: "Lake Basin",
  steppe: "Steppe",
};
// MOBILE_GENERAL_INFO_PREVIEW_ROWS replaced by MOBILE_PREVIEW_ROWS above

/* ---- Key/value row ---- */
function KeyVal({ k, v, idx = 0 }: { k: string; v?: string | number | null; idx?: number }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className={`grid grid-cols-[120px_minmax(0,2fr)] gap-x-4 py-2.5 border-b border-black/5 last:border-b-0 overflow-x-visible ${idx % 2 === 0 ? "" : "bg-slate-50/60"}`}>
      <div className="text-[13px] font-bold uppercase tracking-wide text-slate-400">{k}</div>
      <div className="text-[14px] font-medium text-slate-800 text-left break-words whitespace-pre-wrap overflow-x-visible">
        {String(v)}
      </div>
    </div>
  );
}

function GpsCoords({ lat, lng }: { lat?: number | string | null; lng?: number | string | null }) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  return (
    <div className="grid grid-cols-[120px_minmax(0,2fr)] gap-x-4 py-2.5 border-b border-black/5 last:border-b-0">
      <div className="text-[13px] font-bold uppercase tracking-wide text-slate-400">GPS</div>
      <div className="text-[14px] font-medium text-slate-800 font-mono tabular-nums">
        {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
      </div>
    </div>
  );
}

function IconChip({
  iconName,
  label,
  href,
}: {
  iconName: string | null;
  label: string | null;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-2 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="w-8 h-8 rounded-full bg-[var(--brand-orange)] flex items-center justify-center flex-shrink-0">
        {iconName && <Icon name={iconName} size={16} className="text-white" />}
      </div>
      <span className="font-category-chip transition-colors duration-200 group-hover:text-[var(--brand-orange)]">
        {label ?? ""}
      </span>
    </a>
  );
}

function SidebarAccordionSection({
  title,
  iconName,
  id,
  mobileDefaultOpen = true,
  onHeaderTap,
  children,
}: {
  title: string;
  iconName?: string;
  id?: string;
  mobileDefaultOpen?: boolean;
  onHeaderTap?: () => void;
  children: React.ReactNode;
}) {
  const [openMobile, setOpenMobile] = useState(mobileDefaultOpen);

  const titleEl = (
    <h2
      className="flex items-center gap-2 text-[22px] font-extrabold"
      style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
    >
      {iconName ? <Icon name={iconName} size={18} className="text-[var(--brand-orange)]" /> : null}
      <span>{title}</span>
    </h2>
  );

  const chevronRight = (
    <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
        <path d="M7.41 4.58a1 1 0 000 1.41L11.34 10l-3.93 4.01a1 1 0 101.42 1.42l4.64-4.72a1 1 0 000-1.42L8.83 4.58a1 1 0 00-1.42 0z" />
      </svg>
    </span>
  );

  const chevronDown = (
    <span aria-hidden="true" className="inline-flex shrink-0 h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style={{ transform: openMobile ? "rotate(180deg)" : "rotate(0deg)" }}>
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.13l3.71-3.9a.75.75 0 111.08 1.04l-4.25 4.46a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
      </svg>
    </span>
  );

  /* When onHeaderTap is set: whole card is one tappable button on mobile */
  if (onHeaderTap) {
    return (
      <section id={id} className="scroll-mt-[var(--sticky-offset)] bg-white">
        <button
          type="button"
          onClick={onHeaderTap}
          className="md:hidden w-full flex items-center justify-between gap-3 px-4 py-4 text-left cursor-pointer active:bg-slate-50"
        >
          {titleEl}
          {chevronRight}
        </button>
        <div className="md:hidden px-4 pb-4">
          {children}
        </div>
        {/* Desktop: static heading + content */}
        <div className="hidden md:block p-4">
          <h2
            className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[17px] md:text-[18px] font-semibold"
            style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
          >
            {iconName ? <Icon name={iconName} size={18} className="text-[var(--brand-orange)]" /> : null}
            <span>{title}</span>
          </h2>
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white p-4">
      <div id={id} className="scroll-mt-[var(--sticky-offset)]" />

      <button
        type="button"
        className="md:hidden mb-3 w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        onClick={() => setOpenMobile((prev) => !prev)}
        aria-expanded={openMobile}
      >
        {titleEl}
        {chevronDown}
      </button>

      <h2
        className="mb-3 hidden md:flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[17px] md:text-[18px] font-semibold"
        style={{ color: "var(--brand-blue, #1f6be0)", fontFamily: "var(--font-article-heading, inherit)" }}
      >
        {iconName ? <Icon name={iconName} size={18} className="text-[var(--brand-orange)]" /> : null}
        <span>{title}</span>
      </h2>

      <div className={`${openMobile ? "block" : "hidden"} md:block`}>
        {children}
      </div>
    </section>
  );
}

/** If a field is overridden, prefer the SITE value first;
 * otherwise prefer GUIDE value first (legacy behavior). */
function pick(
  field: string,
  guideVal: any,
  siteVal: any,
  overrides?: Record<string, boolean> | null
) {
  const ov = overrides ?? {};
  const has = (v: any) =>
    v !== undefined && v !== null && String(v).trim() !== "";
  if (ov[field]) {
    return has(siteVal) ? siteVal : has(guideVal) ? guideVal : null;
  }
  return has(guideVal) ? guideVal : has(siteVal) ? siteVal : null;
}

function hasDisplayValue(v: unknown) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

export default function HeritageSidebar({
  site,
  provinceName,
  regions,
  maps,
  travelGuideSummary,
  sectionGroup = "all",
  regionsPlacement = "top",
}: {
  site: Site & {
    overrides?: Record<string, boolean> | null;
    travel_best_time_long?: string | null;
  };
  provinceName: string | null;
  regions: Taxonomy[];
  maps: { embed: string | null; link: string | null };
  travelGuideSummary?: TravelGuideSummary | null;
  sectionGroup?: "all" | "top" | "bottom" | "mobile-location" | "mobile-general" | "mobile-travel" | "mobile-climate" | "mobile-stay" | "mobile-bottom";
  regionsPlacement?: "top" | "bottom";
}) {
  // use server-provided summary directly, no client Supabase calls
  const tgs: TravelGuideSummary | null = travelGuideSummary ?? null;

  /* ---------- Merge (respect overrides) ---------- */
  const ov = (site as any).overrides || {};

  const guideLandform = tgs?.landform ? LANDFORM_MAP[tgs.landform] : null;
  const mergedLandform = pick("landform", guideLandform, site.landform, ov);
  const mergedAltitude = pick(
    "altitude",
    tgs?.altitude ?? null,
    site.altitude,
    ov
  );
  const mergedMountainRange = pick(
    "mountain_range",
    tgs?.mountain_range ?? null,
    site.mountain_range,
    ov
  );
  const mergedWeatherType = pick(
    "weather_type",
    tgs?.climate_type ?? null,
    site.weather_type,
    ov
  );
  const mergedAvgSummer = pick(
    "avg_temp_summers",
    tgs?.temp_summers ?? null,
    site.avg_temp_summers,
    ov
  );
  const mergedAvgWinter = pick(
    "avg_temp_winters",
    tgs?.temp_winter ?? null,
    site.avg_temp_winters,
    ov
  );

  const mergedTravelLocation = pick(
    "travel_location",
    tgs?.location ?? null,
    site.travel_location,
    ov
  );
  const mergedHowToReach = pick(
    "travel_how_to_reach",
    tgs?.how_to_reach ?? null,
    site.travel_how_to_reach,
    ov
  );
  const mergedNearestCity = pick(
    "travel_nearest_major_city",
    tgs?.nearest_major_city ?? null,
    site.travel_nearest_major_city,
    ov
  );

  const guideAirportAccess =
    tgs?.airport_access == null ? null : tgs.airport_access ? "Yes" : "No";
  const mergedAirportAccess = pick(
    "travel_airport_access",
    guideAirportAccess,
    site.travel_airport_access,
    ov
  );

  const guideAccessOptions = tgs?.access_options
    ? ACCESS_OPTIONS_MAP[tgs.access_options]
    : null;
  const mergedAccessOptions = pick(
    "travel_access_options",
    guideAccessOptions,
    site.travel_access_options,
    ov
  );

  const mergedRoadType = pick(
    "travel_road_type_condition",
    tgs?.road_type_condition ?? null,
    site.travel_road_type_condition,
    ov
  );

  const guideBestTime = tgs?.best_time_to_visit
    ? BEST_TIME_MAP[tgs.best_time_to_visit]
    : null;
  const mergedBestTimeFree = pick(
    "travel_best_time_free",
    guideBestTime,
    site.travel_best_time_free,
    ov
  );

  // Long best time (free text) with override-aware merge
  const mergedBestTimeLong = pick(
    "travel_best_time_long",
    tgs?.best_time_to_visit_long ?? null,
    (site as any).travel_best_time_long,
    ov
  );

  const guideHotels = tgs?.hotels_available
    ? YES_NO_LIMITED_MAP[tgs.hotels_available]
    : null;
  const mergedHotelsAvailable = pick(
    "stay_hotels_available",
    guideHotels,
    site.stay_hotels_available,
    ov
  );

  const guideSpending = tgs?.spending_night_recommended
    ? YES_RECS_MAP[tgs.spending_night_recommended]
    : null;
  const mergedSpendingNight = pick(
    "stay_spending_night_recommended",
    guideSpending,
    site.stay_spending_night_recommended,
    ov
  );

  const guideCamping = tgs?.camping ? CAMPING_MAP[tgs.camping] : null;
  const mergedCamping = pick(
    "stay_camping_possible",
    guideCamping,
    site.stay_camping_possible,
    ov
  );

  const guideEat = tgs?.places_to_eat
    ? YES_NO_LIMITED_MAP[tgs.places_to_eat]
    : null;
  const mergedPlacesToEat = pick(
    "stay_places_to_eat_available",
    guideEat,
    site.stay_places_to_eat_available,
    ov
  );
  const [showGeneralInfoPanel, setShowGeneralInfoPanel] = useState(false);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);

  const generalInfoRows: Array<{ k: string; v?: string | number | null }> = [
    { k: "Heritage Type", v: site.heritage_type },
    { k: "Architectural Style", v: site.architectural_style },
    { k: "Construction Materials", v: site.construction_materials },
    { k: "Local Name", v: site.local_name },
    { k: "Architect", v: site.architect },
    { k: "Construction Date", v: site.construction_date },
    { k: "Built by", v: site.built_by },
    { k: "Dynasty", v: site.dynasty },
    { k: "Conservation Status", v: site.conservation_status },
    { k: "Current Use", v: site.current_use },
    { k: "Restored by", v: site.restored_by },
    { k: "Known for", v: site.known_for },
    { k: "Era", v: site.era },
    { k: "Inhabited by", v: site.inhabited_by },
    { k: "National Park Established in", v: site.national_park_established_in },
    { k: "Population", v: site.population },
    { k: "Ethnic Groups", v: site.ethnic_groups },
    { k: "Languages Spoken", v: site.languages_spoken },
    { k: "Excavation Status", v: site.excavation_status },
    { k: "Excavated by", v: site.excavated_by },
    { k: "Administered by", v: site.administered_by },
  ];
  const availableGeneralInfoRows = generalInfoRows.filter((row) =>
    hasDisplayValue(row.v)
  );
  const previewGeneralInfoRows = availableGeneralInfoRows.slice(0, MOBILE_PREVIEW_ROWS);
  const hasMoreGeneralInfo = availableGeneralInfoRows.length > MOBILE_PREVIEW_ROWS;

  /* ---------------------------- UI ---------------------------- */
  const unescoStatus = site.unesco_status
    ? String(site.unesco_status).trim()
    : "";
  const showUNESCO =
    unescoStatus.length > 0 && unescoStatus.toLowerCase() !== "none";
  const isMobileGroup = sectionGroup.startsWith("mobile-");
  const showTop = !isMobileGroup && sectionGroup !== "bottom";
  const showBottom = !isMobileGroup && sectionGroup !== "top";
  const showRegionsInTop = showTop && regionsPlacement !== "bottom";
  const showRegionsInBottom = showBottom && regionsPlacement === "bottom";
  const lat = site.latitude != null ? Number(site.latitude) : null;
  const lng = site.longitude != null ? Number(site.longitude) : null;
  const hasCoordinates =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const staticMapUrl =
    hasCoordinates && googleMapsApiKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=1000x800&scale=2&maptype=roadmap&key=${googleMapsApiKey}`
      : null;

  return (
    <>
    <div className="space-y-2">
      {showTop && (
        <>
          <SidebarAccordionSection
            id="location"
            title="Where is it?"
            iconName="where-is-it"
            mobileDefaultOpen
          >
            {staticMapUrl ? (
              <button
                type="button"
                onClick={() => setMapSheetOpen(true)}
                aria-label={`Open map for ${site.title}`}
                className="relative aspect-[4/3] md:aspect-[5/4] w-full overflow-hidden rounded-[28px] border border-slate-200 mb-3 block cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={staticMapUrl}
                  alt={`Map for ${site.title}`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Lottie pin animation */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[85%] z-10" style={{ width: 64, height: 64, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }}>
                  <Lottie animationData={mapPinData} loop autoplay style={{ width: "100%", height: "100%" }} />
                </div>
                {/* Tap hint */}
                <div className="pointer-events-none absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-t from-black/25 to-transparent rounded-b-[28px]">
                  <Icon name="map-marker-alt" size={11} className="text-white/80" />
                  <span className="text-white/90 text-[12px] font-medium tracking-wide">Tap to explore map</span>
                </div>
              </button>
            ) : maps.embed ? (
              <button
                type="button"
                onClick={() => setMapSheetOpen(true)}
                aria-label={`Open map for ${site.title}`}
                className="relative aspect-[4/3] md:aspect-[5/4] w-full overflow-hidden rounded-[28px] border border-slate-200 mb-3 block cursor-pointer"
              >
                <iframe
                  title={`Map for ${site.title}`}
                  src={maps.embed}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="absolute inset-0 h-full w-full border-0 pointer-events-none"
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[85%] z-10" style={{ width: 64, height: 64, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }}>
                  <Lottie animationData={mapPinData} loop autoplay style={{ width: "100%", height: "100%" }} />
                </div>
                {/* Tap hint */}
                <div className="pointer-events-none absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-t from-black/25 to-transparent rounded-b-[28px]">
                  <Icon name="map-marker-alt" size={11} className="text-white/80" />
                  <span className="text-white/90 text-[12px] font-medium tracking-wide">Tap to explore map</span>
                </div>
              </button>
            ) : (
              <div
                className="mb-3 text-[15px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                Location coordinates not available.
              </div>
            )}

            <KeyVal k="Town/City/Village" v={site.town_city_village} idx={0} />
            <KeyVal k="Tehsil" v={site.tehsil} idx={1} />
            <KeyVal k="District" v={site.district} idx={2} />
            <KeyVal k="Region/Province" v={provinceName} idx={3} />
            <GpsCoords lat={site.latitude} lng={site.longitude} />
            {maps.link ? (
              <div className="mt-4 flex justify-center">
                <a
                  href={maps.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--brand-blue)] px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
                >
                  <Icon name="map-marker-alt" size={13} />
                  Open in Google Maps
                </a>
              </div>
            ) : null}
          </SidebarAccordionSection>

          {showRegionsInTop && (
            <SidebarAccordionSection
              title="Regions"
              iconName="regions"
              mobileDefaultOpen={true}
            >
              {regions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {regions.map((r) => (
                    <IconChip
                      key={r.id}
                      iconName={r.icon_key}
                      label={r.name}
                      href={`/explore?regs=${r.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="text-[15px]"
                  style={{ color: "var(--muted-foreground, #5b6b84)" }}
                >
                  No regions specified.
                </div>
              )}
            </SidebarAccordionSection>
          )}

          <SidebarAccordionSection
            id="general"
            title="General Information"
            iconName="general-info"
            mobileDefaultOpen
            onHeaderTap={hasMoreGeneralInfo ? () => setShowGeneralInfoPanel(true) : undefined}
          >
            <div className="md:hidden">
              {previewGeneralInfoRows.map((row, idx) => (
                <KeyVal key={`${row.k}-${idx}`} k={row.k} v={row.v} />
              ))}
              {showGeneralInfoPanel && (
                <GeneralInfoSlidePanel
                  rows={availableGeneralInfoRows}
                  onClose={() => setShowGeneralInfoPanel(false)}
                />
              )}
            </div>

            <div className="hidden md:block">
              {availableGeneralInfoRows.map((row, idx) => (
                <KeyVal key={`${row.k}-${idx}`} k={row.k} v={row.v} />
              ))}
            </div>
          </SidebarAccordionSection>

          {showUNESCO ? (
            <section className="bg-white p-4">
              <h2
                className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[22px] md:text-[18px] font-extrabold md:font-semibold"
                style={{
                  color: "var(--brand-blue, #1f6be0)",
                  fontFamily: "var(--font-article-heading, inherit)",
                }}
              >
                <Icon
                  name="unesco"
                  size={18}
                  className="text-[var(--brand-orange)]"
                />
                <span>UNESCO</span>
              </h2>
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏛️</div>
                <div>
                  <div className="font-medium text-[15px] text-slate-900">
                    {site.unesco_status}
                  </div>
                  {site.unesco_line && (
                    <div
                      className="mt-1 text-[15px]"
                      style={{ color: "var(--muted-foreground, #5b6b84)" }}
                    >
                      {site.unesco_line}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* ---- Mobile-specific single-section groups ---- */}
      {sectionGroup === "mobile-location" && (
        <SidebarAccordionSection
          id="location"
          title="Where is it?"
          iconName="where-is-it"
          mobileDefaultOpen
        >
          {staticMapUrl ? (
            <button
              type="button"
              onClick={() => setMapSheetOpen(true)}
              aria-label={`Open map for ${site.title}`}
              className="relative aspect-[4/3] md:aspect-[5/4] w-full overflow-hidden rounded-[28px] border border-slate-200 mb-3 block cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={staticMapUrl}
                alt={`Map for ${site.title}`}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[85%] z-10" style={{ width: 64, height: 64, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }}>
                <Lottie animationData={mapPinData} loop autoplay style={{ width: "100%", height: "100%" }} />
              </div>
              {/* Tap hint */}
              <div className="pointer-events-none absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-t from-black/25 to-transparent rounded-b-[28px]">
                <Icon name="map-marker-alt" size={11} className="text-white/80" />
                <span className="text-white/90 text-[12px] font-medium tracking-wide">Tap to explore map</span>
              </div>
            </button>
          ) : maps.embed ? (
            <button
              type="button"
              onClick={() => setMapSheetOpen(true)}
              aria-label={`Open map for ${site.title}`}
              className="relative aspect-[4/3] md:aspect-[5/4] w-full overflow-hidden rounded-[28px] border border-slate-200 mb-3 block cursor-pointer"
            >
              <iframe
                title={`Map for ${site.title}`}
                src={maps.embed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 h-full w-full border-0 pointer-events-none"
              />
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[85%] z-10" style={{ width: 64, height: 64, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }}>
                <Lottie animationData={mapPinData} loop autoplay style={{ width: "100%", height: "100%" }} />
              </div>
              {/* Tap hint */}
              <div className="pointer-events-none absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-t from-black/25 to-transparent rounded-b-[28px]">
                <Icon name="map-marker-alt" size={11} className="text-white/80" />
                <span className="text-white/90 text-[12px] font-medium tracking-wide">Tap to explore map</span>
              </div>
            </button>
          ) : (
            <div
              className="mb-3 text-[15px]"
              style={{ color: "var(--muted-foreground, #5b6b84)" }}
            >
              Location coordinates not available.
            </div>
          )}
          <KeyVal k="Town/City/Village" v={site.town_city_village} idx={0} />
          <KeyVal k="Tehsil" v={site.tehsil} idx={1} />
          <KeyVal k="District" v={site.district} idx={2} />
          <KeyVal k="Region/Province" v={provinceName} idx={3} />
          <GpsCoords lat={site.latitude} lng={site.longitude} />
          {maps.link ? (
            <div className="mt-4 flex justify-center">
              <a
                href={maps.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--brand-blue)] px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
              >
                <Icon name="map-marker-alt" size={13} />
                Open in Google Maps
              </a>
            </div>
          ) : null}
        </SidebarAccordionSection>
      )}

      {sectionGroup === "mobile-general" && (
        <>
          <SidebarAccordionSection
            id="general"
            title="General Information"
            iconName="general-info"
            mobileDefaultOpen
            onHeaderTap={hasMoreGeneralInfo ? () => setShowGeneralInfoPanel(true) : undefined}
          >
            <div className="md:hidden">
              {previewGeneralInfoRows.map((row, idx) => (
                <KeyVal key={`${row.k}-${idx}`} k={row.k} v={row.v} />
              ))}
              {showGeneralInfoPanel && (
                <GeneralInfoSlidePanel
                  rows={availableGeneralInfoRows}
                  onClose={() => setShowGeneralInfoPanel(false)}
                />
              )}
            </div>
          </SidebarAccordionSection>
          {showUNESCO ? (
            <section className="bg-white p-4">
              <h2
                className="mb-3 flex items-center gap-2 scroll-mt-[var(--sticky-offset)] text-[22px] md:text-[18px] font-extrabold md:font-semibold"
                style={{
                  color: "var(--brand-blue, #1f6be0)",
                  fontFamily: "var(--font-article-heading, inherit)",
                }}
              >
                <Icon name="unesco" size={18} className="text-[var(--brand-orange)]" />
                <span>UNESCO</span>
              </h2>
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏛️</div>
                <div>
                  <div className="font-medium text-[15px] text-slate-900">{site.unesco_status}</div>
                  {site.unesco_line && (
                    <div className="mt-1 text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                      {site.unesco_line}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {sectionGroup === "mobile-travel" && (
        <SidebarAccordionSection
          id="travel"
          title="Travel Guide"
          iconName="travel-guide"
          mobileDefaultOpen
        >
          <KeyVal k="Heritage Site" v={site.title} />
          <KeyVal k="Location" v={mergedTravelLocation} />
          <KeyVal k="How to Reach" v={mergedHowToReach} />
          <KeyVal k="Nearest Major City" v={mergedNearestCity} />
          <KeyVal k="Airport Access" v={mergedAirportAccess} />
          <KeyVal k="International Flight" v={site.travel_international_flight} />
          <KeyVal k="Access Options" v={mergedAccessOptions} />
          <KeyVal k="Road Type & Condition" v={mergedRoadType} />
          <KeyVal k="Best Time to Visit" v={mergedBestTimeFree} />
          {site.travel_full_guide_url && (
            <a
              href={site.travel_full_guide_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-[15px]"
            >
              Open Full Travel Guide
            </a>
          )}
        </SidebarAccordionSection>
      )}

      {sectionGroup === "mobile-climate" && (
        <>
          <SidebarAccordionSection
            title="Best Time to Visit"
            iconName="best-time-to-visit"
            mobileDefaultOpen
          >
            {mergedBestTimeLong ? (
              <div className="whitespace-pre-wrap text-[15px] overflow-x-visible" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                {mergedBestTimeLong}
              </div>
            ) : site.best_time_option_key ? (
              <div className="text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                {site.best_time_option_key}
              </div>
            ) : (
              <div className="text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>-</div>
            )}
          </SidebarAccordionSection>
          <SidebarAccordionSection
            id="climate-topography"
            title="Climate & Topography"
            iconName="climate-topography"
            mobileDefaultOpen
          >
            <KeyVal k="Landform" v={mergedLandform} />
            <KeyVal k="Altitude" v={mergedAltitude} />
            <KeyVal k="Mountain Range" v={mergedMountainRange} />
            <KeyVal k="Weather Type" v={mergedWeatherType} />
            <KeyVal k="Avg Temp (Summers)" v={mergedAvgSummer} />
            <KeyVal k="Avg Temp (Winters)" v={mergedAvgWinter} />
          </SidebarAccordionSection>
        </>
      )}

      {sectionGroup === "mobile-stay" && (
        <SidebarAccordionSection
          title="Places to Stay"
          iconName="places-to-stay"
          mobileDefaultOpen
        >
          <KeyVal k="Hotels Available" v={mergedHotelsAvailable} />
          <KeyVal k="Spending Night Recommended" v={mergedSpendingNight} />
          <KeyVal k="Camping Possible" v={mergedCamping} />
          <KeyVal k="Places to Eat Available" v={mergedPlacesToEat} />
        </SidebarAccordionSection>
      )}

      {sectionGroup === "mobile-bottom" && (
        <>
          <SidebarAccordionSection
            title="Did you Know"
            iconName="did-you-know"
            mobileDefaultOpen
          >
            {site.did_you_know ? (
              <div className="whitespace-pre-wrap text-[15px] overflow-x-visible" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                {site.did_you_know}
              </div>
            ) : (
              <div className="text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>-</div>
            )}
          </SidebarAccordionSection>
          <SidebarAccordionSection
            title="Regions"
            iconName="regions"
            mobileDefaultOpen
          >
            {regions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {regions.map((r) => (
                  <IconChip key={r.id} iconName={r.icon_key} label={r.name} href={`/explore?regs=${r.id}`} />
                ))}
              </div>
            ) : (
              <div className="text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                No regions specified.
              </div>
            )}
          </SidebarAccordionSection>
          <SidebarAccordionSection
            title="Protected under"
            iconName="protected-under"
            mobileDefaultOpen
          >
            {site.protected_under ? (
              <div className="whitespace-pre-wrap text-[15px] overflow-x-visible" style={{ color: "var(--muted-foreground, #5b6b84)" }}>
                {site.protected_under}
              </div>
            ) : (
              <div className="text-[15px]" style={{ color: "var(--muted-foreground, #5b6b84)" }}>Not specified.</div>
            )}
          </SidebarAccordionSection>
        </>
      )}

      {showBottom && (
        <>
          {showRegionsInBottom && (
            <SidebarAccordionSection
              title="Regions"
              iconName="regions"
              mobileDefaultOpen={true}
            >
              {regions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {regions.map((r) => (
                    <IconChip
                      key={r.id}
                      iconName={r.icon_key}
                      label={r.name}
                      href={`/explore?regs=${r.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="text-[15px]"
                  style={{ color: "var(--muted-foreground, #5b6b84)" }}
                >
                  No regions specified.
                </div>
              )}
            </SidebarAccordionSection>
          )}

          <SidebarAccordionSection
            title="Protected under"
            iconName="protected-under"
            mobileDefaultOpen={true}
          >
            {site.protected_under ? (
              <div
                className="whitespace-pre-wrap text-[15px] overflow-x-visible"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                {site.protected_under}
              </div>
            ) : (
              <div
                className="text-[15px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                Not specified.
              </div>
            )}
          </SidebarAccordionSection>

          <SidebarAccordionSection
            id="climate-topography"
            title="Climate & Topography"
            iconName="climate-topography"
            mobileDefaultOpen={true}
          >
            <KeyVal k="Landform" v={mergedLandform} />
            <KeyVal k="Altitude" v={mergedAltitude} />
            <KeyVal k="Mountain Range" v={mergedMountainRange} />
            <KeyVal k="Weather Type" v={mergedWeatherType} />
            <KeyVal k="Avg Temp (Summers)" v={mergedAvgSummer} />
            <KeyVal k="Avg Temp (Winters)" v={mergedAvgWinter} />
          </SidebarAccordionSection>

          <SidebarAccordionSection
            title="Did you Know"
            iconName="did-you-know"
            mobileDefaultOpen={true}
          >
            {site.did_you_know ? (
              <div
                className="whitespace-pre-wrap text-[15px] overflow-x-visible"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                {site.did_you_know}
              </div>
            ) : (
              <div
                className="text-[15px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                -
              </div>
            )}
          </SidebarAccordionSection>

          <SidebarAccordionSection
            id="travel"
            title="Travel Guide"
            iconName="travel-guide"
            mobileDefaultOpen={true}
          >
            <KeyVal k="Heritage Site" v={site.title} />
            <KeyVal k="Location" v={mergedTravelLocation} />
            <KeyVal k="How to Reach" v={mergedHowToReach} />
            <KeyVal k="Nearest Major City" v={mergedNearestCity} />
            <KeyVal k="Airport Access" v={mergedAirportAccess} />
            <KeyVal
              k="International Flight"
              v={site.travel_international_flight}
            />
            <KeyVal k="Access Options" v={mergedAccessOptions} />
            <KeyVal k="Road Type & Condition" v={mergedRoadType} />
            <KeyVal k="Best Time to Visit" v={mergedBestTimeFree} />
            {site.travel_full_guide_url && (
              <a
                href={site.travel_full_guide_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block px-3 py-2 rounded-lg bg-black text-white text-[15px]"
              >
                Open Full Travel Guide
              </a>
            )}
          </SidebarAccordionSection>

          <SidebarAccordionSection
            title="Best Time to Visit"
            iconName="best-time-to-visit"
            mobileDefaultOpen={true}
          >
            {mergedBestTimeLong ? (
              <div
                className="whitespace-pre-wrap text-[15px] overflow-x-visible"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                {mergedBestTimeLong}
              </div>
            ) : site.best_time_option_key ? (
              <div
                className="text-[15px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                {site.best_time_option_key}
              </div>
            ) : (
              <div
                className="text-[15px]"
                style={{ color: "var(--muted-foreground, #5b6b84)" }}
              >
                -
              </div>
            )}
          </SidebarAccordionSection>

          <SidebarAccordionSection
            title="Places to Stay"
            iconName="places-to-stay"
            mobileDefaultOpen={true}
          >
            <KeyVal k="Hotels Available" v={mergedHotelsAvailable} />
            <KeyVal
              k="Spending Night Recommended"
              v={mergedSpendingNight}
            />
            <KeyVal k="Camping Possible" v={mergedCamping} />
            <KeyVal k="Places to Eat Available" v={mergedPlacesToEat} />
          </SidebarAccordionSection>
        </>
      )}
    </div>

    {/* Location map sheet — only rendered when site has coordinates */}
    {site.latitude && site.longitude && (
      <LocationMapSheet
        site={{
          id: site.id,
          slug: site.slug,
          province_slug: (site as any).province_slug ?? null,
          title: site.title,
          latitude: Number(site.latitude),
          longitude: Number(site.longitude),
          cover_photo_url: (site as any).cover_photo_url ?? null,
          cover_photo_thumb_url: (site as any).cover_photo_thumb_url ?? null,
          location_free: site.location_free ?? null,
          heritage_type: site.heritage_type ?? null,
          avg_rating: (site as any).avg_rating ?? null,
          review_count: (site as any).review_count ?? null,
        }}
        isOpen={mapSheetOpen}
        onClose={() => setMapSheetOpen(false)}
      />
    )}
    </>
  );
}
