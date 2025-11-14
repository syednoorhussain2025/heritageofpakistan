// src/components/ClientOnlyMap.tsx
"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";

/* ------------------------ Leaflet / OSM (original path) ------------------------ */
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
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
};

type MapProvider = "osm" | "google";

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

  // Clustering (both OSM & Google)
  cluster_color?: string;
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

const DynamicClusterStyles = ({ color }: { color: string }) => {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const style = `
    .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background-color: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2) !important; }
    .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div { background-color: ${color} !important; }
  `;
  return <style>{style}</style>;
};

const DynamicTooltipStyles = ({ settings }: { settings: MapSettings }) => {
  const style = `
    .leaflet-tooltip {
      background-color: ${settings.tooltip_background_color} !important;
      color: ${settings.tooltip_text_color} !important;
      border: ${settings.tooltip_border_thickness}px solid ${settings.tooltip_border_color} !important;
      border-radius: ${settings.tooltip_border_radius}px !important;
      font-family: ${settings.tooltip_font_family}, sans-serif !important;
      font-size: ${settings.tooltip_font_size}px !important;
      font-weight: ${settings.tooltip_font_weight} !important;
      padding: 4px 8px !important;
      white-space: nowrap !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
    }
    .leaflet-tooltip-top:before, .leaflet-tooltip-bottom:before, .leaflet-tooltip-left:before, .leaflet-tooltip-right:before {
      border: none !important;
    }
  `;
  return <style>{style}</style>;
};

// **NEW**: Style component to make the OSM popup container transparent
const DynamicPopupStyles = () => {
  const style = `
    .leaflet-popup-content-wrapper {
      background: transparent !important;
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important; /* Let the inner component control padding */
    }
    .leaflet-popup-tip-container {
      display: none !important; /* Hide the popup tip/arrow */
    }
    .leaflet-popup-content {
      margin: 0 !important; /* Remove default margin */
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
}: {
  locations: Site[];
  settings: MapSettings | null;
  icons: Map<string, string>;
}) {
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

  if ((settings.provider ?? "osm") === "google") {
    return (
      <GoogleMapView locations={locations} settings={settings} icons={icons} />
    );
  }

  return (
    <OSMLeafletView locations={locations} settings={settings} icons={icons} />
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * OSM / Leaflet view (unchanged)
 * ────────────────────────────────────────────────────────────────────────────── */
function OSMLeafletView({
  locations,
  settings,
  icons,
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
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
              >
                <Tooltip direction="right" offset={[iconData.size / 2 + 2, 0]}>
                  {site.title}
                </Tooltip>
                <Popup>
                  <SitePreviewCard site={site} />
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Google Maps view — Transparent InfoWindow
 * ────────────────────────────────────────────────────────────────────────────── */
function GoogleMapView({
  locations,
  settings,
  icons,
}: {
  locations: Site[];
  settings: MapSettings;
  icons: Map<string, string>;
}) {
  const apiKey = (settings.google_maps_api_key || "").trim();
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerStyle = { width: "100%", height: "100%" };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoWindowSite, setInfoWindowSite] = useState<Site | null>(null);

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

  if (!apiKey) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-yellow-900 bg-yellow-100">
        Google Maps API key missing in settings.
      </div>
    );
  }

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    language: "en",
    region: "US",
  });

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

  /* ---------- SVG normalization (ensures icons render) ---------- */
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

  const iconForSite = (site: Site): google.maps.Icon | undefined => {
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
  };

  /* ----- cluster renderer using your selected cluster_color ----- */
  class ThemedRenderer extends DefaultRenderer {
    private color: string;
    constructor(color: string) {
      super();
      this.color = color || "#f78300";
    }
    render({ count, position }: any) {
      const size = 44;
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${
        this.color
      }" stroke="#ffffff" stroke-width="2" />
          <text x="50%" y="55%" text-anchor="middle" font-size="14" font-family="system-ui, sans-serif" fill="#ffffff">${count}</text>
        </svg>`;
      return new google.maps.Marker({
        position,
        icon: {
          url: encodeSvg(svg),
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(size / 2, size / 2),
        },
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
      });
    }
  }

  /* ----- **NEW** CSS to make InfoWindow transparent ----- */
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
      /* Hide the little pointer arrow */
      .gm-style .gm-style-iw-tc::after {
        display: none !important;
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
      options={{ streetViewControl: false, fullscreenControl: false }}
      onLoad={(map) => {
        mapRef.current = map;

        const markers = locations.map((s) => {
          const m = new google.maps.Marker({
            position: { lat: s.latitude, lng: s.longitude },
            title: s.title,
            icon: iconForSite(s),
          });

          m.addListener("click", () => {
            setActiveId(s.id);
            setInfoWindowSite(s);
          });

          return m;
        });

        new MarkerClusterer({
          markers,
          map,
          renderer: new ThemedRenderer(settings.cluster_color || "#f78300"),
        });
      }}
      onClick={() => setActiveId(null)}
      onUnmount={() => {
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
          onCloseClick={() => setActiveId(null)}
          options={{ disableAutoPan: true }}
        >
          <div
            className={`info-window-content ${
              activeId === infoWindowSite.id ? "fade-in" : "fade-out"
            }`}
          >
            <SitePreviewCard site={infoWindowSite} />
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
