"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Local UI bits */
function Btn({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-indigo-500 disabled:opacity-50 ${
        props.className ?? "bg-gray-200 text-gray-800 hover:bg-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-base font-semibold mb-1.5 text-gray-800">
        {label}
      </div>
      {children}
    </label>
  );
}
const inputStyles =
  "w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500";

/** ============ Bibliography (formerly BibliographyManager) ============ */
export default function Bibliography({ siteId }: { siteId: string | number }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bibliography_sources")
      .select("*")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });
    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [siteId]);

  async function addItem() {
    const sort_order = items.length;
    const { data, error } = await supabase
      .from("bibliography_sources")
      .insert({ site_id: siteId, title: "Untitled", sort_order })
      .select()
      .single();
    if (error) return alert(error.message);
    setItems([...items, data]);
  }

  async function updateItem(id: string, patch: any) {
    const { data, error } = await supabase
      .from("bibliography_sources")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return alert(error.message);
    setItems(items.map((it) => (it.id === id ? data : it)));
  }

  async function removeItem(id: string) {
    const { error } = await supabase
      .from("bibliography_sources")
      .delete()
      .eq("id", id);
    if (error) return alert(error.message);
    setItems(items.filter((it) => it.id !== id));
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((r) => r.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    const a = items[idx];
    const b = swap;
    await supabase
      .from("bibliography_sources")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);
    await supabase
      .from("bibliography_sources")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);
    await load();
  }

  if (loading)
    return <div className="text-gray-500">Loading Bibliography…</div>;

  return (
    <div>
      <div className="mb-4">
        <Btn
          onClick={addItem}
          className="bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Add Source
        </Btn>
      </div>

      <div className="space-y-4">
        {items.map((s, i) => (
          <div
            key={s.id}
            className="border border-gray-200 rounded-lg p-4 bg-white"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gray-600">
                Source #{i + 1}
              </div>
              <div className="flex gap-2">
                <Btn onClick={() => move(s.id, -1)}>↑</Btn>
                <Btn onClick={() => move(s.id, 1)}>↓</Btn>
                <Btn
                  onClick={() => removeItem(s.id)}
                  className="bg-red-600 text-white hover:bg-red-500"
                >
                  Delete
                </Btn>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Source Title">
                <input
                  className={inputStyles}
                  value={s.title || ""}
                  onChange={(e) => updateItem(s.id, { title: e.target.value })}
                />
              </Field>
              <Field label="Authors / Publication">
                <input
                  className={inputStyles}
                  value={s.authors || ""}
                  onChange={(e) =>
                    updateItem(s.id, { authors: e.target.value })
                  }
                />
              </Field>
              <Field label="Year">
                <input
                  className={inputStyles}
                  value={s.year || ""}
                  onChange={(e) => updateItem(s.id, { year: e.target.value })}
                />
              </Field>
              <Field label="Publisher / Website">
                <input
                  className={inputStyles}
                  value={s.publisher_or_site || ""}
                  onChange={(e) =>
                    updateItem(s.id, { publisher_or_site: e.target.value })
                  }
                />
              </Field>
              <Field label="URL">
                <input
                  className={inputStyles}
                  value={s.url || ""}
                  onChange={(e) => updateItem(s.id, { url: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <input
                  className={inputStyles}
                  value={s.notes || ""}
                  onChange={(e) => updateItem(s.id, { notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-sm text-gray-500">No sources yet.</div>
      )}
    </div>
  );
}
