// src/components/TaxonomyManager.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminGuard from "@/components/AdminGuard";

type Row = {
  id: string | number;
  name: string;
  slug: string | null;
  parent_id: string | number | null;
  description: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  icon_key: string | null;
};

type Props = {
  title: string;
  table: "categories" | "regions";
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function TaxonomyManager({ title, table }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setRows((data as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [table]);

  const parentOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name })),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) || (r.slug ?? "").includes(needle)
    );
  }, [rows, q]);

  async function createItem() {
    const baseName = "New " + (table === "categories" ? "Category" : "Region");
    const slug = slugify(baseName) + "-" + String(Date.now()).slice(-5);
    const nextOrder = rows.length;
    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .insert({
        name: baseName,
        slug,
        parent_id: null,
        description: "",
        is_active: true,
        sort_order: nextOrder,
        icon_key: null,
      } as any)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    setRows([...rows, data as Row]);
  }

  async function updateItem(id: Row["id"], patch: Partial<Row>) {
    setSaving(true);
    const { data, error } = await supabase
      .from(table)
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    setSaving(false);
    if (error) return alert(error.message);
    setRows(rows.map((r) => (r.id === id ? (data as Row) : r)));
  }

  async function removeItem(id: Row["id"]) {
    if (!confirm("Delete this item? Listings linked to it will lose the tag."))
      return;
    setSaving(true);
    const { error } = await supabase.from(table).delete().eq("id", id);
    setSaving(false);
    if (error) return alert(error.message);
    setRows(rows.filter((r) => r.id !== id));
  }

  async function move(id: Row["id"], dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = rows[idx];
    const b = swap;
    setSaving(true);
    await supabase
      .from(table)
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await supabase
      .from(table)
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    setSaving(false);
    await load();
  }

  function TreeLine({ r }: { r: Row }) {
    const children = rows.filter((x) => x.parent_id === r.id);
    return (
      <div className="border rounded-lg p-3 bg-white">
        <HeaderRow r={r} />
        {children.length > 0 && (
          <div className="pl-4 mt-2 space-y-2 border-l">
            {children
              .sort(
                (a, b) =>
                  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                  a.name.localeCompare(b.name)
              )
              .map((c) => (
                <TreeLine key={c.id} r={c} />
              ))}
          </div>
        )}
      </div>
    );
  }

  function HeaderRow({ r }: { r: Row }) {
    const [local, setLocal] = useState<Row>(r);

    useEffect(() => setLocal(r), [r]);

    return (
      <div className="grid grid-cols-1 md:grid-cols-[1fr,220px,120px,120px,auto] items-center gap-2">
        {/* Name + slug */}
        <div>
          <label className="text-xs text-gray-600">Name</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={local.name}
            onChange={(e) => setLocal({ ...local, name: e.target.value })}
            onBlur={() => {
              const patch: Partial<Row> = { name: local.name };
              // auto-slug if empty
              if (!local.slug || local.slug.trim() === "") {
                patch.slug = slugify(local.name);
              }
              updateItem(r.id, patch);
            }}
          />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-600">Slug</span>
            <input
              className="flex-1 border rounded px-2 py-1 text-xs"
              value={local.slug ?? ""}
              onChange={(e) => setLocal({ ...local, slug: e.target.value })}
              onBlur={() =>
                updateItem(r.id, { slug: slugify(local.slug ?? "") })
              }
            />
          </div>
        </div>

        {/* Parent */}
        <div>
          <label className="text-xs text-gray-600">Parent</label>
          <select
            className="w-full border rounded px-2 py-1"
            value={local.parent_id ?? ""}
            onChange={(e) => {
              const val =
                e.target.value === ""
                  ? null
                  : typeof r.id === "number"
                  ? Number(e.target.value)
                  : e.target.value;
              setLocal({ ...local, parent_id: val as any });
              updateItem(r.id, { parent_id: val as any });
            }}
          >
            <option value="">— None —</option>
            {parentOptions
              .filter((p) => p.id !== r.id) // cannot parent to itself
              .map((p) => (
                <option key={p.id} value={p.id as any}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {/* Active */}
        <div>
          <label className="text-xs text-gray-600">Active</label>
          <div className="h-[34px] flex items-center">
            <input
              type="checkbox"
              checked={!!(local.is_active ?? true)}
              onChange={(e) => {
                setLocal({ ...local, is_active: e.target.checked });
                updateItem(r.id, { is_active: e.target.checked });
              }}
            />
          </div>
        </div>

        {/* Icon key */}
        <div>
          <label className="text-xs text-gray-600">Icon key</label>
          <input
            className="w-full border rounded px-2 py-1"
            value={local.icon_key ?? ""}
            onChange={(e) => setLocal({ ...local, icon_key: e.target.value })}
            onBlur={() =>
              updateItem(r.id, { icon_key: local.icon_key ?? null })
            }
            placeholder="fort, lake, temple..."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            className="px-2 py-1 border rounded"
            onClick={() => move(r.id, -1)}
          >
            ↑
          </button>
          <button
            className="px-2 py-1 border rounded"
            onClick={() => move(r.id, 1)}
          >
            ↓
          </button>
          <button
            className="px-2 py-1 border rounded text-red-600"
            onClick={() => removeItem(r.id)}
          >
            Delete
          </button>
        </div>

        {/* Description (full width) */}
        <div className="md:col-span-5">
          <label className="text-xs text-gray-600">
            Description (optional)
          </label>
          <textarea
            className="w-full border rounded px-2 py-1"
            rows={2}
            value={local.description ?? ""}
            onChange={(e) =>
              setLocal({ ...local, description: e.target.value })
            }
            onBlur={() =>
              updateItem(r.id, { description: local.description ?? "" })
            }
          />
        </div>
      </div>
    );
  }

  /* Build a simple hierarchy (roots only shown at top, children nested in TreeLine) */
  const roots = useMemo(
    () =>
      filtered
        .filter((r) => r.parent_id == null)
        .sort(
          (a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            a.name.localeCompare(b.name)
        ),
    [filtered]
  );

  return (
    <AdminGuard>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search name or slug…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
            <button
              className="px-3 py-2 rounded bg-black text-white text-sm"
              onClick={createItem}
              disabled={saving}
            >
              + Add {table === "categories" ? "Category" : "Region"}
            </button>
          </div>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : roots.length ? (
          <div className="space-y-2">
            {roots.map((r) => (
              <TreeLine key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-700">
            No {table}. Click “Add” to create the first one.
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
