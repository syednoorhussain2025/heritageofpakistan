"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import AdminGuard from "@/components/AdminGuard";

type Inspiration = {
  id: string;
  phrase: string;
  is_active: boolean;
  sort_order: number;
};

export default function SearchInspirationsPage() {
  const [rows, setRows] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("search_inspirations")
        .select("*")
        .order("sort_order");
      if (error) showMsg("error", error.message);
      else setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const toggleActive = async (row: Inspiration) => {
    setSaving(row.id);
    const { error } = await supabase
      .from("search_inspirations")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) showMsg("error", error.message);
    else setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    setSaving(null);
  };

  const deleteRow = async (id: string) => {
    setSaving(id);
    const { error } = await supabase.from("search_inspirations").delete().eq("id", id);
    if (error) showMsg("error", error.message);
    else setRows((prev) => prev.filter((r) => r.id !== id));
    setSaving(null);
  };

  const addPhrase = async () => {
    const phrase = newPhrase.trim();
    if (!phrase) return;
    setAdding(true);
    const maxOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order)) : 0;
    const { data, error } = await supabase
      .from("search_inspirations")
      .insert({ phrase, is_active: true, sort_order: maxOrder + 1 })
      .select()
      .single();
    if (error) showMsg("error", error.message);
    else {
      setRows((prev) => [...prev, data]);
      setNewPhrase("");
      showMsg("success", "Phrase added.");
    }
    setAdding(false);
  };

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <AdminGuard>
      <div className="bg-slate-100/70 text-slate-800 min-h-screen">
        <div className="max-w-3xl mx-auto p-1.5 md:p-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Search Inspirations</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {activeCount} active phrase{activeCount !== 1 ? "s" : ""} — 4 shown randomly when search opens
              </p>
            </div>
            <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-800 hover:underline">
              ← Back to Admin
            </Link>
          </div>

          {/* Message */}
          {message && (
            <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {message.text}
            </div>
          )}

          {/* Add new */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-300/50 p-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Add New Phrase</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPhrase()}
                placeholder="e.g. golden hour reflection"
                className="flex-1 bg-slate-100 border border-transparent text-slate-900 rounded-md px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)]"
              />
              <button
                onClick={addPhrase}
                disabled={adding || !newPhrase.trim()}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-300/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">All Phrases</h2>
              <span className="text-xs text-slate-400">{rows.length} total</span>
            </div>

            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No phrases yet.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.is_active ? "bg-emerald-400" : "bg-slate-300"}`} />
                      <span className={`text-sm truncate ${row.is_active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                        {row.phrase}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={saving === row.id}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${
                          row.is_active
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        }`}
                      >
                        {row.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteRow(row.id)}
                        disabled={saving === row.id}
                        className="px-3 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </AdminGuard>
  );
}
