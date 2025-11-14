"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Icon from "@/components/Icon";
import UserMapPreviewCard from "@/components/UserMapPreviewCard";
import Image from "next/image";
import { avatarSrc } from "@/lib/image/avatarSrc";

/* ------------------------ Google Maps --------------------- */
import { GoogleMap, useJsApiLoader, InfoWindow } from "@react-google-maps/api";
import { MarkerClusterer, DefaultRenderer } from "@googlemaps/markerclusterer";

/* ──────────────────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────────────────── */
export type UserSite = {
  id: string;
  title: string;
  slug: string;
  latitude: number;
  longitude: number;
  site_categories: { categories: { icon_key: string | null } | null }[];
  visited_year?: number | null;
  visited_month?: number | null;
  cover_photo_url?: string | null;
  location_free?: string | null;
  heritage_type?: string | null;
  rating?: number;
};

type ProfileData = {
  full_name: string | null;
  badge: string | null;
  avatar_url: string | null;
};

type MapSettings = {
  google_maps_api_key?: string | null;
  default_center_lat: number;
  default_center_lng: number;
  default_zoom: number;
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
  cluster_color?: string;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * MAIN COMPONENT
 * ────────────────────────────────────────────────────────────────────────────── */
export default function UserVisitedMap({
  locations,
  onClose,
  profile,
  visitedCount,
}: {
  locations: UserSite[];
  onClose: () => void;
  profile: ProfileData | null;
  visitedCount: number;
}) {
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [icons, setIcons] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMapData = async () => {
      setLoading(true);
      const [settingsRes, iconsRes] = await Promise.all([
        supabase
          .from("global_settings")
          .select("value")
          .eq("key", "usermap_settings")
          .maybeSingle(),
        supabase.from("icons").select("name, svg_content"),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data.value as any);
      }

      if (iconsRes.data) {
        const iconMap = new Map<string, string>();
        (iconsRes.data as any[]).forEach((icon) =>
          iconMap.set(icon.name, icon.svg_content)
        );
        setIcons(iconMap);
      }
      setLoading(false);
    };
    fetchMapData();
  }, []);

  return (
    <div className="w-full h-[calc(100vh-12rem)] relative rounded-2xl overflow-hidden shadow-xl border border-gray-200">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-gray-800 shadow-lg">
        <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center border-2 border-white">
          <Icon name="check" size={10} className="text-white" />
        </div>
        <h2 className="text-md font-bold">Your Visited Places</h2>
      </div>
      <div className="absolute top-4 left-4 z-[1000] space-y-2">
        <div className="bg-white rounded-lg shadow-md p-3 space-y-3">
          {profile && (
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-orange-400">
                <Image
                  src={avatarSrc(profile.avatar_url) || "/default-avatar.png"}
                  alt="User avatar"
                  layout="fill"
                  objectFit="cover"
                />
              </div>
              <div>
                <div className="font-semibold text-sm">{profile.full_name}</div>
                <div className="text-xs text-green-600">{profile.badge}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white text-2xl font-bold border-2 border-white">
              {visitedCount}
            </div>
            <div>
              <div className="font-semibold text-sm">Heritage Sites</div>
              <div className="text-xs text-gray-500">Reviewed by you</div>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 transition shadow-md"
        >
          <Icon name="arrow-left" />
          Back to List
        </button>
      </div>

      {loading || !settings ? (
        <div className="flex items-center justify-center h-full w-full bg-gray-100">
          <Icon
            name="spinner"
            className="animate-spin text-orange-500"
            size={48}
          />
        </div>
      ) : (
        <GoogleMapView
          locations={locations}
          settings={settings}
          icons={icons}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Google Maps view
 * ────────────────────────────────────────────────────────────────────────────── */
function GoogleMapView({
  locations,
  settings,
  icons,
}: {
  locations: UserSite[];
  settings: MapSettings;
  icons: Map<string, string>;
}) {
  const apiKey = (settings.google_maps_api_key || "").trim();
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerStyle = { width: "100%", height: "100%" };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [infoWindowSite, setInfoWindowSite] = useState<UserSite | null>(null);

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

  const iconForSite = (site: UserSite): google.maps.Icon | undefined => {
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

  const GoogleInfoWindowStyles = () => (
    <style>{`
      .gm-style .gm-style-iw-c {
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
        padding: 0 !important;
      }
      .gm-style .gm-style-iw-d {
        overflow: visible !important;
        background: transparent !important;
      }
      .gm-style .gm-style-iw-tc::after {
        display: none !important;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: scale(1) translateY(0); }
        to { opacity: 0; transform: scale(0.95) translateY(10px); }
      }
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
        mapTypeControl: false,
        fullscreenControl: true,
      }}
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
            <UserMapPreviewCard site={infoWindowSite} />
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
