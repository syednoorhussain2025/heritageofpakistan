"use client";

import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Icon from "@/components/Icon";
import UserMapPreviewCard from "@/components/UserMapPreviewCard";

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

/* Fix default Leaflet marker icons broken by webpack */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* Teal custom marker icon */
const tealIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:28px;height:28px;border-radius:50% 50% 50% 0;
    background:#00b78b;border:2px solid #fff;
    transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.28)
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

/* Auto-fit map to markers */
function FitBounds({ locations }: { locations: UserSite[] }) {
  const map = useMap();
  useEffect(() => {
    if (!locations.length) return;
    const bounds = L.latLngBounds(locations.map((s) => [s.latitude, s.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [locations, map]);
  return null;
}

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
  const [activeId, setActiveId] = useState<string | null>(null);

  const defaultCenter: [number, number] = [30.3753, 69.3451]; // Pakistan center
  const defaultZoom = 5;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {locations.length > 0 && <FitBounds locations={locations} />}

        {locations.map((site) => (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={tealIcon}
            eventHandlers={{
              click: () => setActiveId(activeId === site.id ? null : site.id),
            }}
          >
            <Popup
              closeButton={false}
              autoPan={false}
              className="osm-popup"
            >
              <div className="min-w-[200px]">
                <UserMapPreviewCard site={site} />
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Leaflet popup style override */}
      <style>{`
        .osm-popup .leaflet-popup-content-wrapper {
          padding: 0; border-radius: 12px; overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        }
        .osm-popup .leaflet-popup-content { margin: 0; }
        .osm-popup .leaflet-popup-tip { background: white; }
        .leaflet-control-attribution { font-size: 10px !important; }
      `}</style>
    </div>
  );
}
