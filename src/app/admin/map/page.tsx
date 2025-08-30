// src/app/admin/map/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import IconPickerModal from "@/components/IconPickerModal";

// NOTE: Avoid cross-module type collisions by using a distinct local prop type.
// We also relax the dynamic() typing to { settings: any } to prevent mismatch.
const AdminMapPreview = dynamic<{ settings: any }>(() => import("./preview"), {
  ssr: false,
});

/* ────────────────────────────────────────────────────────────────
 * Local Types (renamed to avoid collisions with ./preview exports)
 * ──────────────────────────────────────────────────────────────── */
type AdminMapProvider = "osm" | "google";

type AdminMapSettings = {
  // Base map selection
  provider?: AdminMapProvider; // default "osm"
  google_maps_api_key?: string | null; // used when provider === "google"

  // ORIGINAL fields (names preserved)
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

  tile_layer_url: string; // OSM only
  tile_layer_attribution: string; // OSM only

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
 * Pin Preview (same visual logic as your original)
 * ──────────────────────────────────────────────────────────────── */
const PinPreview = ({ settings }: { settings: AdminMapSettings }) => {
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
export default function AdminMapSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [allIcons, setAllIcons] = useState<IconRow[]>([]);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  // Defaults (kept from your original; provider defaults included)
  const [settings, setSettings] = useState<AdminMapSettings>({
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
        .eq("key", "map_settings")
        .maybeSingle();

      if (data?.value) {
        // Merge so newly introduced fields (provider/api key) keep defaults if absent.
        setSettings((prev) => ({
          ...prev,
          ...(data.value as Partial<AdminMapSettings>),
        }));
      }

      const { data: iconData } = await supabase
        .from("icons")
        .select("name, svg_content");
      setAllIcons((iconData as IconRow[]) || []);

      setLoading(false);
    })();
  }, []);

  const onChange = (key: keyof AdminMapSettings, value: any) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const effective = { ...settings, provider: settings.provider ?? "osm" };
      if (effective.provider === "google" && !effective.google_maps_api_key) {
        throw new Error("Please provide a Google Maps API Key.");
      }
      const { error } = await supabase
        .from("global_settings")
        .upsert(
          { key: "map_settings", value: effective },
          { onConflict: "key" }
        );
      if (error) throw error;
      setSettings(effective);
      setMessage("Map settings saved successfully.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("global_settings")
      .select("value")
      .eq("key", "map_settings")
      .maybeSingle();
    if (data?.value) {
      setSettings((prev) => ({
        ...prev,
        ...(data.value as Partial<AdminMapSettings>),
      }));
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen p-6">
        Loading map settings…
      </div>
    );
  }

  const isGoogle = (settings.provider ?? "osm") === "google";
  const effectiveSettings: AdminMapSettings = {
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
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">Map Settings</h1>
            <Link
              href="/admin"
              className="text-sm text-blue-400 hover:underline"
            >
              ← Back to Admin
            </Link>
          </div>

          {/* Base Map Provider */}
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
                    onChange("provider", e.target.value as AdminMapProvider)
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

            {/* OSM tile config (visible, disabled when Google is chosen) */}
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

          {/* Pin Styling */}
          <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
              Pin Styling
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Style Pin
                </label>
                <select
                  value={settings.pin_style}
                  onChange={(e) => onChange("pin_style", e.target.value)}
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                >
                  <option value="icon_only">Only Icon</option>
                  <option value="icon_in_circle">
                    Icon in a Circle (with optional border)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Icon Source
                </label>
                <select
                  value={settings.icon_source}
                  onChange={(e) => onChange("icon_source", e.target.value)}
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                >
                  <option value="global">Global Icon (for all sites)</option>
                  <option value="category">Icon from Main Category</option>
                </select>
              </div>
            </div>

            {/* icon_only controls */}
            {settings.pin_style === "icon_only" && (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Global Icon
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsIconPickerOpen(true)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg hover:border-blue-500 text-left"
                  >
                    <Icon name={settings.pin_icon_name} size={20} />
                    <span className="flex-1">{settings.pin_icon_name}</span>
                    <span className="text-gray-400">Change</span>
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Icon Color
                  </label>
                  <input
                    type="color"
                    value={settings.pin_color}
                    onChange={(e) => onChange("pin_color", e.target.value)}
                    className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                  />
                </div>
              </div>
            )}

            {/* icon_in_circle controls */}
            {settings.pin_style === "icon_in_circle" && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Global Icon
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsIconPickerOpen(true)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-white bg-gray-700 border border-gray-600 rounded-lg hover:border-blue-500 text-left"
                  >
                    <Icon name={settings.pin_icon_name} size={20} />
                    <span className="flex-1">{settings.pin_icon_name}</span>
                    <span className="text-gray-400">Change</span>
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Icon Size (px)
                  </label>
                  <input
                    type="number"
                    value={settings.pin_icon_size}
                    onChange={(e) =>
                      onChange("pin_icon_size", parseInt(e.target.value, 10))
                    }
                    className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Icon Color (in circle)
                  </label>
                  <input
                    type="color"
                    value={settings.pin_icon_color_in_circle}
                    onChange={(e) =>
                      onChange("pin_icon_color_in_circle", e.target.value)
                    }
                    className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Circle Color
                  </label>
                  <input
                    type="color"
                    value={settings.pin_circle_color}
                    onChange={(e) =>
                      onChange("pin_circle_color", e.target.value)
                    }
                    className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Circle Size (px)
                  </label>
                  <input
                    type="number"
                    value={settings.pin_circle_size}
                    onChange={(e) =>
                      onChange("pin_circle_size", parseInt(e.target.value, 10))
                    }
                    className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Border Color
                  </label>
                  <input
                    type="color"
                    value={settings.pin_border_color}
                    onChange={(e) =>
                      onChange("pin_border_color", e.target.value)
                    }
                    className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Border Thickness (px)
                  </label>
                  <input
                    type="number"
                    placeholder="0 for no border"
                    value={settings.pin_border_thickness}
                    onChange={(e) =>
                      onChange(
                        "pin_border_thickness",
                        parseInt(e.target.value, 10)
                      )
                    }
                    className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Pin Preview
              </label>
              <div className="flex items-center justify-center h-20 p-2 bg-gray-700/50 rounded-lg">
                <PinPreview settings={settings} />
              </div>
            </div>
          </div>

          {/* Tooltip Styling */}
          <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
              Tooltip Styling
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Background
                </label>
                <input
                  type="color"
                  value={settings.tooltip_background_color}
                  onChange={(e) =>
                    onChange("tooltip_background_color", e.target.value)
                  }
                  className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Text Color
                </label>
                <input
                  type="color"
                  value={settings.tooltip_text_color}
                  onChange={(e) =>
                    onChange("tooltip_text_color", e.target.value)
                  }
                  className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Border Color
                </label>
                <input
                  type="color"
                  value={settings.tooltip_border_color}
                  onChange={(e) =>
                    onChange("tooltip_border_color", e.target.value)
                  }
                  className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Font Family
                </label>
                <input
                  type="text"
                  placeholder="e.g., sans-serif"
                  value={settings.tooltip_font_family}
                  onChange={(e) =>
                    onChange("tooltip_font_family", e.target.value)
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  value={settings.tooltip_font_size}
                  onChange={(e) =>
                    onChange("tooltip_font_size", parseInt(e.target.value, 10))
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Font Weight
                </label>
                <select
                  value={settings.tooltip_font_weight}
                  onChange={(e) =>
                    onChange("tooltip_font_weight", e.target.value)
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                >
                  <option value="300">Light</option>
                  <option value="400">Normal</option>
                  <option value="600">Semibold</option>
                  <option value="700">Bold</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Border Radius (px)
                </label>
                <input
                  type="number"
                  value={settings.tooltip_border_radius}
                  onChange={(e) =>
                    onChange(
                      "tooltip_border_radius",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Border Thickness (px)
                </label>
                <input
                  type="number"
                  value={settings.tooltip_border_thickness}
                  onChange={(e) =>
                    onChange(
                      "tooltip_border_thickness",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Cluster & Map View */}
          <div className="bg-gray-800 rounded-xl shadow-md p-5 space-y-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
              Cluster &amp; Map View
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Cluster Color
                </label>
                <input
                  type="color"
                  value={settings.cluster_color}
                  onChange={(e) => onChange("cluster_color", e.target.value)}
                  className="w-full h-10 bg-gray-700 border-gray-600 rounded-lg p-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Cluster Distance (px)
                </label>
                <input
                  type="number"
                  value={settings.cluster_max_radius}
                  onChange={(e) =>
                    onChange("cluster_max_radius", parseInt(e.target.value, 10))
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Disable Clustering at Zoom
                </label>
                <input
                  type="number"
                  value={settings.disable_clustering_at_zoom}
                  onChange={(e) =>
                    onChange(
                      "disable_clustering_at_zoom",
                      parseInt(e.target.value, 10)
                    )
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Default Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={settings.default_center_lat}
                  onChange={(e) =>
                    onChange("default_center_lat", parseFloat(e.target.value))
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Default Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={settings.default_center_lng}
                  onChange={(e) =>
                    onChange("default_center_lng", parseFloat(e.target.value))
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Default Zoom
                </label>
                <input
                  type="number"
                  value={settings.default_zoom}
                  onChange={(e) =>
                    onChange("default_zoom", parseInt(e.target.value, 10))
                  }
                  className="w-full bg-gray-700 border-gray-600 text-white rounded-lg px-3 py-2"
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
              <button
                onClick={onReset}
                className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600"
              >
                Reset
              </button>
              {message && (
                <span className="text-sm text-gray-400">{message}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
