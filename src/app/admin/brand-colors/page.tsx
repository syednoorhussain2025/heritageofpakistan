"use client";

import { useEffect, useState, useCallback } from "react";

type BrandColors = {
  brand_green: string;
  brand_orange: string;
  brand_blue: string;
  brand_black: string;
  brand_dark_grey: string;
  brand_light_grey: string;
  brand_very_light_grey: string;
  brand_illustration: string;
};

const DEFAULTS: BrandColors = {
  brand_green:           "#00b78b",
  brand_orange:          "#F78300",
  brand_blue:            "#1c1f4c",
  brand_black:           "#111111",
  brand_dark_grey:       "#2d2d2d",
  brand_light_grey:      "#efefef",
  brand_very_light_grey: "#f5f5f5",
  brand_illustration:    "#00b78b",
};

const LABELS: Record<keyof BrandColors, string> = {
  brand_green:           "Brand Green",
  brand_orange:          "Brand Orange",
  brand_blue:            "Brand Blue",
  brand_black:           "Brand Black",
  brand_dark_grey:       "Brand Dark Grey",
  brand_light_grey:      "Brand Light Grey",
  brand_very_light_grey: "Brand Very Light Grey",
  brand_illustration:    "Illustrations Color",
};

const DESCRIPTIONS: Record<keyof BrandColors, string> = {
  brand_green:           "Primary action color — buttons, headers, badges, links",
  brand_orange:          "Secondary accent — heritage type badges, map pins, admin UI",
  brand_blue:            "Dark headings, navy backgrounds, deep text",
  brand_black:           "Icon color, logo, matte black elements",
  brand_dark_grey:       "Body text, nav labels",
  brand_light_grey:      "Panel backgrounds, dividers, chevrons",
  brand_very_light_grey: "Page background, very subtle fills",
  brand_illustration:    "SVG illustration accent color — changes all empty-state graphics",
};

function isValidHex(v: string) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function ColorPicker({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [hex, setHex] = useState(value);
  const valid = isValidHex(hex);

  useEffect(() => { setHex(value); }, [value]);

  function commit(v: string) {
    if (isValidHex(v)) onChange(v);
  }

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
      {/* Color swatch + native picker */}
      <div className="relative shrink-0">
        <div
          className="w-12 h-12 rounded-xl border border-gray-200 shadow-sm cursor-pointer overflow-hidden"
          style={{ backgroundColor: valid ? hex : value }}
        >
          <input
            type="color"
            value={valid ? hex : value}
            onChange={(e) => { setHex(e.target.value); onChange(e.target.value); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>
      </div>

      {/* Hex input */}
      <div className="shrink-0">
        <input
          type="text"
          value={hex}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setHex(v);
            if (isValidHex(v)) onChange(v);
          }}
          onBlur={() => { if (!valid) setHex(value); }}
          maxLength={7}
          className={`w-28 px-3 py-2 text-sm font-mono rounded-lg border outline-none transition-colors ${
            valid
              ? "border-gray-200 focus:border-gray-400"
              : "border-red-300 focus:border-red-400 text-red-500"
          }`}
          placeholder="#000000"
        />
      </div>

      {/* Reset to default */}
      {value !== DEFAULTS[label as keyof BrandColors] && (
        <button
          onClick={() => { const d = DEFAULTS[label as keyof BrandColors]; setHex(d); onChange(d); }}
          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
          title="Reset to default"
        >
          Reset
        </button>
      )}
    </div>
  );
}

export default function BrandColorsPage() {
  const [colors, setColors] = useState<BrandColors>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live-preview: update CSS variables on the page as user changes values
  const applyPreview = useCallback((c: BrandColors) => {
    const root = document.documentElement;
    root.style.setProperty("--brand-green",           c.brand_green);
    root.style.setProperty("--brand-orange",          c.brand_orange);
    root.style.setProperty("--brand-blue",            c.brand_blue);
    root.style.setProperty("--brand-black",           c.brand_black);
    root.style.setProperty("--brand-dark-grey",       c.brand_dark_grey);
    root.style.setProperty("--brand-light-grey",      c.brand_light_grey);
    root.style.setProperty("--brand-very-light-grey", c.brand_very_light_grey);
    root.style.setProperty("--brand-illustration",    c.brand_illustration);
  }, []);

  useEffect(() => {
    fetch("/api/brand-colors")
      .then((r) => r.json())
      .then((data) => {
        const merged = { ...DEFAULTS, ...data };
        setColors(merged);
        applyPreview(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applyPreview]);

  function update(key: keyof BrandColors, value: string) {
    const next = { ...colors, [key]: value };
    setColors(next);
    applyPreview(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(colors),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    setColors(DEFAULTS);
    applyPreview(DEFAULTS);
    setSaved(false);
  }

  const hasChanges = JSON.stringify(colors) !== JSON.stringify(DEFAULTS);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Brand Colors</h1>
        <p className="text-sm text-gray-500 mt-1">
          Changes apply instantly across the entire webapp. Save to persist across deployments.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Color pickers */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5">
            {(Object.keys(LABELS) as (keyof BrandColors)[]).map((key) => (
              <ColorPicker
                key={key}
                label={LABELS[key]}
                description={DESCRIPTIONS[key]}
                value={colors[key]}
                onChange={(v) => update(key, v)}
              />
            ))}
          </div>

          {/* Preview strip */}
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Live Preview</p>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(colors) as (keyof BrandColors)[]).map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-gray-100 shadow-sm"
                    style={{ backgroundColor: colors[key] }}
                  />
                  <span className="text-xs text-gray-500">{LABELS[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              onClick={resetAll}
              disabled={!hasChanges || saving}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Reset all to defaults
            </button>

            <div className="flex items-center gap-3">
              {error && <p className="text-sm text-red-500">{error}</p>}
              {saved && <p className="text-sm text-green-600 font-medium">Saved ✓</p>}
              <button
                onClick={save}
                disabled={saving}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60"
                style={{ backgroundColor: "var(--brand-green)" }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
