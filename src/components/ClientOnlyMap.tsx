// src/components/ClientOnlyMap.tsx
"use client";

import { useMemo, useCallback, useRef, useState, useEffect, memo } from "react";

/* ------------------------ Leaflet / OSM (original path) ------------------------ */
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
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
      min-width: 340px !important;
      max-width: 360px !important;
    }
    .leaflet-popup-tip-container {
      display: none !important; /* Hide the popup tip/arrow */
    }
    .leaflet-popup-content {
      margin: 0 !important; /* Remove default margin */
      width: 100% !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
      border-radius: 0.75rem !important;
      overflow: hidden !important;
    }
  `;
  return <style>{style}</style>;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * MAIN SWITCHER
 * ────────────────────────────────────────────────────────────────────────────── */
export default function ClientOnlyMap({
  locations,
  settings,
  icons,
  highlightSiteId = null,
  onHighlightConsumed,
  onSiteSelect,
  /** Override from map type switcher: osm | google | google_satellite */
  mapType: mapTypeOverride,
}: {
  locations: Site[];
  settings: MapSettings | null;
  icons: Map<string, string>;
  /** When set, map flies to this site and opens its preview popup. Cleared via onHighlightConsumed. */
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  /** When provided, clicking a marker calls this instead of showing a popup. */
  onSiteSelect?: (site: Site) => void;
  mapType?: MapType;
}) {
  // Stabilize callbacks with refs so OSMLeafletView never re-renders just
  // because the parent passed a new inline arrow function reference.
  const onSiteSelectRef = useRef(onSiteSelect);
  useEffect(() => { onSiteSelectRef.current = onSiteSelect; }, [onSiteSelect]);
  const stableOnSiteSelect = useCallback((site: Site) => {
    onSiteSelectRef.current?.(site);
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
        <p className="ml-4 text-lg text-gray-600">Loading Map...</p>
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
      />
    );
  }

  return (
    <OSMLeafletView
      locations={locations}
      settings={settings}
      icons={icons}
      highlightSiteId={highlightSiteId}
      onHighlightConsumed={stableOnHighlightConsumed}
      onSiteSelect={stableOnSiteSelect}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * OSM / Leaflet view (unchanged)
 * ────────────────────────────────────────────────────────────────────────────── */
/* Fly to and show popup when parent sets highlightSiteId */
function OSMHighlightEffect({
  locations,
  highlightSiteId,
  onHighlightConsumed,
  onSiteSelect,
}: {
  locations: Site[];
  highlightSiteId: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
}) {
  const map = useMap();
  const site = highlightSiteId
    ? locations.find((s) => s.id === highlightSiteId)
    : null;

  useEffect(() => {
    if (!site) return;
    map.flyTo([site.latitude, site.longitude], 14, { duration: 0.5 });
  }, [map, site?.id, site?.latitude, site?.longitude]);

  if (!site) return null;
  return (
    <Popup
      position={[site.latitude, site.longitude]}
      eventHandlers={{
        remove: () => onHighlightConsumed?.(),
      }}
    >
      <SitePreviewCard
        site={site}
        onCardClick={onSiteSelect ? () => onSiteSelect(site) : undefined}
      />
    </Popup>
  );
}

const OSMLeafletView = memo(function OSMLeafletView({
  locations,
  settings,
  icons,
  highlightSiteId = null,
  onHighlightConsumed,
  onSiteSelect,
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
}) {
  const createCustomIcon = useCallback(
    (iconName: string, s: MapSettings) => {
      const {
        pin_style = "icon_only",
        pin_icon_size = 32,
        pin_color = "#f78300",
        pin_circle_size = 40,
        pin_circle_color = "#f78300",
        pin_icon_color_in_circle = "#ffffff",
        pin_border_thickness = 0,
        pin_border_color = "transparent",
      } = s;

      const svgContent = icons.get(iconName);
      if (!svgContent) return { icon: null as L.DivIcon | null, size: 0 };

      let iconHtml = "";
      let finalIconSize = pin_icon_size;

      if (pin_style === "icon_in_circle") {
        finalIconSize =
          pin_circle_size +
          (pin_border_thickness > 0 ? pin_border_thickness * 2 : 0);
        const wrapperStyles = [
          `width: ${pin_circle_size}px`,
          `height: ${pin_circle_size}px`,
          `background-color: ${pin_circle_color}`,
          "border-radius: 50%",
          "display: flex",
          "align-items: center",
          "justify-content: center",
          "box-shadow: 0 2px 5px rgba(0,0,0,0.2)",
          `border: ${pin_border_thickness}px solid ${pin_border_color}`,
        ];
        const innerIconHtml = `<div style="font-size: ${pin_icon_size}px; color: ${pin_icon_color_in_circle};">${svgContent}</div>`;
        iconHtml = `<div class="marker-hover-target" style="${wrapperStyles.join(
          ";"
        )}">${innerIconHtml}</div>`;
      } else {
        iconHtml = `<div class="marker-hover-target" style="font-size: ${pin_icon_size}px; color: ${pin_color};">${svgContent}</div>`;
        finalIconSize = pin_icon_size;
      }

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

  // Keep popup open after clicking a card. When the card click triggers a
  // state update in the parent, the Leaflet popup closes. We detect this via
  // the marker's popupclose event and reopen the popup immediately.
  const pendingPopupId = useRef<string | null>(null);

  return (
    <div className="relative w-full h-full">
      {settings.cluster_color && (
        <DynamicClusterStyles color={settings.cluster_color} />
      )}
      <DynamicTooltipStyles settings={settings} />
      {/* **NEW**: Added the popup style component here */}
      <DynamicPopupStyles />

      <MapContainer
        center={[settings.default_center_lat, settings.default_center_lng]}
        zoom={settings.default_zoom}
        scrollWheelZoom={true}
        zoomControl={false}
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
        />
        <OSMHighlightEffect
          locations={locations}
          highlightSiteId={highlightSiteId ?? null}
          onHighlightConsumed={onHighlightConsumed}
          onSiteSelect={onSiteSelect}
        />
        <MarkerClusterGroup
          disableClusteringAtZoom={settings.disable_clustering_at_zoom}
          maxClusterRadius={settings.cluster_max_radius}
        >
          {locations.map((site) => {
            let iconName = settings.pin_icon_name || "map-pin";
            if (settings.icon_source === "category") {
              const categoryIconName = site.site_categories?.find(
                (sc) => sc.categories?.icon_key
              )?.categories?.icon_key;
              if (categoryIconName) iconName = categoryIconName;
            }
            const iconData = memoizedIcons.get(iconName);
            if (!iconData || !iconData.icon) return null;

            return (
              <Marker
                key={site.id}
                position={[site.latitude, site.longitude]}
                icon={iconData.icon}
                eventHandlers={{
                  popupclose: (e) => {
                    if (pendingPopupId.current === site.id) {
                      pendingPopupId.current = null;
                      setTimeout(() => (e.target as L.Marker).openPopup(), 0);
                    }
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -(iconData.size / 2 + 6)]}>
                  {site.title}
                </Tooltip>
                <Popup>
                  <SitePreviewCard
                    site={site}
                    onCardClick={onSiteSelect ? () => {
                      pendingPopupId.current = site.id;
                      onSiteSelect(site);
                    } : undefined}
                  />
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
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
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
  highlightSiteId?: string | null;
  onHighlightConsumed?: () => void;
  onSiteSelect?: (site: Site) => void;
  mapTypeId?: "roadmap" | "satellite";
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
  const tooltipWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const containerStyle = { width: "100%", height: "100%" };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoWindowSite, setInfoWindowSite] = useState<Site | null>(null);

  const highlightSite = highlightSiteId
    ? locations.find((s) => s.id === highlightSiteId) ?? null
    : null;
  useEffect(() => {
    if (!highlightSite || !mapRef.current) return;
    const map = mapRef.current;
    map.panTo({ lat: highlightSite.latitude, lng: highlightSite.longitude });
    map.setZoom(14);
    setActiveId(highlightSite.id);
    setInfoWindowSite(highlightSite);
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
        const circleSize = Math.max(8, settings.pin_circle_size ?? 40);
        const borderThickness = Math.max(0, settings.pin_border_thickness ?? 0);
        const iconSize = Math.max(8, settings.pin_icon_size ?? 32);
        const finalSvg = buildCircleWrappedSvg(
          rawSvg,
          iconSize,
          circleSize + borderThickness * 2,
          settings.pin_circle_color ?? "#f78300",
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

      const iconSize = Math.max(8, settings.pin_icon_size ?? 32);
      const normalized = normalizeSvg(
        rawSvg,
        iconSize,
        settings.pin_color ?? "#f78300"
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
    (title: string): string => {
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
      return `<div class="gm-custom-tooltip" style="position:relative;background-color:${bg};color:${color};border:${borderThickness}px solid ${borderColor};border-radius:${borderRadius}px;padding:6px 8px 10px 8px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);font-size:${fontSize}px;font-weight:${fontWeight};font-family:${fontFamily};">${escaped}<span class="gm-custom-tooltip-pointer" style="border-top-color:${bg};border-width:6px 6px 0 6px;"></span></div>`;
    },
    [settings]
  );

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    const tooltipWindow = tooltipWindowRef.current;
    if (!map || !clusterer) return;

    clusterer.clearMarkers();

    const newMarkers = locations.map((s) => {
      const m = new google.maps.Marker({
        position: { lat: s.latitude, lng: s.longitude },
        title: s.title,
        icon: iconForSite(s) ?? undefined,
      });

      m.addListener("mouseover", () => {
        if (tooltipWindow) {
          tooltipWindow.setContent(getTooltipContent(s.title));
          tooltipWindow.open(map, m);
        }
      });
      m.addListener("mouseout", () => {
        if (tooltipWindow) tooltipWindow.close();
      });

      m.addListener("click", () => {
        tooltipWindowRef.current?.close();
        setActiveId(s.id);
        setInfoWindowSite(s);
      });

      return m;
    });

    clusterer.addMarkers(newMarkers);
  }, [locations, iconForSite, getTooltipContent]);

  useEffect(() => {
    if (!clustererRef.current) return;
    renderMarkers();
  }, [renderMarkers]);

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
      this.color = color || "#f78300";
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
        mapTypeId: mapTypeId === "satellite" ? "satellite" : "roadmap",
      }}
      onLoad={(map) => {
        mapRef.current = map;
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
              tw.setContent(getTooltipContent(s.title));
              tw.open(map, m);
            }
          });
          m.addListener("mouseout", () => {
            tooltipWindowRef.current?.close();
          });

          m.addListener("click", () => {
            tooltipWindowRef.current?.close();
            setActiveId(s.id);
            setInfoWindowSite(s);
          });

          return m;
        });

        const clusterer = new MarkerClusterer({
          markers,
          map,
          renderer: new ThemedRenderer(settings.cluster_color_google || settings.cluster_color || "#f78300"),
        });
        clustererRef.current = clusterer;
      }}
      onClick={() => setActiveId(null)}
      onUnmount={() => {
        mapRef.current = null;
        clustererRef.current = null;
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
            if (highlightSiteId && activeId === highlightSiteId) onHighlightConsumed?.();
            setActiveId(null);
            setInfoWindowSite(null);
          }}
          options={{ disableAutoPan: true }}
        >
          <div
            className={`info-window-content ${
              activeId === infoWindowSite.id ? "fade-in" : "fade-out"
            } rounded-xl overflow-hidden shadow-[0_4px_14px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.08)]`}
            style={{ minWidth: 340, maxWidth: 360, width: "100%" }}
          >
            <SitePreviewCard
              site={infoWindowSite}
              onCardClick={onSiteSelect ? () => onSiteSelect(infoWindowSite) : undefined}
            />
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
