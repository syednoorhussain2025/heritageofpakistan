"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminGuard from "@/components/AdminGuard";
import Icon from "@/components/Icon";
import { supabase } from "@/lib/supabase/browser";
import {
  seedDefaultSectionTypes,
  loadArchetypeRows,
  loadTemplates,
  upsertTemplate,
  type SectionTypeRow,
} from "@/modules/flow-layout/db";
import {
  ARCHETYPES,
  DEFAULT_SETTINGS,
} from "@/modules/flow-layout/default-sections";

const input =
  "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500";
const softBtn =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm";
const dangerBtn =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100";
const chip =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200";

type ArchetypeVM = SectionTypeRow & { metaName: string; metaDesc: string };

export default function TemplatesPage() {
  const [library, setLibrary] = useState<ArchetypeVM[]>([]);
  const [templates, setTemplates] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [tplId, setTplId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    setLoading(true);
    await seedDefaultSectionTypes(DEFAULT_SETTINGS);
    const rows = await loadArchetypeRows();
    const lib = rows.map((r) => {
      const meta = ARCHETYPES.find((a) => a.slug === (r.slug as any));
      return {
        ...r,
        metaName: meta?.name || r.name,
        metaDesc: meta?.description || r.slug,
      };
    });
    setLibrary(lib);
    const { rows: tRows } = await loadTemplates();
    setTemplates(tRows as any);
    setLoading(false);
  }

  useEffect(() => {
    bootstrap();
  }, []);

  async function editTemplate(id: string) {
    const { data: t } = await supabase
      .from("templates")
      .select("*")
      .eq("id", id)
      .single();
    const { data: ts } = await supabase
      .from("template_sections")
      .select("section_type_id, sort_order")
      .eq("template_id", id)
      .order("sort_order");
    setTplId(id);
    setName(t.name);
    setSlug(t.slug);
    setStack((ts || []).map((x: any) => x.section_type_id));
  }

  function addToStack(sectionTypeId: string) {
    setStack((s) => [...s, sectionTypeId]);
  }
  function removeAt(i: number) {
    setStack((s) => s.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stack.length) return;
    const a = stack.slice();
    [a[i], a[j]] = [a[j], a[i]];
    setStack(a);
  }

  async function save() {
    if (!name || !slug) return alert("Name/slug required");
    setSaving(true);
    try {
      const row = await upsertTemplate({
        id: tplId || undefined,
        name,
        slug,
        sections: stack.map((id) => ({ section_type_id: id })),
      });
      setTplId(row.id);
      const { rows: tRows } = await loadTemplates();
      setTemplates(tRows as any);
    } finally {
      setSaving(false);
    }
  }
  function newTpl() {
    setTplId(null);
    setName("");
    setSlug("");
    setStack([]);
  }

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600">
                <Icon name="listings" size={16} style={{ color: "#fff" }} />
              </span>
              <div>
                <div className="text-lg font-bold">Template Builder</div>
                <div className="text-xs text-slate-500">
                  Stack default sections to create reusable templates
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/layouts/sections" className={softBtn}>
                <Icon name="categorytax" size={14} />
                Section Settings
              </Link>
              <Link href="/admin" className={softBtn}>
                ← Back to Admin
              </Link>
            </div>
          </div>
        </div>

        {/* Body */}
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Templates list */}
          <aside className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">
                  Existing Templates
                </div>
                <button onClick={newTpl} className={softBtn}>
                  New
                </button>
              </div>
              {loading ? (
                <div className="text-sm text-slate-500">Loading…</div>
              ) : templates.length ? (
                <ul className="space-y-2">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => editTemplate(t.id)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:shadow-sm transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{t.name}</div>
                          <span className={chip}>{t.slug}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-500">No templates yet.</div>
              )}
            </div>
          </aside>

          {/* Right: Editor */}
          <section className="lg:col-span-2 space-y-6">
            {/* Meta */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-base font-semibold">Template Meta</div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="text-sm">
                  Name
                  <input
                    className={input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Slug
                  <input
                    className={input}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Library + Stack */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Library */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 text-base font-semibold">
                  Section Library (5 defaults)
                </div>
                <div className="max-h-80 overflow-auto space-y-2 pr-1">
                  {library.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">{s.metaName}</div>
                        <div className="text-xs text-slate-500">
                          {s.metaDesc}
                        </div>
                      </div>
                      <button
                        onClick={() => addToStack(s.id)}
                        className={softBtn}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stack */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 text-base font-semibold">
                  Template Sections (top → bottom)
                </div>
                {stack.length ? (
                  <ul className="space-y-2">
                    {stack.map((id, i) => {
                      const s = library.find((x) => x.id === id);
                      return (
                        <li
                          key={`${id}-${i}`}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">
                                {s?.metaName || "Unknown section"}
                              </div>
                              <div className="text-xs text-slate-500">
                                {s?.slug}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => move(i, -1)}
                                className={softBtn}
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => move(i, 1)}
                                className={softBtn}
                                title="Move down"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => removeAt(i)}
                                className={dangerBtn}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-sm text-slate-500">
                    No sections in this template yet.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button onClick={save} className={primaryBtn} disabled={saving}>
                {saving ? "Saving…" : "Save Template"}
              </button>
              <button onClick={newTpl} className={softBtn}>
                New
              </button>
            </div>
          </section>
        </main>
      </div>
    </AdminGuard>
  );
}
