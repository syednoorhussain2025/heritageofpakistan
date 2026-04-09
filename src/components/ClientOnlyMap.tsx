// src/components/ClientOnlyMap.tsx
"use client";

import { useMemo, useCallback, useRef, useState, useEffect, memo } from "react";
import { createPortal } from "react-dom";

/* ------------------------ Leaflet / OSM (original path) ------------------------ */
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import MarkerClusterGroup from "react-leaflet-markercluster";

import Icon from "@/components/Icon";
import SitePreviewCard from "@/components/SitePreviewCard";

/* ------------------------ Google Maps (no custom tooltip) --------------------- */
import { GoogleMap, useJsApiLoader, InfoWindow } from "@react-google-maps/api";
import { MarkerClusterer, DefaultRenderer } from "@googlemaps/markerclusterer";

/* ──────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────────────────── */
export type Site = {
  id: string;
  title: string;
  slug: string;
  latitude: number;
  longitude: number;
  site_categories: { categories: { icon_key: string | null } | null }[];
  // Optional richer fields (present when passed from map page)
  cover_photo_url?: string | null;
  cover_photo_thumb_url?: string | null;
  cover_slideshow_image_ids?: string[] | null;
  location_free?: string | null;
  heritage_type?: string | null;
  avg_rating?: number | null;
  review_count?: number | null;
  province_slug?: string | null;
  tagline?: string | null;
};

type MapProvider = "osm" | "google";
/** Map type for the switcher: OSM, Google roadmap, or Google satellite */
export type MapType = "osm" | "google" | "google_satellite";

type MapSettings = {
  provider?: MapProvider;
  google_maps_api_key?: string | null;

  // OSM tile layer
  tile_layer_url?: string;
  tile_layer_attribution?: string;

  // View
  default_center_lat: number;
  default_center_lng: number;
  default_zoom: number;

  // Pins (both OSM & Google)
  icon_source?: "global" | "category";
  pin_style?: "icon_only" | "icon_in_circle";
  pin_icon_name?: string;
  pin_icon_size?: number;
  pin_color?: string;
  pin_circle_size?: number;
  pin_circle_color?: string;
  pin_icon_color_in_circle?: string;
  pin_border_thickness?: number;
  pin_border_color?: string;

  // Clustering
  cluster_color?: string; // Open Maps (OSM)
  cluster_color_google?: string; // Google Maps
  cluster_max_radius?: number;
  disable_clustering_at_zoom?: number;

  // Tooltip (OSM only)
  tooltip_background_color?: string;
  tooltip_text_color?: string;
  tooltip_border_color?: string;
  tooltip_border_radius?: number;
  tooltip_border_thickness?: number;
  tooltip_font_size?: number;
  tooltip_font_weight?: string;
  tooltip_font_family?: string;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * SHARED HELPERS (Leaflet CSS helpers preserved)
 * ────────────────────────────────────────────────────────────────────────────── */
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const lightenHex = (hex: string, amount: number): string => {
  const r = hexToRgb(hex);
  if (!r) return hex;
  const blend = (v: number) => Math.round(v + (255 - v) * amount);
  return `#${[r.r, r.g, r.b].map((v) => blend(v).toString(16).padStart(2, "0")).join("")}`;
};

const DynamicClusterStyles = ({ color }: { color: string }) => {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const hoverColor = lightenHex(color, 0.2);
  const hoverRgb = hexToRgb(hoverColor);
  const hoverOuterRgba = hoverRgb
    ? `rgba(${hoverRgb.r}, ${hoverRgb.g}, ${hoverRgb.b}, 0.35)`
    : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
  const style = `
    .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
      background-color: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2) !important;
      transition: background-color 0.15s ease-out !important;
    }
    .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
      background-color: ${color} !important;
      transition: background-color 0.15s ease-out !important;
    }
    .marker-cluster-small:hover, .marker-cluster-medium:hover, .marker-cluster-large:hover {
      background-color: ${hoverOuterRgba} !important;
      z-index: 1000 !important;
    }
    .marker-cluster-small:hover div, .marker-cluster-medium:hover div, .marker-cluster-large:hover div {
      background-color: ${hoverColor} !important;
    }
  `;
  return <style>{style}</style>;
};

const DynamicTooltipStyles = ({ settings }: { settings: MapSettings }) => {
  const bg = settings.tooltip_background_color ?? "#2d3748";
  const borderColor = settings.tooltip_border_color ?? "#4a5568";
  const style = `
    .leaflet-tooltip {
      background-color: ${settings.tooltip_background_color} !important;
      color: ${settings.tooltip_text_color} !important;
      border: ${settings.tooltip_border_thickness}px solid ${settings.tooltip_border_color} !important;
      border-radius: ${settings.tooltip_border_radius}px !important;
      font-family: ${settings.tooltip_font_family}, sans-serif !important;
      font-size: ${settings.tooltip_font_size}px !important;
      font-weight: ${settings.tooltip_font_weight} !important;
      padding: 6px 8px 10px 8px !important;
      white-space: nowrap !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
    }
    .leaflet-tooltip-bottom:before, .leaflet-tooltip-left:before, .leaflet-tooltip-right:before {
      border: none !important;
    }
    /* Pointer for tooltip above pin (direction="top") – triangle pointing down */
    .leaflet-tooltip-top:before {
      position: absolute !important;
      left: 50% !important;
      bottom: 0 !important;
      transform: translate(-50%, 100%) !important;
      width: 0 !important;
      height: 0 !important;
      border: 6px solid transparent !important;
      border-top-color: ${bg} !important;
      border-bottom: none !important;
      margin: 0 !important;
    }
  `;
  return <style>{style}</style>;
};

// **NEW**: Style component to make the OSM popup container transparent and set card size
const DynamicPopupStyles = () => {
  const style = `
    .leaflet-popup-content-wrapper {
      background: transparent !important;
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important; /* Let the inner component control padding */
      min-width: 300px !important;
      max-width: 320px !important;
    }
    .leaflet-popup-tip-container {
      display: none !important; /* Hide the popup tip/arrow */
    }
    .leaflet-popup-content {
      margin: 0 !important; /* Remove default margin */
      width: 100% !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
      border-radius: 1.25rem !important;
      overflow: hidden !important;
    }
    @media (max-width: 1023px) {
      .leaflet-popup-content-wrapper {
        min-width: 0 !important;
        max-width: min(178px, 63vw) !important;
        width: min(178px, 63vw) !important;
      }
      .map-preview-card-wrapper {
        min-width: 0 !important;
        max-width: min(178px, 63vw) !important;
        width: min(178px, 63vw) !important;
      }
    }
  `;
  return <style>{style}</style>;
};

/* Compare locations by id list so we don't re-render map when parent passes new array with same sites */
function locationsKey(locations: Site[]) {
  if (!locations?.length) return "";
  return locations.map((s) => s.id).join(",");
}

function radiusCircleKey(rc: { centerLat: number; centerLng: number; radiusKm: number } | null | undefined) {
  if (!rc) return "";
  return `${rc.centerLat},${rc.centerLng},${rc.radiusKm}`;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * MAIN SWITCHER
 * ────────────────────────────────────────────────────────────────────────────── */
function ClientOnlyMap({
  locations,
  settings,
  icons,
  highlightSiteId = null,
  onHighlightConsumed,
  onSiteSelect,
  /** Override from map type switcher: osm | google | google_satellite */
  mapType: mapTypeOverride,
  permanentTooltips = false,
  directMarkerSelect = false,
  siteDates = null,
  hoveredSiteId = null,
  resetMapViewTrigger = 0,
  fitFilteredTrigger = 0,
  openPreviewWithoutZoom = false,
  lockHighlightPopup = false,
  /** When true, map fits bounds to current locations (e.g. after applying "Search Around a Site"). */
  fitBoundsToLocations = false,
  /** When set, draw a light red circle on the map showing the search radius (e.g. "Search Around a Site"). */
  radiusCircle = null,
  /** When provided, "Places Nearby" on a card applies this site on the map and shows results instead of navigating to Explore. */
  onPlacesNearbyApply = null,
  /** When set, shows a blue dot at the user's location. */
  userLat = null,
  userLng = null,
  /** When set (object changes), the map flies to this location. */
  flyToTrigger = null,
}: {
  locations: Site[];
  settings: MapSettings | null;
  icons: Map<string, string>;
  /** When set, map flies to this site and opens its preview popup. Cleared via onHighlightConsumed. */
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  /** When true, opening the highlight popup only pans to the marker (no zoom). Used e.g. from saved list panel. */
  openPreviewWithoutZoom?: boolean;
  /** When true, the highlight popup cannot be closed by tapping the map or the X button. */
  lockHighlightPopup?: boolean;
  /** When provided, clicking a marker calls this instead of showing a popup. */
  onSiteSelect?: (site: Site) => void;
  mapType?: MapType;
  /** When true, tooltips are always visible (trip view). */
  permanentTooltips?: boolean;
  /** When true, clicking a marker calls onSiteSelect directly (no popup). */
  directMarkerSelect?: boolean;
  /** Optional map of site id → formatted date string for tooltips (e.g. trip view). */
  siteDates?: Map<string, string> | null;
  userLat?: number | null;
  userLng?: number | null;
  flyToTrigger?: { lat: number; lng: number } | null;
  /** When set (e.g. hover in trip panel), the matching map tooltip is highlighted (orange). */
  hoveredSiteId?: string | null;
  /** When this value changes and is > 0, the map flies back to default center/zoom (e.g. after closing the trip panel). */
  resetMapViewTrigger?: number;
  /** When this value increments, the map fits bounds to show all currently filtered pins (e.g. after applying search filters). */
  fitFilteredTrigger?: number;
  /** When true, map fits bounds to current locations (e.g. after applying "Search Around a Site"). */
  fitBoundsToLocations?: boolean;
  /** When set, draw a light red circle on the map showing the search radius (e.g. "Search Around a Site"). */
  radiusCircle?: { centerLat: number; centerLng: number; radiusKm: number } | null;
  /** When provided, "Places Nearby" on a card applies this site on the map and shows results instead of navigating to Explore. */
  onPlacesNearbyApply?: ((site: { id: string; title: string; latitude: number; longitude: number }) => void) | null;
}) {
  // Stabilize callbacks with refs so map/markers never re-render just
  // because the parent passed a new inline arrow function reference.
  const onSiteSelectRef = useRef(onSiteSelect);
  const onPlacesNearbyApplyRef = useRef(onPlacesNearbyApply);
  useEffect(() => { onPlacesNearbyApplyRef.current = onPlacesNearbyApply; }, [onPlacesNearbyApply]);
  useEffect(() => { onSiteSelectRef.current = onSiteSelect; }, [onSiteSelect]);
  const stableOnSiteSelect = useCallback((site: Site) => {
    onSiteSelectRef.current?.(site);
  }, []);
  const stableOnPlacesNearbyApply = useCallback((site: { id: string; title: string; latitude: number; longitude: number }) => {
    onPlacesNearbyApplyRef.current?.(site);
  }, []);

  const onHighlightConsumedRef = useRef(onHighlightConsumed);
  useEffect(() => { onHighlightConsumedRef.current = onHighlightConsumed; }, [onHighlightConsumed]);
  const stableOnHighlightConsumed = useCallback(() => {
    onHighlightConsumedRef.current?.();
  }, []);

  if (!settings || icons.size === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100">
        <Icon
          name="spinner"
          className="animate-spin text-[var(--brand-orange)]"
          size={48}
        />
        <p className="ml-4 text-lg text-gray-600">Loading map…</p>
      </div>
    );
  }

  const effectiveProvider: MapProvider =
    mapTypeOverride === "google" || mapTypeOverride === "google_satellite"
      ? "google"
      : mapTypeOverride === "osm"
        ? "osm"
        : (settings.provider ?? "osm");

  const googleMapTypeId: "roadmap" | "satellite" =
    mapTypeOverride === "google_satellite" ? "satellite" : "roadmap";

  if (effectiveProvider === "google") {
    return (
      <GoogleMapView
        locations={locations}
        settings={settings}
        icons={icons}
        highlightSiteId={highlightSiteId}
        onHighlightConsumed={stableOnHighlightConsumed}
        onSiteSelect={stableOnSiteSelect}
        mapTypeId={googleMapTypeId}
        directMarkerSelect={directMarkerSelect}
        fitMapToLocations={permanentTooltips || fitBoundsToLocations}
        fitFilteredTrigger={fitFilteredTrigger}
        siteDates={siteDates}
        hoveredSiteId={hoveredSiteId}
        resetMapViewTrigger={resetMapViewTrigger}
        radiusCircle={radiusCircle}
        onPlacesNearbyApply={stableOnPlacesNearbyApply}
        userLat={userLat}
        userLng={userLng}
        flyToTrigger={flyToTrigger}
      />
    );
  }

  return (
    <>
      <OSMLeafletView
        locations={locations}
        settings={settings}
        icons={icons}
        highlightSiteId={highlightSiteId}
        onHighlightConsumed={stableOnHighlightConsumed}
        onSiteSelect={stableOnSiteSelect}
        permanentTooltips={permanentTooltips}
        directMarkerSelect={directMarkerSelect}
        siteDates={siteDates}
        resetMapViewTrigger={resetMapViewTrigger}
        fitFilteredTrigger={fitFilteredTrigger}
        openPreviewWithoutZoom={openPreviewWithoutZoom}
        lockHighlightPopup={lockHighlightPopup}
        fitBoundsToLocations={fitBoundsToLocations}
        radiusCircle={radiusCircle}
        onPlacesNearbyApply={stableOnPlacesNearbyApply}
        userLat={userLat}
        userLng={userLng}
        flyToTrigger={flyToTrigger}
      />
      {permanentTooltips && <TripViewHoverStyles hoveredSiteId={hoveredSiteId} />}
    </>
  );
}

const ClientOnlyMapMemo = memo(ClientOnlyMap, (prev, next) => {
  if (prev.settings !== next.settings || prev.icons !== next.icons) return false;
  if (prev.highlightSiteId !== next.highlightSiteId) return false;
  if (prev.mapType !== next.mapType) return false;
  if (prev.permanentTooltips !== next.permanentTooltips) return false;
  if (prev.directMarkerSelect !== next.directMarkerSelect) return false;
  if (prev.resetMapViewTrigger !== next.resetMapViewTrigger) return false;
  if (prev.fitFilteredTrigger !== next.fitFilteredTrigger) return false;
  if (prev.openPreviewWithoutZoom !== next.openPreviewWithoutZoom) return false;
  if (prev.fitBoundsToLocations !== next.fitBoundsToLocations) return false;
  if (prev.hoveredSiteId !== next.hoveredSiteId) return false;
  if (locationsKey(prev.locations) !== locationsKey(next.locations)) return false;
  if (radiusCircleKey(prev.radiusCircle) !== radiusCircleKey(next.radiusCircle)) return false;
  if (prev.siteDates !== next.siteDates) return false;
  if (prev.userLat !== next.userLat || prev.userLng !== next.userLng) return false;
  if (prev.flyToTrigger !== next.flyToTrigger) return false;
  return true;
});

export default ClientOnlyMapMemo;

/* Hover highlight for trip pins and tooltips. Only this component receives hoveredSiteId so the map and tooltip layer never re-render on hover (stops flicker). */
function TripViewHoverStyles({ hoveredSiteId }: { hoveredSiteId: string | null }) {
  const escaped = hoveredSiteId
    ? String(hoveredSiteId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    : "";
  return (
    <style>{`
      .hop-pin-marker[data-site-id="${escaped}"] .hop-pin-inner {
        background-color: var(--brand-orange) !important;
        color: var(--brand-orange) !important;
      }
      .hop-tooltip[data-site-id="${escaped}"] .hop-tooltip-inner {
        background: var(--brand-orange) !important;
      }
      .hop-tooltip[data-site-id="${escaped}"] .hop-tooltip-arrow {
        border-top-color: var(--brand-orange) !important;
      }
    `}</style>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * TRIP VIEW TOOLTIP LAYER
 * Renders fully-custom React tooltip labels over the map using a portal +
 * lat/lng → pixel projection.  Replaces Leaflet's permanent tooltip entirely
 * so we have full control over styling.
 * ────────────────────────────────────────────────────────────────────────────── */
function TripViewTooltipLayer({
  locations,
  iconSizes,
  siteDates,
}: {
  locations: Site[];
  iconSizes: Map<string, number>;
  siteDates?: Map<string, string> | null;
}) {
  const map = useMap();
  const tooltipRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  /** Tracks site ids we've already run setPosition for. React 18 can call ref(null) then ref(el) on re-render; we must not re-run setPosition then or all tooltips flicker. */
  const positionSetFor = useRef<Set<string>>(new Set());
  const locationIdsKey = locations.map((s) => s.id).join(",");
  useEffect(() => {
    positionSetFor.current.clear();
  }, [locationIdsKey]);

  const setPositions = useCallback((
    getPoint: (latlng: L.LatLngExpression) => L.Point
  ) => {
    locations.forEach((site) => {
      const el = tooltipRefs.current.get(site.id);
      if (!el) return;
      const iconSize = iconSizes.get(site.id) ?? 38;
      const point = getPoint([site.latitude, site.longitude]);
      const tipBottom = iconSize / 2 + 6;
      L.DomUtil.setPosition(el, L.point(point.x, point.y - tipBottom));
    });
  }, [locations, iconSizes]);

  // Normal pan/zoom-end update — uses current view state
  const updatePositions = useCallback(() => {
    setPositions((latlng) => map.latLngToLayerPoint(latlng));
  }, [map, setPositions]);

  // Zoom animation update — mirrors exactly what Leaflet does in Marker._animateZoom
  // and Tooltip._animateZoom: uses _latLngToNewLayerPoint with the target zoom/center
  // so the element pre-positions itself to where it will be after the animation.
  const animateZoom = useCallback((e: L.LeafletEvent) => {
    const ze = e as L.ZoomAnimEvent;
    setPositions((latlng) =>
      (map as any)._latLngToNewLayerPoint(latlng, ze.zoom, ze.center)
    );
  }, [map, setPositions]);

  useEffect(() => {
    updatePositions();
    map.on("move zoomend viewreset", updatePositions);
    map.on("zoomanim", animateZoom);
    return () => {
      map.off("move zoomend viewreset", updatePositions);
      map.off("zoomanim", animateZoom);
    };
  }, [map, updatePositions, animateZoom]);

  // Portal into Leaflet's tooltipPane — it has the leaflet-zoom-animated class
  // so it receives the same CSS transform as markerPane during zoom animations.
  const tooltipPane = map.getPanes().tooltipPane;

  return createPortal(
    <>
      {locations.map((site) => {
        return (
          // Outer div: ref target — L.DomUtil.setPosition writes
          // "transform: translate3d(x,y,0)" here, matching exactly how
          // Leaflet positions its own markers/tooltips.
          <div
            key={site.id}
            className="hop-tooltip"
            data-site-id={site.id}
            ref={(el) => {
              if (el) {
                tooltipRefs.current.set(site.id, el);
                // Only set position once per site.id. React 18 calls ref(null) then ref(el) on re-render, so "has(site.id)" would be false after null; use a separate set so we don't re-run setPosition and flicker all tooltips.
                if (!positionSetFor.current.has(site.id)) {
                  positionSetFor.current.add(site.id);
                  const iconSize = iconSizes.get(site.id) ?? 38;
                  const point = map.latLngToLayerPoint([site.latitude, site.longitude]);
                  const tipBottom = iconSize / 2 + 6;
                  L.DomUtil.setPosition(el, L.point(point.x, point.y - tipBottom));
                }
              } else {
                tooltipRefs.current.delete(site.id);
              }
            }}
            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
          >
            {/* Inner div: default black; hover highlight is applied via CSS from TripViewHoverStyles so this layer never re-renders on hover. */}
            <div
              className="hop-tooltip-inner"
              style={{
                transform: "translate(-50%, -100%)",
                background: "#000000",
                color: "#fff",
                padding: "3px 10px",
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                position: "relative",
                transition: "background 0.15s ease",
              }}
            >
              <span>{site.title}</span>
              {siteDates?.get(site.id) && (
                <div style={{ fontSize: "10px", fontWeight: 500, opacity: 0.9, marginTop: 2 }}>
                  {siteDates.get(site.id)}
                </div>
              )}
              <div
                className="hop-tooltip-arrow"
                style={{
                  position: "absolute",
                  bottom: -5,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "5px solid #000000",
                }}
              />
            </div>
          </div>
        );
      })}
    </>,
    tooltipPane
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * OSM / Leaflet view (unchanged)
 * ────────────────────────────────────────────────────────────────────────────── */
/* When in trip view or nearby search, fit map bounds to show all pins and optionally the full radius circle */
function FitMapToLocations({
  locations,
  active,
  radiusCircle = null,
}: {
  locations: Site[];
  active: boolean;
  radiusCircle?: { centerLat: number; centerLng: number; radiusKm: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    const bounds = L.latLngBounds([] as L.LatLngTuple[]);
    const valid = locations.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    valid.forEach((s) => bounds.extend([s.latitude, s.longitude]));
    if (radiusCircle && Number.isFinite(radiusCircle.radiusKm) && radiusCircle.radiusKm > 0) {
      const { centerLat, centerLng, radiusKm } = radiusCircle;
      const degLat = radiusKm / 111;
      const degLng = radiusKm / (111 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
      bounds.extend([centerLat - degLat, centerLng - degLng]);
      bounds.extend([centerLat + degLat, centerLng + degLng]);
    }
    if (bounds.isValid() && (valid.length > 0 || radiusCircle)) {
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14, duration: 0.4 });
    }
  }, [map, active, locations, radiusCircle?.centerLat, radiusCircle?.centerLng, radiusCircle?.radiusKm]);
  return null;
}

/* When fitFilteredTrigger increments (user applied search filters), fly map to fit all visible pins */
function FitFilteredEffect({
  trigger,
  locations,
}: {
  trigger: number;
  locations: Site[];
}) {
  const map = useMap();
  useEffect(() => {
    if (trigger <= 0) return;
    const valid = locations.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid.map((s) => [s.latitude, s.longitude] as L.LatLngTuple));
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14, duration: 0.5 });
    }
  }, [map, trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* Fly the map to a given lat/lng whenever flyToTrigger object reference changes (e.g. Near Me button pressed). */
function FlyToEffect({ trigger }: { trigger: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!trigger || !Number.isFinite(trigger.lat) || !Number.isFinite(trigger.lng)) return;
    map.flyTo([trigger.lat, trigger.lng], 14, { duration: 0.8 });
  }, [map, trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* When resetMapViewTrigger increments (e.g. trip panel closed), fly map back to default center/zoom */
function ResetMapViewEffect({
  trigger,
  centerLat,
  centerLng,
  zoom,
}: {
  trigger: number;
  centerLat: number;
  centerLng: number;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0 && Number.isFinite(centerLat) && Number.isFinite(centerLng) && Number.isFinite(zoom)) {
      map.flyTo([centerLat, centerLng], zoom, { duration: 0.5 });
    }
  }, [map, trigger, centerLat, centerLng, zoom]);
  return null;
}

/* Fly to (or pan to) and show popup when parent sets highlightSiteId */
/* When lockHighlightPopup=true, hide the tooltip of whichever marker has its popup open */
function PopupTooltipHideEffect() {
  const map = useMap();
  useEffect(() => {
    const onOpen = (e: L.LeafletEvent) => {
      const marker = (e as any).popup?._source as L.Marker | undefined;
      if (!marker) return;
      const tooltip = (marker as any)._tooltip as L.Tooltip | undefined;
      if (!tooltip) return;
      const el = tooltip.getElement();
      if (el) el.classList.add("hop-tooltip-hidden");
    };
    const onClose = (e: L.LeafletEvent) => {
      const marker = (e as any).popup?._source as L.Marker | undefined;
      if (!marker) return;
      const tooltip = (marker as any)._tooltip as L.Tooltip | undefined;
      if (!tooltip) return;
      const el = tooltip.getElement();
      if (!el) return;
      setTimeout(() => el.classList.remove("hop-tooltip-hidden"), 420);
    };
    map.on("popupopen", onOpen);
    map.on("popupclose", onClose);
    return () => {
      map.off("popupopen", onOpen);
      map.off("popupclose", onClose);
    };
  }, [map]);
  return null;
}

/* When lockHighlightPopup=true, prevent any map click from closing the highlight popup */
function HighlightPopupLockEffect({ popupRef }: { popupRef: React.MutableRefObject<L.Popup | null> }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      // Reopen on next frame if map click would have closed it
      requestAnimationFrame(() => {
        const popup = popupRef.current;
        if (popup && !map.hasLayer(popup)) {
          popup.openOn(map);
        }
      });
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map, popupRef]);
  return null;
}

function OSMHighlightEffect({
  locations,
  highlightSiteId,
  onHighlightConsumed,
  onSiteSelect,
  openPreviewWithoutZoom = false,
  lockHighlightPopup = false,
  onPlacesNearbyApply = null,
}: {
  locations: Site[];
  highlightSiteId: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
  /** When true, skip all map movement and open the popup in place. */
  openPreviewWithoutZoom?: boolean;
  /** When true, the popup cannot be dismissed by clicking the map or the close button. */
  lockHighlightPopup?: boolean;
  onPlacesNearbyApply?: ((site: { id: string; title: string; latitude: number; longitude: number }) => void) | null;
}) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);
  const site = highlightSiteId
    ? locations.find((s) => s.id === highlightSiteId)
    : null;

  useEffect(() => {
    if (!site) return;
    if (openPreviewWithoutZoom) {
      // Map is already centered — just open the popup with no movement
      requestAnimationFrame(() => {
        popupRef.current?.openOn(map);
      });
    } else {
      map.flyTo([site.latitude, site.longitude], 14, { duration: 0.5 });
    }
  }, [map, site?.id, site?.latitude, site?.longitude, openPreviewWithoutZoom]);

  if (!site) return null;
  return (
    <>
      {lockHighlightPopup && <HighlightPopupLockEffect popupRef={popupRef} />}
      <Popup
        ref={popupRef}
        position={[site.latitude, site.longitude]}
        autoPan={false}
        keepInView={false}
        autoClose={lockHighlightPopup ? false : undefined}
        closeOnClick={lockHighlightPopup ? false : undefined}
        closeButton={!lockHighlightPopup}
        eventHandlers={lockHighlightPopup ? {} : {
          remove: () => onHighlightConsumed?.(),
        }}
      >
      <SitePreviewCard
        site={site}
        onCardClick={onSiteSelect ? () => onSiteSelect(site) : undefined}
        onPlacesNearby={onPlacesNearbyApply ?? undefined}
        hideActions
      />
      </Popup>
    </>
  );
}

const OSMLeafletView = memo(function OSMLeafletView({
  locations,
  settings,
  icons,
  highlightSiteId = null,
  onHighlightConsumed,
  onSiteSelect,
  permanentTooltips = false,
  directMarkerSelect = false,
  siteDates = null,
  resetMapViewTrigger = 0,
  fitFilteredTrigger = 0,
  openPreviewWithoutZoom = false,
  lockHighlightPopup = false,
  fitBoundsToLocations = false,
  radiusCircle = null,
  onPlacesNearbyApply = null,
  userLat = null,
  userLng = null,
  flyToTrigger = null,
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
  permanentTooltips?: boolean;
  directMarkerSelect?: boolean;
  siteDates?: Map<string, string> | null;
  resetMapViewTrigger?: number;
  fitFilteredTrigger?: number;
  openPreviewWithoutZoom?: boolean;
  /** When true, the highlight popup cannot be closed by clicking the map or the X button. */
  lockHighlightPopup?: boolean;
  /** When true, map fits bounds to current locations (e.g. after "Search Around a Site"). */
  fitBoundsToLocations?: boolean;
  /** When set, draw a light red circle showing the search radius. */
  radiusCircle?: { centerLat: number; centerLng: number; radiusKm: number } | null;
  onPlacesNearbyApply?: ((site: { id: string; title: string; latitude: number; longitude: number }) => void) | null;
  userLat?: number | null;
  userLng?: number | null;
  flyToTrigger?: { lat: number; lng: number } | null;
}) {
  const createCustomIcon = useCallback(
    (
      iconName: string,
      s: MapSettings,
      options?: {
        colorOverride?: { pin_color?: string; pin_circle_color?: string };
        /** When set (trip view), add data-site-id so we can highlight the pin via CSS without changing the icon. */
        dataSiteId?: string;
      }
    ) => {
      const {
        pin_style = "icon_only",
        pin_icon_size = 38,
        pin_color = "var(--brand-orange)",
        pin_circle_size = 48,
        pin_circle_color = "var(--brand-orange)",
        pin_icon_color_in_circle = "#ffffff",
        pin_border_thickness = 0,
        pin_border_color = "transparent",
      } = s;

      const effectivePinColor = options?.colorOverride?.pin_color ?? pin_color;
      const effectiveCircleColor = options?.colorOverride?.pin_circle_color ?? pin_circle_color;

      const svgContent = icons.get(iconName);
      if (!svgContent) return { icon: null as L.DivIcon | null, size: 0 };

      let innerHtml = "";
      let finalIconSize = pin_icon_size;

      if (pin_style === "icon_in_circle") {
        finalIconSize =
          pin_circle_size +
          (pin_border_thickness > 0 ? pin_border_thickness * 2 : 0);
        const wrapperStyles = [
          `width: ${pin_circle_size}px`,
          `height: ${pin_circle_size}px`,
          `background-color: ${effectiveCircleColor}`,
          "border-radius: 50%",
          "display: flex",
          "align-items: center",
          "justify-content: center",
          "box-shadow: 0 2px 5px rgba(0,0,0,0.2)",
          `border: ${pin_border_thickness}px solid ${pin_border_color}`,
        ];
        const innerIconHtml = `<div style="font-size: ${pin_icon_size}px; color: ${pin_icon_color_in_circle};">${svgContent}</div>`;
        innerHtml = `<div class="marker-hover-target hop-pin-inner" style="${wrapperStyles.join(
          ";"
        )}">${innerIconHtml}</div>`;
      } else {
        innerHtml = `<div class="marker-hover-target hop-pin-inner" style="font-size: ${pin_icon_size}px; color: ${effectivePinColor};">${svgContent}</div>`;
        finalIconSize = pin_icon_size;
      }

      const iconHtml = options?.dataSiteId
        ? `<div class="hop-pin-marker" data-site-id="${String(options.dataSiteId).replace(/"/g, "&quot;")}">${innerHtml}</div>`
        : innerHtml;

      const icon = L.divIcon({
        html: iconHtml,
        className: "custom-map-icon",
        iconSize: [finalIconSize, finalIconSize],
        iconAnchor: [finalIconSize / 2, finalIconSize / 2],
        popupAnchor: [0, -(finalIconSize / 2)],
      });
      return { icon, size: finalIconSize };
    },
    [icons]
  );

  const memoizedIcons = useMemo(() => {
    if (icons.size === 0 || !settings) return new Map();
    const cache = new Map<string, { icon: L.DivIcon | null; size: number }>();

    const globalIconName = settings.pin_icon_name || "map-pin";
    const globalIcon = createCustomIcon(globalIconName, settings);
    if (globalIcon.icon) cache.set(globalIconName, globalIcon);

    if (settings.icon_source === "category") {
      locations.forEach((site) => {
        const categoryIconName = site.site_categories?.find(
          (sc) => sc.categories?.icon_key
        )?.categories?.icon_key;
        if (categoryIconName && !cache.has(categoryIconName)) {
          const newIcon = createCustomIcon(categoryIconName, settings);
          if (newIcon.icon) cache.set(categoryIconName, newIcon);
        }
      });
    }
    return cache;
  }, [settings, locations, createCustomIcon, icons]);

  /** In trip view, one icon per site with data-site-id so we can highlight via CSS without changing the icon (avoids cluster flicker). */
  const tripViewIcons = useMemo(() => {
    if (!permanentTooltips || !settings) return new Map<string, { icon: L.DivIcon; size: number }>();
    const cache = new Map<string, { icon: L.DivIcon; size: number }>();
    const globalIconName = settings.pin_icon_name || "map-pin";
    locations.forEach((site) => {
      let iconName = globalIconName;
      if (settings.icon_source === "category") {
        const cat = site.site_categories?.find((sc) => sc.categories?.icon_key)?.categories?.icon_key;
        if (cat) iconName = cat;
      }
      const data = createCustomIcon(iconName, settings, { dataSiteId: site.id });
      if (data.icon) cache.set(site.id, { icon: data.icon, size: data.size });
    });
    return cache;
  }, [permanentTooltips, settings, locations, createCustomIcon]);

  // Map from site.id → icon pixel size, used by TripViewTooltipLayer for offset.
  const siteIconSizes = useMemo(() => {
    const m = new Map<string, number>();
    locations.forEach((site) => {
      let iconName = settings.pin_icon_name || "map-pin";
      if (settings.icon_source === "category") {
        const cat = site.site_categories?.find(
          (sc) => sc.categories?.icon_key
        )?.categories?.icon_key;
        if (cat) iconName = cat;
      }
      const iconData = memoizedIcons.get(iconName);
      if (iconData) m.set(site.id, iconData.size);
    });
    return m;
  }, [locations, settings, memoizedIcons]);

  // Keep popup open after clicking a card. When the card click triggers a
  // state update in the parent, the Leaflet popup closes. We detect this via
  // the marker's popupclose event and reopen the popup immediately.
  const pendingPopupId = useRef<string | null>(null);

  // Memoize marker children so that when only highlightSiteId/openPreviewWithoutZoom change
  // (e.g. open/close saved list preview), we don't re-create markers and cause cluster flicker.
  const markerChildren = useMemo(() => {
    return locations.map((site) => {
      let iconName = settings.pin_icon_name || "map-pin";
      if (settings.icon_source === "category") {
        const categoryIconName = site.site_categories?.find(
          (sc) => sc.categories?.icon_key
        )?.categories?.icon_key;
        if (categoryIconName) iconName = categoryIconName;
      }
      const normalIconData = memoizedIcons.get(iconName);
      const tripIconData = tripViewIcons.get(site.id);
      const iconData = permanentTooltips && tripIconData ? tripIconData : normalIconData;
      if (!iconData || !iconData.icon) return null;

      return (
        <Marker
          key={`${site.id}-${permanentTooltips}`}
          position={[site.latitude, site.longitude]}
          icon={iconData.icon}
          eventHandlers={directMarkerSelect ? {
            click: () => onSiteSelect?.(site),
          } : {
            popupclose: (e) => {
              if (pendingPopupId.current === site.id) {
                pendingPopupId.current = null;
                setTimeout(() => (e.target as L.Marker).openPopup(), 0);
              }
            },
          }}
        >
          {/* In trip view, tooltips are rendered by TripViewTooltipLayer, not Leaflet */}
          {/* Skip tooltip for the highlighted site — its popup is always open */}
          {!permanentTooltips && site.id !== highlightSiteId && (
            <Tooltip
              direction="top"
              offset={[0, -(iconData.size / 2 + 6)]}
              permanent={lockHighlightPopup}
            >
              <span>{site.title}</span>
            </Tooltip>
          )}
          {!directMarkerSelect && site.id !== highlightSiteId && (
            <Popup>
              <SitePreviewCard
                site={site}
                onCardClick={onSiteSelect ? () => {
                  pendingPopupId.current = site.id;
                  onSiteSelect(site);
                  setTimeout(() => { pendingPopupId.current = null; }, 300);
                } : undefined}
                onPlacesNearby={onPlacesNearbyApply ?? undefined}
                hideActions
              />
            </Popup>
          )}
        </Marker>
      );
    });
  }, [
    locations,
    settings.pin_icon_name,
    settings.icon_source,
    memoizedIcons,
    tripViewIcons,
    permanentTooltips,
    lockHighlightPopup,
    highlightSiteId,
    directMarkerSelect,
    onSiteSelect,
    onPlacesNearbyApply,
  ]);

  return (
    <div className="relative w-full h-full">
      {settings.cluster_color && (
        <DynamicClusterStyles color={settings.cluster_color} />
      )}
      {/* Pin/tooltip hover highlight is applied by TripViewHoverStyles outside this view so this view never re-renders on hover. */}
      {/* Only apply the default tooltip styles when not in trip view */}
      {!permanentTooltips && <DynamicTooltipStyles settings={settings} />}
      {/* **NEW**: Added the popup style component here */}
      <DynamicPopupStyles />

      <MapContainer
        center={[settings.default_center_lat, settings.default_center_lng]}
        zoom={settings.default_zoom}
        scrollWheelZoom={true}
        zoomControl={false}
        zoomSnap={0}
        maxZoom={21}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution={
            settings.tile_layer_attribution ||
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={
            settings.tile_layer_url ||
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          maxZoom={21}
          maxNativeZoom={19}
        />
        {/* Light red radius circle when "Search Around a Site" is active */}
        {radiusCircle && (
          <>
            <style>{`.radius-circle-label.leaflet-marker-icon { border: none !important; background: transparent !important; }`}</style>
            <Circle
              center={[radiusCircle.centerLat, radiusCircle.centerLng]}
              radius={radiusCircle.radiusKm * 1000}
              pathOptions={{
                color: "#dc2626",
                fillColor: "#fca5a5",
                fillOpacity: 0.18,
                weight: 2,
                dashArray: "8, 6",
              }}
            />
            <Marker
              position={[
                radiusCircle.centerLat + radiusCircle.radiusKm / 111,
                radiusCircle.centerLng,
              ]}
              icon={L.divIcon({
                className: "radius-circle-label",
                html: `<span style="
                  display: inline-block;
                  padding: 2px 6px;
                  background: rgba(255,255,255,0.95);
                  border: 1px solid #dc2626;
                  border-radius: 4px;
                  font-size: 11px;
                  font-weight: 600;
                  color: #991b1b;
                  white-space: nowrap;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
                ">${radiusCircle.radiusKm} km</span>`,
                iconSize: [40, 20],
                iconAnchor: [20, 10],
              })}
              zIndexOffset={0}
            />
          </>
        )}
        {/* Fit map to pins when in trip view or when "Search Around a Site" is applied (include full circle when radiusCircle set) */}
        {(permanentTooltips || fitBoundsToLocations) && (
          <FitMapToLocations
            locations={locations}
            active={permanentTooltips || fitBoundsToLocations}
            radiusCircle={radiusCircle}
          />
        )}
        <FitFilteredEffect trigger={fitFilteredTrigger} locations={locations} />
        <ResetMapViewEffect
          trigger={resetMapViewTrigger}
          centerLat={settings.default_center_lat}
          centerLng={settings.default_center_lng}
          zoom={settings.default_zoom}
        />
        {/* Custom React tooltip layer for trip view — replaces Leaflet tooltips */}
        {permanentTooltips && (
          <TripViewTooltipLayer locations={locations} iconSizes={siteIconSizes} siteDates={siteDates} />
        )}
        {lockHighlightPopup && <PopupTooltipHideEffect />}
        <OSMHighlightEffect
          locations={locations}
          highlightSiteId={highlightSiteId ?? null}
          onHighlightConsumed={onHighlightConsumed}
          onSiteSelect={onSiteSelect}
          openPreviewWithoutZoom={openPreviewWithoutZoom}
          lockHighlightPopup={lockHighlightPopup}
          onPlacesNearbyApply={onPlacesNearbyApply}
        />
        {lockHighlightPopup ? (
          <>{markerChildren}</>
        ) : (
          <MarkerClusterGroup
            disableClusteringAtZoom={settings.disable_clustering_at_zoom}
            maxClusterRadius={settings.cluster_max_radius}
          >
            {markerChildren}
          </MarkerClusterGroup>
        )}
        {/* User location blue dot with pulse rings */}
        {userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng) && (
          <>
            <style>{`
              @keyframes hopUserPulse {
                0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.55; }
                100% { transform: translate(-50%,-50%) scale(3.8); opacity: 0; }
              }
              .hop-user-ring {
                position: absolute; top: 50%; left: 50%;
                width: 18px; height: 18px;
                border-radius: 50%;
                border: 1.5px solid #1d4ed8;
                animation: hopUserPulse 2.4s ease-out infinite;
                pointer-events: none;
              }
              .hop-user-ring:nth-child(2) { animation-delay: 0.4s; }
              .hop-user-ring:nth-child(3) { animation-delay: 0.8s; }
            `}</style>
            <Marker
              position={[userLat, userLng]}
              zIndexOffset={2000}
              icon={L.divIcon({
                className: "",
                html: `<div style="position:relative;width:18px;height:18px;">
                  <div class="hop-user-ring"></div>
                  <div class="hop-user-ring"></div>
                  <div class="hop-user-ring"></div>
                  <div style="
                    position:absolute;top:0;left:0;
                    width:18px;height:18px;border-radius:50%;
                    background:#1d4ed8;
                    border:2.5px solid #fff;
                    box-shadow:0 1px 5px rgba(0,0,0,0.3);
                  "></div>
                </div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            >
              <Tooltip direction="top" offset={[0, -14]} permanent={false}>Your location</Tooltip>
            </Marker>
          </>
        )}
        <FlyToEffect trigger={flyToTrigger ?? null} />
      </MapContainer>
    </div>
  );
});

/* ──────────────────────────────────────────────────────────────────────────────
 * Google Maps view — Transparent InfoWindow
 * ────────────────────────────────────────────────────────────────────────────── */
function GoogleMapView({
  locations,
  settings,
  icons,
  highlightSiteId = null,
  onHighlightConsumed,
  onSiteSelect,
  mapTypeId = "roadmap",
  directMarkerSelect = false,
  fitMapToLocations = false,
  fitFilteredTrigger = 0,
  siteDates = null,
  hoveredSiteId = null,
  resetMapViewTrigger = 0,
  radiusCircle = null,
  onPlacesNearbyApply = null,
  userLat = null,
  userLng = null,
  flyToTrigger = null,
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
  mapTypeId?: "roadmap" | "satellite";
  directMarkerSelect?: boolean;
  fitMapToLocations?: boolean;
  fitFilteredTrigger?: number;
  siteDates?: Map<string, string> | null;
  hoveredSiteId?: string | null;
  resetMapViewTrigger?: number;
  /** When set, draw a light red circle showing the search radius. */
  radiusCircle?: { centerLat: number; centerLng: number; radiusKm: number } | null;
  onPlacesNearbyApply?: ((site: { id: string; title: string; latitude: number; longitude: number }) => void) | null;
  userLat?: number | null;
  userLng?: number | null;
  flyToTrigger?: { lat: number; lng: number } | null;
}) {
  const apiKey = (settings.google_maps_api_key || "").trim();
  /* Call useJsApiLoader unconditionally (before any early return) to satisfy Rules of Hooks */
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || "invalid-no-key",
    language: "en",
    region: "US",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const tooltipWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const radiusCircleStrokeRef = useRef<google.maps.Polyline | null>(null);
  const radiusCircleLabelRef = useRef<google.maps.Marker | null>(null);
  const userDotMarkerRef = useRef<google.maps.Marker | null>(null);
  const containerStyle = { width: "100%", height: "100%" };

  const onSiteSelectRef = useRef(onSiteSelect);
  const onHighlightConsumedRef = useRef(onHighlightConsumed);
  const directMarkerSelectRef = useRef(directMarkerSelect);
  useEffect(() => {
    onSiteSelectRef.current = onSiteSelect;
    onHighlightConsumedRef.current = onHighlightConsumed;
    directMarkerSelectRef.current = directMarkerSelect;
  }, [onSiteSelect, onHighlightConsumed, directMarkerSelect]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoWindowSite, setInfoWindowSite] = useState<Site | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const highlightSite = highlightSiteId
    ? locations.find((s) => s.id === highlightSiteId) ?? null
    : null;
  useEffect(() => {
    if (!highlightSite || !mapRef.current) return;
    const map = mapRef.current;
    map.panTo({ lat: highlightSite.latitude, lng: highlightSite.longitude });
    map.setZoom(14);
    if (directMarkerSelectRef.current) {
      onSiteSelectRef.current?.(highlightSite);
      onHighlightConsumedRef.current?.();
    } else {
      setActiveId(highlightSite.id);
      setInfoWindowSite(highlightSite);
    }
  }, [highlightSite?.id]);

  const [initialCenter] = useState({
    lat: settings.default_center_lat,
    lng: settings.default_center_lng,
  });
  const [initialZoom] = useState(settings.default_zoom);

  useEffect(() => {
    if (!activeId && infoWindowSite) {
      const timer = setTimeout(() => {
        setInfoWindowSite(null);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [activeId, infoWindowSite]);

  /* ---------- Icon/marker helpers (must be before useCallback; no hooks below until after early returns) ---------- */
  const encodeSvg = (svg: string) =>
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  const ensureRootSvg = (raw: string) => {
    const s = raw.trim();
    if (/^<svg[\s>]/i.test(s)) return s;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${s}</svg>`;
  };

  const normalizeSvg = (raw: string, size: number, color: string) => {
    let svg = ensureRootSvg(raw);
    svg = svg.replace(/<svg([^>]*)>/i, (_m, attrs) => {
      const cleaned = String(attrs).replace(/\s(width|height)="[^"]*"/gi, "");
      return `<svg${cleaned} width="${size}" height="${size}" style="color:${color}">`;
    });
    svg = svg.replace(
      /fill="(?!none|currentColor)[^"]*"/gi,
      'fill="currentColor"'
    );
    svg = svg.replace(
      /stroke="(?!none|currentColor)[^"]*"/gi,
      'stroke="currentColor"'
    );
    return svg;
  };

  const buildCircleWrappedSvg = (
    innerRaw: string,
    iconSize: number,
    circleSize: number,
    circleFill: string,
    borderColor: string,
    borderThickness: number,
    iconColor: string
  ) => {
    const half = circleSize / 2;
    const x = half - iconSize / 2;
    const y = half - iconSize / 2;
    const inner = normalizeSvg(innerRaw, iconSize, iconColor).replace(
      "<svg",
      `<svg x="${x}" y="${y}"`
    );
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${circleSize}" height="${circleSize}" viewBox="0 0 ${circleSize} ${circleSize}">
        <circle cx="${half}" cy="${half}" r="${
      half - borderThickness
    }" fill="${circleFill}" stroke="${borderColor}" stroke-width="${borderThickness}" />
        ${inner}
      </svg>`;
  };

  const iconForSite = useCallback(
    (site: Site): google.maps.Icon | undefined => {
      let iconName = settings.pin_icon_name || "map-pin";
      if (settings.icon_source === "category") {
        const catIcon = site.site_categories?.find(
          (sc) => sc.categories?.icon_key
        )?.categories?.icon_key;
        if (catIcon) iconName = catIcon;
      }
      const rawSvg = icons.get(iconName);
      if (!rawSvg) return undefined;

      if (settings.pin_style === "icon_in_circle") {
        const circleSize = Math.max(8, settings.pin_circle_size ?? 48);
        const borderThickness = Math.max(0, settings.pin_border_thickness ?? 0);
        const iconSize = Math.max(8, settings.pin_icon_size ?? 38);
        const finalSvg = buildCircleWrappedSvg(
          rawSvg,
          iconSize,
          circleSize + borderThickness * 2,
          settings.pin_circle_color ?? "var(--brand-orange)",
          settings.pin_border_color ?? "transparent",
          borderThickness,
          settings.pin_icon_color_in_circle ?? "#ffffff"
        );
        const size = circleSize + borderThickness * 2;
        return {
          url: encodeSvg(finalSvg),
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(size / 2, size / 2),
        };
      }

      const iconSize = Math.max(8, settings.pin_icon_size ?? 38);
      const normalized = normalizeSvg(
        rawSvg,
        iconSize,
        settings.pin_color ?? "var(--brand-orange)"
      );
      return {
        url: encodeSvg(normalized),
        scaledSize: new google.maps.Size(iconSize, iconSize),
        anchor: new google.maps.Point(iconSize / 2, iconSize / 2),
      };
    },
    [settings, icons]
  );

  const getTooltipContent = useCallback(
    (title: string, date?: string | null): string => {
      const bg = settings.tooltip_background_color ?? "#2d3748";
      const color = settings.tooltip_text_color ?? "#ffffff";
      const borderColor = settings.tooltip_border_color ?? "#4a5568";
      const borderRadius = settings.tooltip_border_radius ?? 4;
      const borderThickness = settings.tooltip_border_thickness ?? 1;
      const fontSize = settings.tooltip_font_size ?? 12;
      const fontWeight = settings.tooltip_font_weight ?? "600";
      const fontFamily = (settings.tooltip_font_family || "system-ui") + ", sans-serif";
      const escaped = String(title)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const dateEscaped = date
        ? String(date)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
        : "";
      const dateLine = dateEscaped
        ? `<div style="font-size:${Math.max(10, fontSize - 2)}px;opacity:0.9;margin-top:2px;">${dateEscaped}</div>`
        : "";
      return `<div class="gm-custom-tooltip" style="position:relative;background-color:${bg};color:${color};border:${borderThickness}px solid ${borderColor};border-radius:${borderRadius}px;padding:6px 8px 10px 8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);font-size:${fontSize}px;font-weight:${fontWeight};font-family:${fontFamily};">${escaped}${dateLine}<span class="gm-custom-tooltip-pointer" style="border-top-color:${bg};border-width:6px 6px 0 6px;"></span></div>`;
    },
    [settings]
  );

  /* Refs so we only re-run marker effect when location IDs change, not on every parent re-render */
  const locationsRef = useRef<Site[]>(locations);
  const iconForSiteRef = useRef(iconForSite);
  const getTooltipContentRef = useRef(getTooltipContent);
  const siteDatesRef = useRef(siteDates);
  locationsRef.current = locations;
  iconForSiteRef.current = iconForSite;
  getTooltipContentRef.current = getTooltipContent;
  siteDatesRef.current = siteDates;

  const locationIdsKey = useMemo(
    () => locations.map((s) => s.id).join(","),
    [locations]
  );

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    const tooltipWindow = tooltipWindowRef.current;
    if (!map || !clusterer) return;

    const locs = locationsRef.current;
    const iconFn = iconForSiteRef.current;
    const tooltipFn = getTooltipContentRef.current;
    const dates = siteDatesRef.current;

    // Clear listeners on existing markers before removing to prevent memory leaks
    markersRef.current.forEach((m) => google.maps.event.clearInstanceListeners(m));
    markersRef.current = [];
    clusterer.clearMarkers();

    const newMarkers = locs.map((s) => {
      const m = new google.maps.Marker({
        position: { lat: s.latitude, lng: s.longitude },
        title: s.title,
        icon: iconFn(s) ?? undefined,
      });

      m.addListener("mouseover", () => {
        if (tooltipWindow) {
          tooltipWindow.setContent(tooltipFn(s.title, dates?.get(s.id)));
          tooltipWindow.open(map, m);
        }
      });
      m.addListener("mouseout", () => {
        if (tooltipWindow) tooltipWindow.close();
      });

      m.addListener("click", () => {
        tooltipWindowRef.current?.close();
        if (directMarkerSelectRef.current) {
          onSiteSelectRef.current?.(s);
        } else {
          setActiveId(s.id);
          setInfoWindowSite(s);
        }
      });

      return m;
    });

    markersRef.current = newMarkers;
    clusterer.addMarkers(newMarkers);
  }, []);

  useEffect(() => {
    if (!clustererRef.current) return;
    renderMarkers();
  }, [locationIdsKey, renderMarkers]);

  /* When in trip view or nearby search, fit map bounds to show all pins and full radius circle when set */
  useEffect(() => {
    if (!fitMapToLocations || !mapReady || !mapRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    const valid = locations.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    valid.forEach((s) => bounds.extend({ lat: s.latitude, lng: s.longitude }));
    if (radiusCircle && Number.isFinite(radiusCircle.radiusKm) && radiusCircle.radiusKm > 0) {
      const { centerLat, centerLng, radiusKm } = radiusCircle;
      const degLat = radiusKm / 111;
      const degLng = radiusKm / (111 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
      bounds.extend({ lat: centerLat - degLat, lng: centerLng - degLng });
      bounds.extend({ lat: centerLat + degLat, lng: centerLng + degLng });
    }
    if (valid.length === 0 && !radiusCircle) return;
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
    const listener = mapRef.current.addListener("idle", () => {
      const z = mapRef.current?.getZoom();
      if (typeof z === "number" && z > 14) mapRef.current?.setZoom(14);
    });
    return () => { google.maps.event.removeListener(listener); };
  }, [fitMapToLocations, mapReady, locations, radiusCircle?.centerLat, radiusCircle?.centerLng, radiusCircle?.radiusKm]);

  /* When trip panel is closed (resetMapViewTrigger increments), fly back to default center/zoom */
  const { default_center_lat, default_center_lng, default_zoom } = settings;
  useEffect(() => {
    if (resetMapViewTrigger <= 0 || !mapRef.current) return;
    if (!Number.isFinite(default_center_lat) || !Number.isFinite(default_center_lng) || !Number.isFinite(default_zoom)) return;
    mapRef.current.panTo({ lat: default_center_lat, lng: default_center_lng });
    mapRef.current.setZoom(default_zoom);
  }, [resetMapViewTrigger, default_center_lat, default_center_lng, default_zoom]);

  /* Fly Google map to user location when flyToTrigger changes */
  useEffect(() => {
    if (!flyToTrigger || !mapRef.current) return;
    if (!Number.isFinite(flyToTrigger.lat) || !Number.isFinite(flyToTrigger.lng)) return;
    mapRef.current.panTo({ lat: flyToTrigger.lat, lng: flyToTrigger.lng });
    mapRef.current.setZoom(14);
  }, [flyToTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Blue dot for user location on Google Maps */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userLat == null || userLng == null || !Number.isFinite(userLat) || !Number.isFinite(userLng)) {
      if (userDotMarkerRef.current) {
        userDotMarkerRef.current.setMap(null);
        userDotMarkerRef.current = null;
      }
      return;
    }
    if (userDotMarkerRef.current) {
      userDotMarkerRef.current.setPosition({ lat: userLat, lng: userLng });
    } else {
      userDotMarkerRef.current = new google.maps.Marker({
        position: { lat: userLat, lng: userLng },
        map,
        zIndex: 2000,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        title: "Your location",
      });
    }
    return () => {
      if (userDotMarkerRef.current) {
        userDotMarkerRef.current.setMap(null);
        userDotMarkerRef.current = null;
      }
    };
  }, [userLat, userLng]); // eslint-disable-line react-hooks/exhaustive-deps

  /* When user applies search filters (fitFilteredTrigger increments), fit map to filtered pins */
  useEffect(() => {
    if (fitFilteredTrigger <= 0 || !mapReady || !mapRef.current) return;
    const valid = locations.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    if (valid.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    valid.forEach((s) => bounds.extend({ lat: s.latitude, lng: s.longitude }));
    mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    const listener = mapRef.current.addListener("idle", () => {
      const z = mapRef.current?.getZoom();
      if (typeof z === "number" && z > 14) mapRef.current?.setZoom(14);
    });
    return () => { google.maps.event.removeListener(listener); };
  }, [fitFilteredTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Light red radius circle (dashed border + label) when "Search Around a Site" is active */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!radiusCircle) {
      if (radiusCircleRef.current) {
        radiusCircleRef.current.setMap(null);
        radiusCircleRef.current = null;
      }
      if (radiusCircleStrokeRef.current) {
        radiusCircleStrokeRef.current.setMap(null);
        radiusCircleStrokeRef.current = null;
      }
      if (radiusCircleLabelRef.current) {
        radiusCircleLabelRef.current.setMap(null);
        radiusCircleLabelRef.current = null;
      }
      return;
    }
    const { centerLat, centerLng, radiusKm } = radiusCircle;
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusKm) || radiusKm <= 0) return;
    const radiusM = radiusKm * 1000;
    const degPerMeterLat = 1 / 111320;
    const degPerMeterLng = 1 / (111320 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
    const points: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * 2 * Math.PI;
      points.push({
        lat: centerLat + (radiusM * degPerMeterLat) * Math.cos(angle),
        lng: centerLng + (radiusM * degPerMeterLng) * Math.sin(angle),
      });
    }
    if (!radiusCircleRef.current) {
      radiusCircleRef.current = new google.maps.Circle({
        map,
        center: { lat: centerLat, lng: centerLng },
        radius: radiusM,
        fillColor: "#fca5a5",
        fillOpacity: 0.18,
        strokeColor: "transparent",
        strokeOpacity: 0,
        strokeWeight: 0,
      });
    } else {
      radiusCircleRef.current.setCenter({ lat: centerLat, lng: centerLng });
      radiusCircleRef.current.setRadius(radiusM);
    }
    const dashedSymbol = {
      path: "M 0,-1 0,1",
      strokeOpacity: 1,
      scale: 3,
      strokeColor: "#dc2626",
    };
    if (!radiusCircleStrokeRef.current) {
      radiusCircleStrokeRef.current = new google.maps.Polyline({
        map,
        path: points,
        strokeOpacity: 0,
        icons: [{ icon: dashedSymbol, offset: "0", repeat: "12px" }],
      });
    } else {
      radiusCircleStrokeRef.current.setPath(points);
    }
    const labelPosition = { lat: centerLat + radiusKm / 111, lng: centerLng };
    if (!radiusCircleLabelRef.current) {
      radiusCircleLabelRef.current = new google.maps.Marker({
        map,
        position: labelPosition,
        icon: {
          url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          scaledSize: new google.maps.Size(1, 1),
          anchor: new google.maps.Point(0.5, 0.5),
        },
        label: {
          text: `${radiusKm} km`,
          color: "#991b1b",
          fontSize: "11px",
          fontWeight: "600",
        },
        zIndex: 1,
      });
    } else {
      radiusCircleLabelRef.current.setPosition(labelPosition);
      radiusCircleLabelRef.current.setLabel({
        text: `${radiusKm} km`,
        color: "#991b1b",
        fontSize: "11px",
        fontWeight: "600",
      } as google.maps.MarkerLabel);
    }
  }, [radiusCircle?.centerLat, radiusCircle?.centerLng, radiusCircle?.radiusKm, radiusCircle != null]);

  if (!apiKey) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-yellow-900 bg-yellow-100">
        Google Maps API key missing in settings.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-red-700 bg-red-100">
        Failed to load Google Maps SDK: {String(loadError.message || loadError)}
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
        Loading Google Maps…
      </div>
    );
  }

  /* ----- cluster renderer: match OSM style; Google hover = slight color change (no size change) ----- */
  const sizeBase = 46;

  function buildClusterIcon(
    color: string,
    count: number,
    isHover: boolean
  ): google.maps.Icon {
    const fillColor = isHover ? lightenHex(color, 0.2) : color;
    const rgb = hexToRgb(fillColor);
    const outerRgba = rgb
      ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isHover ? 0.35 : 0.2})`
      : isHover
        ? "rgba(247, 131, 0, 0.35)"
        : "rgba(247, 131, 0, 0.2)";
    const cx = sizeBase / 2;
    const cy = sizeBase / 2;
    const rOuter = sizeBase / 2 - 2;
    const ringThickness = 5;
    const rInner = rOuter - ringThickness;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${sizeBase}" height="${sizeBase}" viewBox="0 0 ${sizeBase} ${sizeBase}">
        <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${outerRgba}" />
        <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="${fillColor}" />
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="13" font-family="system-ui, sans-serif" font-weight="600" fill="#ffffff">${count}</text>
      </svg>`;
    return {
      url: encodeSvg(svg),
      scaledSize: new google.maps.Size(sizeBase, sizeBase),
      anchor: new google.maps.Point(sizeBase / 2, sizeBase / 2),
    };
  }

  class ThemedRenderer extends DefaultRenderer {
    private color: string;
    constructor(color: string) {
      super();
      this.color = color || "var(--brand-orange)";
    }
    render({ count, position }: any) {
      const clusterColor = this.color;
      const normalIcon = buildClusterIcon(clusterColor, count, false);
      const hoverIcon = buildClusterIcon(clusterColor, count, true);
      const marker = new google.maps.Marker({
        position,
        icon: normalIcon,
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
      });
      marker.addListener("mouseover", () => marker.setIcon(hoverIcon));
      marker.addListener("mouseout", () => marker.setIcon(normalIcon));
      return marker;
    }
  }

  /* ----- **NEW** CSS to make InfoWindow transparent; hide close button for hover tooltip ----- */
  const GoogleInfoWindowStyles = () => (
    <style>{`
      /* Make the main InfoWindow bubble transparent and remove its styling */
      .gm-style .gm-style-iw-c {
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
      }
      /* Ensure the content container is also transparent */
      .gm-style .gm-style-iw-d {
        overflow: visible !important;
        background: transparent !important;
      }
      /* Hide the InfoWindow pointer/tail (removes the strange line) - only pseudo-elements, not containers */
      .gm-style .gm-style-iw-tc::after,
      .gm-style .gm-style-iw-tc::before,
      .gm-style .gm-style-iw-t::after,
      .gm-style .gm-style-iw-t::before {
        display: none !important;
        visibility: hidden !important;
        background: none !important;
        border: none !important;
        box-shadow: none !important;
      }
      /* Remove stray borders; keep tip containers so tooltip content still shows */
      .gm-style .gm-style-iw-c,
      .gm-style .gm-style-iw-d {
        border: none !important;
        outline: none !important;
      }
      /* Hide close button (X) when content is our hover tooltip */
      .gm-style .gm-style-iw-c:has(.gm-custom-tooltip) .gm-style-iw-tc,
      .gm-style .gm-style-iw-c:has(.gm-custom-tooltip) button[aria-label="Close"],
      .gm-style .gm-style-iw-c:has(.gm-custom-tooltip) .gm-style-iw-tb {
        display: none !important;
      }
      /* Custom pointer (triangle) for hover tooltip – points down to the pin */
      .gm-custom-tooltip-pointer {
        position: absolute !important;
        left: 50% !important;
        bottom: 0 !important;
        transform: translate(-50%, 0) !important;
        width: 0 !important;
        height: 0 !important;
        border-style: solid !important;
        border-left-color: transparent !important;
        border-right-color: transparent !important;
        border-bottom: none !important;
        /* border-top-color set inline to match tooltip background */
        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2)) !important;
      }

      /* Animation keyframes */
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: scale(1) translateY(0); }
        to { opacity: 0; transform: scale(0.95) translateY(10px); }
      }

      /* Classes to apply the animations */
      .info-window-content.fade-in {
        animation: fadeIn 0.3s ease-out forwards;
      }
      .info-window-content.fade-out {
        animation: fadeOut 0.3s ease-out forwards;
      }
    `}</style>
  );

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={initialCenter}
      zoom={initialZoom}
      options={{
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        zoomControl: false,
        mapTypeId: mapTypeId === "satellite" ? "satellite" : "roadmap",
      }}
      onLoad={(map) => {
        mapRef.current = map;
        setMapReady(true);
        tooltipWindowRef.current = new google.maps.InfoWindow({ disableAutoPan: true });

        const markers = locations.map((s) => {
          const m = new google.maps.Marker({
            position: { lat: s.latitude, lng: s.longitude },
            title: s.title,
            icon: iconForSite(s) ?? undefined,
          });

          m.addListener("mouseover", () => {
            const tw = tooltipWindowRef.current;
            if (tw) {
              tw.setContent(getTooltipContent(s.title, siteDates?.get(s.id)));
              tw.open(map, m);
            }
          });
          m.addListener("mouseout", () => {
            tooltipWindowRef.current?.close();
          });

          m.addListener("click", () => {
            tooltipWindowRef.current?.close();
            if (directMarkerSelectRef.current) {
              onSiteSelectRef.current?.(s);
            } else {
              setActiveId(s.id);
              setInfoWindowSite(s);
            }
          });

          return m;
        });

        const clusterer = new MarkerClusterer({
          markers,
          map,
          renderer: new ThemedRenderer(settings.cluster_color_google || settings.cluster_color || "var(--brand-orange)"),
        });
        clustererRef.current = clusterer;
        markersRef.current = markers;
      }}
      onClick={() => setActiveId(null)}
      onUnmount={() => {
        markersRef.current.forEach((m) => google.maps.event.clearInstanceListeners(m));
        markersRef.current = [];
        const clusterer = clustererRef.current;
        if (clusterer) {
          clusterer.clearMarkers();
          clustererRef.current = null;
        }
        const tooltipWindow = tooltipWindowRef.current;
        if (tooltipWindow) {
          tooltipWindow.close();
          tooltipWindowRef.current = null;
        }
        mapRef.current = null;
      }}
    >
      <GoogleInfoWindowStyles />

      {infoWindowSite && (
        <InfoWindow
          position={{
            lat: infoWindowSite.latitude,
            lng: infoWindowSite.longitude,
          }}
          onCloseClick={() => {
            if (highlightSiteId && activeId === highlightSiteId) onHighlightConsumedRef.current?.();
            setActiveId(null);
            setInfoWindowSite(null);
          }}
          options={{ disableAutoPan: true }}
        >
          <div
            className={`info-window-content map-preview-card-wrapper ${
              activeId === infoWindowSite.id ? "fade-in" : "fade-out"
            } rounded-xl overflow-hidden shadow-[0_4px_14px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.08)]`}
            style={{ minWidth: 340, maxWidth: 360, width: "100%" }}
          >
            <SitePreviewCard
              site={infoWindowSite}
              onCardClick={onSiteSelect ? () => onSiteSelect(infoWindowSite) : undefined}
              onPlacesNearby={onPlacesNearbyApply ?? undefined}
            />
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
