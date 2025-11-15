"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import {
  seedDefaultSectionTypes,
  loadArchetypeRows,
  updateArchetypeSettings,
  SectionTypeRow,
} from "@/modules/flow-layout/db";
import {
  ARCHETYPES,
  DEFAULT_SETTINGS,
  type SectionSettings,
  type ArchetypeSlug,
} from "@/modules/flow-layout/default-sections";

const input =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
const softBtn =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm";

type RowVM = SectionTypeRow & { slug: ArchetypeSlug };

export default function SectionSettingsPage() {
  const [rows, setRows] = useState<RowVM[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<SectionSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    setLoading(true);
    await seedDefaultSectionTypes(DEFAULT_SETTINGS);
    const archetypes = await loadArchetypeRows();
    const vm = archetypes.map((r) => ({ ...r, slug: r.slug as ArchetypeSlug }));
    setRows(vm);
    if (vm[0]) {
      setActiveId(vm[0].id);
      setForm(vm[0].config_json);
    }
    setLoading(false);
  }

  useEffect(() => {
    bootstrap();
  }, []);

  const active = useMemo(
    () => rows.find((r) => r.id === activeId) || null,
    [rows, activeId]
  );

  function selectRow(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setActiveId(id);
    setForm(r.config_json);
  }

  async function save() {
    if (!active || !form) return;
    setSaving(true);
    try {
      const updated = await updateArchetypeSettings(active.id, form);
      setRows((prev) =>
        prev.map((r) =>
          r.id === active.id ? { ...r, config_json: updated.config_json } : r
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600">
                <Icon name="categorytax" size={16} style={{ color: "#fff" }} />
              </span>
              <div>
                <div className="text-lg font-bold">Section Settings</div>
                <div className="text-xs text-slate-500">
                  Global spacing & background for default sections
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/layouts/templates" className={softBtn}>
                <Icon name="listings" size={14} />
                Templates
              </Link>
              <Link href="/admin" className={softBtn}>
                ← Back to Admin
              </Link>
            </div>
          </div>
        </div>

        {/* Body */}
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: list */}
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-700">
                Default Sections
              </div>
              {loading ? (
                <div className="text-sm text-slate-500">Loading…</div>
              ) : (
                <ul className="space-y-2">
                  {rows.map((r) => {
                    const meta = ARCHETYPES.find((a) => a.slug === r.slug);
                    const activeCls =
                      r.id === activeId
                        ? "ring-2 ring-emerald-500"
                        : "hover:shadow-sm";
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => selectRow(r.id)}
                          className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition ${activeCls}`}
                        >
                          <div className="font-medium">
                            {meta?.name || r.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {meta?.description || r.slug}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Right: editor */}
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {active && form ? (
                <>
                  <div className="mb-4">
                    <div className="text-base font-semibold">{active.name}</div>
                    <div className="text-xs text-slate-500">{active.slug}</div>
                  </div>

                  {/* Spacing controls */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <label className="text-sm">
                      Padding Y (px)
                      <input
                        type="number"
                        className={input}
                        value={form.paddingY ?? 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            paddingY: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Margin Y (px)
                      <input
                        type="number"
                        className={input}
                        value={form.marginY ?? 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            marginY: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid md:grid-cols-3 gap-4">
                    <label className="text-sm">
                      Max Width (px)
                      <input
                        type="number"
                        className={input}
                        value={form.maxWidth ?? 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxWidth: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Gutter (px)
                      <input
                        type="number"
                        className={input}
                        value={form.gutter ?? 0}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            gutter: Number(e.target.value || 0),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Background
                      <select
                        className={input}
                        value={form.background ?? "white"}
                        onChange={(e) =>
                          setForm({ ...form, background: e.target.value })
                        }
                      >
                        <option value="white">White</option>
                        <option value="gray-50">Light Gray</option>
                        <option value="transparent">Transparent</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    <button
                      onClick={save}
                      className={primaryBtn}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save Settings"}
                    </button>
                    <button
                      onClick={() => setForm(active.config_json)}
                      className={softBtn}
                      type="button"
                    >
                      Revert
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">
                  Select a section to edit settings.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </AdminGuard>
  );
}
