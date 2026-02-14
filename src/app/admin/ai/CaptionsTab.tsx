// src/app/admin/ai/CaptionsTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export type CaptionsSettings = {
  maxWords: number; // max words for both caption & alt
  strictContext: boolean; // if true, model is asked to stick closely to context
  modelId: string | null; // optional override; falls back to global model if null
};

export type CaptionsTabProps = {
  value: CaptionsSettings;
  defaultValue: CaptionsSettings;
  onChange: (next: CaptionsSettings) => void;
};

type HistoryRow = {
  id: string;
  created_at: string;
  site_name: string | null;
  images_count: number;
  model: string;
  tokens_input: number;
  tokens_output: number;
  total_tokens: number;
  cost_usd: number;
};

export default function CaptionsTab({
  value,
  defaultValue,
  onChange,
}: CaptionsTabProps) {
  // History popup state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Derived totals
  const totals = useMemo(
    () => ({
      tokens: historyRows.reduce((a, r) => a + (r.total_tokens || 0), 0),
      usd: historyRows.reduce((a, r) => a + (r.cost_usd || 0), 0),
    }),
    [historyRows]
  );

  function update<K extends keyof CaptionsSettings>(
    key: K,
    val: CaptionsSettings[K]
  ) {
    onChange({ ...value, [key]: val });
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data, error } = await supabase
        .from("ai_caption_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (e: any) {
      setHistoryError(e?.message ?? "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border p-4 bg-white/70 space-y-4">
      <h2 className="text-base font-semibold">
        Caption &amp; Alt Text Settings
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">
            Max words per caption/alt
          </label>
          <input
            type="number"
            min={3}
            max={30}
            className="w-full border rounded-xl p-3"
            value={value.maxWords}
            onChange={(e) => update("maxWords", Number(e.target.value))}
          />
          <p className="text-xs text-gray-500 mt-1">
            Keeps captions and alt text concise (recommended: 10–16 words).
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">
            Model override (optional)
          </label>
          <input
            type="text"
            className="w-full border rounded-xl p-3"
            placeholder="e.g., gpt-5, gpt-5-thinking, gpt-4o"
            value={value.modelId ?? ""}
            onChange={(e) => update("modelId", e.target.value || null)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to use the global model from the Settings tab. For
            complex image understanding, try <code>gpt-5-thinking</code>; for
            speed/cost, <code>gpt-4o-mini</code> is a good baseline.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="strictContext"
            type="checkbox"
            className="h-4 w-4"
            checked={value.strictContext}
            onChange={(e) => update("strictContext", e.target.checked)}
          />
          <label htmlFor="strictContext" className="text-sm font-medium">
            Use context article strictly
          </label>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm hover:bg-gray-50"
          onClick={openHistory}
        >
          View History
        </button>
      </div>

      {/* History modal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">Caption Generation History</h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-gray-600 hover:text-black"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {historyLoading ? (
                <div>Loading…</div>
              ) : historyError ? (
                <div className="text-sm text-red-600">{historyError}</div>
              ) : (
                <>
                  <div className="mb-3 text-sm text-gray-700">
                    <b>Total tokens:</b> {totals.tokens.toLocaleString()}{" "}
                    &nbsp;|&nbsp; <b>Total cost:</b> ${totals.usd.toFixed(4)}
                  </div>

                  <table className="w-full text-sm border">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 border">Date</th>
                        <th className="p-2 border">Site</th>
                        <th className="p-2 border">Images</th>
                        <th className="p-2 border">Model</th>
                        <th className="p-2 border">Input</th>
                        <th className="p-2 border">Output</th>
                        <th className="p-2 border">Total</th>
                        <th className="p-2 border">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id}>
                          <td className="p-2 border">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                          <td className="p-2 border">{row.site_name ?? "—"}</td>
                          <td className="p-2 border">{row.images_count}</td>
                          <td className="p-2 border">{row.model}</td>
                          <td className="p-2 border">{row.tokens_input}</td>
                          <td className="p-2 border">{row.tokens_output}</td>
                          <td className="p-2 border">{row.total_tokens}</td>
                          <td className="p-2 border">
                            ${row.cost_usd?.toFixed(4) ?? "—"}
                          </td>
                        </tr>
                      ))}
                      {historyRows.length === 0 && (
                        <tr>
                          <td
                            className="p-3 text-center text-gray-500"
                            colSpan={8}
                          >
                            No history yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
