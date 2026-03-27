"use client";

import { useEffect, useState, useCallback } from "react";
import AdminGuard from "@/components/AdminGuard";
import { createClient } from "@/lib/supabase/browser";

type TagValue = {
  id: string;
  dimension_id: string;
  value: string;
  sort_order: number;
  is_active: boolean;
};

type Dimension = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_multi: boolean;
  ai_enabled: boolean;
  sort_order: number;
  values: TagValue[];
};

export default function ImageTagsPage() {
  const supabase = createClient();
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // id of item being saved

  // New dimension form
  const [newDimName, setNewDimName] = useState("");
  const [newDimDesc, setNewDimDesc] = useState("");
  const [newDimAi, setNewDimAi] = useState(true);
  const [addingDim, setAddingDim] = useState(false);

  // New value inputs per dimension: dimId → input string
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: dims }, { data: vals }] = await Promise.all([
      supabase.from("photo_tag_dimensions").select("*").order("sort_order"),
      supabase.from("photo_tag_values").select("*").order("sort_order"),
    ]);
    const merged: Dimension[] = (dims ?? []).map((d: any) => ({
      ...d,
      values: (vals ?? []).filter((v: any) => v.dimension_id === d.id),
    }));
    setDimensions(merged);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  /* ── Dimension actions ── */

  async function addDimension() {
    if (!newDimName.trim()) return;
    setAddingDim(true);
    const slug = newDimName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const maxOrder = Math.max(0, ...dimensions.map((d) => d.sort_order)) + 1;
    const { error } = await supabase.from("photo_tag_dimensions").insert({
      name: newDimName.trim(),
      slug,
      description: newDimDesc.trim() || null,
      ai_enabled: newDimAi,
      sort_order: maxOrder,
    });
    if (error) { alert(error.message); setAddingDim(false); return; }
    setNewDimName("");
    setNewDimDesc("");
    setNewDimAi(true);
    setAddingDim(false);
    await load();
  }

  async function toggleAiEnabled(dim: Dimension) {
    setSaving(dim.id);
    await supabase
      .from("photo_tag_dimensions")
      .update({ ai_enabled: !dim.ai_enabled })
      .eq("id", dim.id);
    setSaving(null);
    await load();
  }

  async function deleteDimension(dim: Dimension) {
    if (!confirm(`Delete dimension "${dim.name}" and ALL its values? This also deletes all photo tags in this dimension.`)) return;
    setSaving(dim.id);
    await supabase.from("photo_tag_dimensions").delete().eq("id", dim.id);
    setSaving(null);
    await load();
  }

  /* ── Value actions ── */

  async function addValue(dim: Dimension) {
    const val = (newValueInputs[dim.id] ?? "").trim();
    if (!val) return;
    setSaving(dim.id);
    const maxOrder = Math.max(0, ...dim.values.map((v) => v.sort_order)) + 1;
    const { error } = await supabase.from("photo_tag_values").insert({
      dimension_id: dim.id,
      value: val,
      sort_order: maxOrder,
      is_active: true,
    });
    if (error) { alert(error.message); setSaving(null); return; }
    setNewValueInputs((prev) => ({ ...prev, [dim.id]: "" }));
    setSaving(null);
    await load();
  }

  async function toggleValueActive(val: TagValue) {
    setSaving(val.id);
    await supabase
      .from("photo_tag_values")
      .update({ is_active: !val.is_active })
      .eq("id", val.id);
    setSaving(null);
    await load();
  }

  async function deleteValue(val: TagValue) {
    if (!confirm(`Delete tag value "${val.value}"? This removes it from all photos too.`)) return;
    setSaving(val.id);
    await supabase.from("photo_tag_values").delete().eq("id", val.id);
    setSaving(null);
    await load();
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Image Tags</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage tag dimensions and vocabulary used by AI and manual tagging.
              </p>
            </div>
            <a href="/admin" className="text-sm text-gray-500 hover:text-gray-800 underline">
              ← Admin
            </a>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> AI-enabled dimension
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" /> Manual-only dimension
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Active value
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Inactive value
            </span>
          </div>

          {loading ? (
            <div className="text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="space-y-4">
              {dimensions.map((dim) => (
                <div key={dim.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Dimension header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dim.ai_enabled ? "bg-blue-500" : "bg-gray-300"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-gray-800 text-sm">{dim.name}</span>
                      <span className="ml-2 text-[11px] text-gray-400 font-mono">{dim.slug}</span>
                      {dim.description && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{dim.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleAiEnabled(dim)}
                        disabled={saving === dim.id}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                          dim.ai_enabled
                            ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                            : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {dim.ai_enabled ? "AI on" : "AI off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDimension(dim)}
                        disabled={saving === dim.id}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Values */}
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {dim.values.map((v) => (
                        <span
                          key={v.id}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] border transition-opacity ${
                            v.is_active
                              ? "bg-gray-100 border-gray-200 text-gray-700"
                              : "bg-gray-50 border-gray-100 text-gray-400 opacity-60"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${v.is_active ? "bg-green-400" : "bg-gray-300"}`}
                          />
                          {v.value}
                          <button
                            type="button"
                            onClick={() => toggleValueActive(v)}
                            disabled={saving === v.id}
                            className="ml-0.5 text-gray-400 hover:text-gray-600 text-[10px]"
                            title={v.is_active ? "Deactivate" : "Activate"}
                          >
                            {v.is_active ? "○" : "●"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteValue(v)}
                            disabled={saving === v.id}
                            className="text-gray-300 hover:text-red-500 text-[11px] leading-none"
                            title="Delete value"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add value input */}
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => { e.preventDefault(); void addValue(dim); }}
                    >
                      <input
                        type="text"
                        placeholder="Add new value…"
                        value={newValueInputs[dim.id] ?? ""}
                        onChange={(e) =>
                          setNewValueInputs((prev) => ({ ...prev, [dim.id]: e.target.value }))
                        }
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={!newValueInputs[dim.id]?.trim() || saving === dim.id}
                        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new dimension */}
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Add New Dimension</h2>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Dimension name (e.g. Shot Composition)"
                value={newDimName}
                onChange={(e) => setNewDimName(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newDimDesc}
                onChange={(e) => setNewDimDesc(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDimAi}
                    onChange={(e) => setNewDimAi(e.target.checked)}
                    className="rounded"
                  />
                  AI-enabled (AI will tag photos using this dimension)
                </label>
                <button
                  type="button"
                  onClick={() => void addDimension()}
                  disabled={!newDimName.trim() || addingDim}
                  className="ml-auto px-4 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40"
                >
                  {addingDim ? "Adding…" : "Add Dimension"}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AdminGuard>
  );
}
