"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { useRef } from "react";

type MapProvider = "osm" | "google";
type MapSettings = {
  provider: MapProvider;
  google_maps_api_key?: string | null;
  tile_layer_url?: string;
  tile_layer_attribution?: string;
  default_center_lat?: number;
  default_center_lng?: number;
  default_zoom?: number;
};

export default function AdminMapPreview({
  settings,
}: {
  settings: MapSettings;
}) {
  // Parent has a single, stable hook call (useMemo) — nothing else.
  const center = useMemo(
    () => ({
      lat: settings.default_center_lat ?? 30.3753,
      lng: settings.default_center_lng ?? 69.3451,
    }),
    [settings.default_center_lat, settings.default_center_lng]
  );

  if (settings.provider === "google") {
    return <GooglePreview settings={settings} center={center} />;
  }
  return <OSMPreview settings={settings} center={center} />;
}

/* ------------------------------ OSM (Leaflet) ----------------------------- */

function OSMPreview({
  settings,
  center,
}: {
  settings: MapSettings;
  center: { lat: number; lng: number };
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={settings.default_zoom ?? 5}
      style={{ height: 360, width: "100%" }}
    >
      <TileLayer
        url={
          settings.tile_layer_url ??
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        }
        attribution={
          settings.tile_layer_attribution ?? "© OpenStreetMap contributors"
        }
      />
    </MapContainer>
  );
}

/* -------------------------- Google (official SDK) ------------------------- */

function GooglePreview({
  settings,
  center,
}: {
  settings: MapSettings;
  center: { lat: number; lng: number };
}) {
  const apiKey = (settings.google_maps_api_key || "").trim();
  const containerStyle = useRef({ width: "100%", height: "360px" });

  if (!apiKey) {
    return (
      <div className="p-3 text-sm text-yellow-900 bg-yellow-100">
        Enter a Google Maps API key to preview Google Maps.
      </div>
    );
  }

  // Loader is called here (inside a dedicated component) with stable, memoized options.
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    // keep options stable; do not pass "id" to avoid cross-component conflicts
    language: "en",
    region: "US",
  });

  if (loadError) {
    return (
      <div className="p-3 text-sm text-red-700 bg-red-100">
        Failed to load Google Maps SDK: {String(loadError.message || loadError)}
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="p-3 text-sm text-gray-500">Loading Google Maps…</div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle.current}
      center={center}
      zoom={settings.default_zoom ?? 5}
      options={{
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      }}
    />
  );
}
