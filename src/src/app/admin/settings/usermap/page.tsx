// src/app/admin/settings/usermap/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";

// IMPORTANT: relax the prop typing to avoid cross-module type collisions.
// The preview component exports its own MapSettings type; using `any` here
// avoids the "Two different types with this name exist" error.
const AdminMapPreview = dynamic<{ settings: any }>(
  () => import("@/app/admin/map/preview"),
  { ssr: false }
);

/* ────────────────────────────────────────────────────────────────
 * Local types (scoped to this page only)
 * ──────────────────────────────────────────────────────────────── */
type MapProvider = "osm" | "google";

type MapSettings = {
  provider?: MapProvider; // may be undefined in DB; we'll default to "osm" below
  google_maps_api_key?: string | null;

  icon_source: "global" | "category";
  pin_style: "icon_only" | "icon_in_circle";
  pin_icon_name: string;
  pin_icon_size: number;
  pin_color: string;
  pin_circle_size: number;
  pin_circle_color: string;
  pin_icon_color_in_circle: string;
  pin_border_thickness: number;
  pin_border_color: string;

  cluster_color: string;
  cluster_max_radius: number;
  disable_clustering_at_zoom: number;

  tile_layer_url: string;
  tile_layer_attribution: string;

  default_center_lat: number;
  default_center_lng: number;
  default_zoom: number;

  tooltip_background_color: string;
  tooltip_text_color: string;
  tooltip_border_color: string;
  tooltip_border_radius: number;
  tooltip_border_thickness: number;
  tooltip_font_size: number;
  tooltip_font_weight: string;
  tooltip_font_family: string;
};

type IconRow = { name: string; svg_content: string };

/* ────────────────────────────────────────────────────────────────
 * Pin Preview
 * ──────────────────────────────────────────────────────────────── */
const PinPreview = ({ settings }: { settings: MapSettings }) => {
  const {
    pin_style,
    pin_icon_name,
    pin_icon_size,
    pin_color,
    pin_circle_size,
    pin_circle_color,
    pin_icon_color_in_circle,
    pin_border_thickness,
    pin_border_color,
  } = settings;

  if (pin_style === "icon_in_circle") {
    const style: React.CSSProperties = {
      width: `${pin_circle_size}px`,
      height: `${pin_circle_size}px`,
      backgroundColor: pin_circle_color,
      borderRadius: "9999px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `${pin_border_thickness}px solid ${pin_border_color}`,
      boxSizing: "content-box",
    };
    return (
      <div style={style}>
        <Icon
          name={pin_icon_name}
          size={pin_icon_size}
          style={{ color: pin_icon_color_in_circle }}
        />
      </div>
    );
  }

  return (
    <Icon
      name={pin_icon_name}
      size={pin_icon_size}
      style={{ color: pin_color }}
    />
  );
};

/* ────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */
export default function UserMapSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [allIcons, setAllIcons] = useState<IconRow[]>([]);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  // Default settings
  const [settings, setSettings] = useState<MapSettings>({
    provider: "osm",
    google_maps_api_key: "",
    icon_source: "global",
    pin_style: "icon_only",
    pin_icon_name: "map-pin",
    pin_icon_size: 32,
    pin_color: "#f78300",
    pin_circle_size: 40,
    pin_circle_color: "#f78300",
    pin_icon_color_in_circle: "#ffffff",
    pin_border_thickness: 2,
    pin_border_color: "#ffffff",
    cluster_color: "#f78300",
    cluster_max_radius: 80,
    disable_clustering_at_zoom: 10,
    tile_layer_url:
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    tile_layer_attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    default_center_lat: 30.3753,
    default_center_lng: 69.3451,
    default_zoom: 5,
    tooltip_background_color: "#2d3748",
    tooltip_text_color: "#ffffff",
    tooltip_border_color: "#4a5568",
    tooltip_border_radius: 4,
    tooltip_border_thickness: 1,
    tooltip_font_size: 12,
    tooltip_font_weight: "600",
    tooltip_font_family: "sans-serif",
  });

  /* Load saved settings + icon catalog */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("global_settings")
        .select("value")
        .eq("key", "usermap_settings")
        .maybeSingle();

      if (data?.value) {
        setSettings((prev) => ({
          ...prev,
          ...(data.value as Partial<MapSettings>),
        }));
      }

      const { data: iconData } = await supabase
        .from("icons")
        .select("name, svg_content");
      setAllIcons((iconData as IconRow[]) || []);

      setLoading(false);
    })();
  }, []);

  const onChange = (key: keyof MapSettings, value: any) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const effective: MapSettings = {
        ...settings,
        provider: settings.provider ?? "osm",
      };
      if (effective.provider === "google" && !effective.google_maps_api_key) {
        throw new Error("Please provide a Google Maps API Key.");
      }
      const { error } = await supabase
        .from("global_settings")
        .upsert(
          { key: "usermap_settings", value: effective },
          { onConflict: "key" }
        );
      if (error) throw error;
      setSettings(effective);
      setMessage("User map settings saved successfully.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen p-6">
        Loading user map settings…
      </div>
    );
  }

  const isGoogle = (settings.provider ?? "osm") === "google";
  const effectiveSettings = {
    ...settings,
    provider: settings.provider ?? "osm",
  };

  return (
    <AdminGuard>
      <IconPickerModal
        isOpen={isIconPickerOpen}
        onClose={() => setIsIconPickerOpen(false)}
        icons={allIcons}
        currentIcon={settings.pin_icon_name}
        onSelect={(iconName) => {
          onChange("pin_icon_name", iconName || "map-pin");
          setIsIconPickerOpen(false);
        }}
      />

      <div className="bg-gray-900 text-gray-200 min-h-screen">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">
              User Map Settings
            </h1>
            <Link
              href="/admin"
              className="text-sm text-blue-400 hover:underline"
            >
              ← Back to Admin
            </Link>
          </div>

          <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
              Base Map Provider
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Provider
                </label>
                <select
                  value={settings.provider ?? "osm"}
                  onChange={(e) =>
                    onChange("provider", e.target.value as MapProvider)
                  }
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2"
                >
                  <option value="osm">OpenStreetMap (Leaflet tiles)</option>
                  <option value="google">Google Maps (official API)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Google Maps API Key
                </label>
                <input
                  type="text"
                  placeholder="AIza…"
                  value={settings.google_maps_api_key ?? ""}
                  onChange={(e) =>
                    onChange("google_maps_api_key", e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Required only when provider is Google.
                </p>
              </div>
            </div>

            {/* OSM tile config (disabled when Google is chosen) */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Tile Layer URL (OSM)
                </label>
                <input
                  type="text"
                  value={settings.tile_layer_url}
                  onChange={(e) => onChange("tile_layer_url", e.target.value)}
                  disabled={isGoogle}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Tile Layer Attribution (OSM)
                </label>
                <input
                  type="text"
                  value={settings.tile_layer_attribution}
                  onChange={(e) =>
                    onChange("tile_layer_attribution", e.target.value)
                  }
                  disabled={isGoogle}
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Live Preview */}
            <div className="mt-4 border border-gray-700 rounded-lg overflow-hidden">
              <AdminMapPreview
                key={`${effectiveSettings.provider}|${(
                  effectiveSettings.google_maps_api_key || ""
                ).trim()}`}
                settings={effectiveSettings as any}
              />
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {message && (
              <span className="text-sm text-gray-400">{message}</span>
            )}
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
