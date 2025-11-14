// src/app/admin/ai/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import {
  getAISettingsAction,
  saveAISettingsAction,
  resetAISettingsAction,
  // NEW: implement this in ./actions.ts to query ai_usage_log
  getAIUsageSummaryAction,
} from "./actions";
import CaptionsTab, { CaptionsSettings } from "./CaptionsTab";

type AISettings = {
  providerKey:
    | "openai"
    | "anthropic"
    | "google"
    | "openrouter"
    | "ollama"
    | string;
  modelId: string;

  // Generation params
  temperature: number;
  topP: number;
  jsonMode: boolean;
  maxOutputTokens: number | null;

  // Safety & logging
  redactPII: boolean;
  enableLogging: boolean;
  retentionDays: number | null;

  // Quotas
  dailyTokenCap: number | null;
  monthlyUsdCap: number | null;

  // Captions-specific
  captions?: CaptionsSettings;
};

const DEFAULTS: AISettings = {
  providerKey: "openai",
  modelId: "gpt-4o-mini",
  temperature: 0.2,
  topP: 1,
  jsonMode: true,
  maxOutputTokens: 1200,
  redactPII: true,
  enableLogging: true,
  retentionDays: 14,
  dailyTokenCap: null,
  monthlyUsdCap: null,
  captions: {
    maxWords: 12,
    strictContext: true,
    modelId: null,
  },
};

/**
 * Curated model list (OpenAI-first).
 * Includes GPT-5 “general” and “thinking” tiers plus GPT-4o family.
 * You can still type a custom string elsewhere if needed (e.g., via override fields).
 */
const MODEL_OPTIONS: { id: string; label: string; note: string }[] = [
  // ——— GPT-5 family ———
  { id: "gpt-5", label: "GPT-5", note: "General-purpose (balanced)" },
  {
    id: "gpt-5-thinking",
    label: "GPT-5 Thinking",
    note: "Best reasoning; higher latency",
  },
  {
    id: "gpt-5-thinking-mini",
    label: "GPT-5 Thinking Mini",
    note: "Reasoning, faster/cheaper",
  },
  {
    id: "gpt-5-thinking-nano",
    label: "GPT-5 Thinking Nano",
    note: "Lightweight reasoning",
  },

  // ——— GPT-4o family (kept for cost/perf balance & compatibility) ———
  { id: "gpt-4o", label: "GPT-4o", note: "Strong multimodal (balanced)" },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o-mini",
    note: "Fastest + cheapest in 4o family",
  },

  // ——— Legacy/compatibility (optional to keep) ———
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", note: "High quality (older)" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", note: "Legacy, cheap" },
];

// Types for usage summary modal
type UsageTotals = {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usd: number | null;
};

type UsageRow = {
  id?: string | number | null;
  created_at?: string | null;
  feature?: string | null;
  provider?: string | null;
  model_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  usd_estimate?: number | null;
  site_id?: string | number | null;
  metadata?: Record<string, any> | null;
};

type UsageSummaryResponse = {
  __tableMissing?: boolean;
  totals: UsageTotals;
  recent: UsageRow[];
};

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(true);

  const [activeTab, setActiveTab] = useState<"settings" | "captions">(
    "settings"
  );

  // Usage modal state
  const [showUsage, setShowUsage] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageSummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAISettingsAction();
        if (!cancelled) {
          if ((res as any).__tableMissing) {
            setDbReady(false);
            setSettings(DEFAULTS);
          } else {
            setSettings({ ...DEFAULTS, ...res });
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load usage when opening the modal
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!showUsage) return;
      setUsageLoading(true);
      setUsageError(null);
      try {
        const res = (await getAIUsageSummaryAction()) as UsageSummaryResponse;
        if (!cancelled) {
          setUsageData(res);
        }
      } catch (e: any) {
        if (!cancelled) setUsageError(e?.message ?? "Failed to load usage");
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showUsage]);

  const canSave = useMemo(() => !saving && !loading, [saving, loading]);

  function update<K extends keyof AISettings>(key: K, value: AISettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function updateCaptions(next: CaptionsSettings) {
    setSettings((s) => ({ ...s, captions: next }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSavedToast(null);
    try {
      await saveAISettingsAction(settings);
      setSavedToast("Settings saved.");
      setTimeout(() => setSavedToast(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setSaving(true);
    setError(null);
    setSavedToast(null);
    try {
      const res = await resetAISettingsAction();
      setSettings({ ...DEFAULTS, ...res });
      setSavedToast("Settings reset to defaults.");
      setTimeout(() => setSavedToast(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminGuard>
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Header & Save/Reset */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--brand-blue)" }}
            >
              AI Engine — Admin
            </h1>
            <div className="flex items-center gap-2">
              {/* View Usage button */}
              <button
                className="px-4 py-2 rounded-2xl border hover:bg-black/5"
                onClick={() => setShowUsage(true)}
                title="View aggregated AI usage (tokens & $) from ai_usage_log"
              >
                View Usage
              </button>

              <button
                className="px-4 py-2 rounded-2xl border hover:bg-black/5 disabled:opacity-50"
                onClick={onReset}
                disabled={!canSave}
                title="Reset to curated defaults"
              >
                Reset
              </button>
              <button
                className="px-4 py-2 rounded-2xl bg-black text-white hover:opacity-90 disabled:opacity-50"
                onClick={onSave}
                disabled={!canSave}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-3 border-b">
            <button
              className={`pb-2 px-2 border-b-2 ${
                activeTab === "settings"
                  ? "border-black font-semibold"
                  : "border-transparent text-gray-500"
              }`}
              onClick={() => setActiveTab("settings")}
            >
              Settings
            </button>
            <button
              className={`pb-2 px-2 border-b-2 ${
                activeTab === "captions"
                  ? "border-black font-semibold"
                  : "border-transparent text-gray-500"
              }`}
              onClick={() => setActiveTab("captions")}
            >
              Captions
            </button>
          </nav>
        </header>

        {!dbReady && (
          <div className="rounded-2xl border p-4 bg-amber-50 text-amber-900">
            <div className="font-semibold mb-1">
              Heads up: settings table not found
            </div>
            <p className="text-sm">
              You can still preview and save, but persistence requires creating
              the small <code>ai_engine_settings</code> table.
            </p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border p-6 animate-pulse bg-white/60">
            Loading…
          </div>
        ) : (
          <>
            {activeTab === "settings" && (
              <>
                {/* Provider & Model */}
                <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
                  <h2 className="text-base font-semibold">
                    Provider &amp; Model
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">Provider</label>
                      <select
                        className="w-full border rounded-xl p-3"
                        value={settings.providerKey}
                        onChange={(e) =>
                          update(
                            "providerKey",
                            e.target.value as AISettings["providerKey"]
                          )
                        }
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="ollama">Ollama (local)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Model</label>
                      <select
                        className="w-full border rounded-xl p-3"
                        value={settings.modelId}
                        onChange={(e) => update("modelId", e.target.value)}
                      >
                        {MODEL_OPTIONS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} — {m.note}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        GPT-5 “Thinking” is ideal for complex reasoning;{" "}
                        <code>gpt-5</code> and <code>gpt-4o</code> remain strong
                        general options.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Generation Parameters */}
                <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
                  <h2 className="text-base font-semibold">
                    Generation Parameters
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">Temperature</label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={2}
                        className="w-full border rounded-xl p-3"
                        value={settings.temperature}
                        onChange={(e) =>
                          update("temperature", Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Top-p</label>
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={1}
                        className="w-full border rounded-xl p-3"
                        value={settings.topP}
                        onChange={(e) => update("topP", Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        id="jsonMode"
                        type="checkbox"
                        className="h-4 w-4"
                        checked={settings.jsonMode}
                        onChange={(e) => update("jsonMode", e.target.checked)}
                      />
                      <label htmlFor="jsonMode" className="text-sm font-medium">
                        Force JSON output
                      </label>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Max output tokens (optional)
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full border rounded-xl p-3"
                        placeholder="e.g., 1200"
                        value={settings.maxOutputTokens ?? ""}
                        onChange={(e) =>
                          update(
                            "maxOutputTokens",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </div>
                  </div>
                </section>

                {/* Safety & Logging */}
                <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
                  <h2 className="text-base font-semibold">
                    Safety &amp; Logging
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <input
                        id="redactPII"
                        type="checkbox"
                        className="h-4 w-4"
                        checked={settings.redactPII}
                        onChange={(e) => update("redactPII", e.target.checked)}
                      />
                      <label
                        htmlFor="redactPII"
                        className="text-sm font-medium"
                      >
                        Redact PII in logs
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        id="enableLogging"
                        type="checkbox"
                        className="h-4 w-4"
                        checked={settings.enableLogging}
                        onChange={(e) =>
                          update("enableLogging", e.target.checked)
                        }
                      />
                      <label
                        htmlFor="enableLogging"
                        className="text-sm font-medium"
                      >
                        Enable run logging
                      </label>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Retention (days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full border rounded-xl p-3"
                        placeholder="e.g., 14"
                        value={settings.retentionDays ?? ""}
                        onChange={(e) =>
                          update(
                            "retentionDays",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    These affect only logs/observability; the AI never writes
                    directly to your domain tables.
                  </p>
                </section>

                {/* Quotas */}
                <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
                  <h2 className="text-base font-semibold">Quotas</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">
                        Daily token cap (optional)
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full border rounded-xl p-3"
                        placeholder="e.g., 100000"
                        value={settings.dailyTokenCap ?? ""}
                        onChange={(e) =>
                          update(
                            "dailyTokenCap",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Monthly USD cap (optional)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full border rounded-xl p-3"
                        placeholder="e.g., 25.00"
                        value={settings.monthlyUsdCap ?? ""}
                        onChange={(e) =>
                          update(
                            "monthlyUsdCap",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    We’ll enforce these caps in the engine when we wire quotas
                    (next steps).
                  </p>
                </section>
              </>
            )}

            {activeTab === "captions" && (
              <CaptionsTab
                value={{
                  maxWords:
                    settings.captions?.maxWords ?? DEFAULTS.captions!.maxWords,
                  strictContext:
                    settings.captions?.strictContext ??
                    DEFAULTS.captions!.strictContext,
                  modelId:
                    settings.captions?.modelId ?? DEFAULTS.captions!.modelId,
                }}
                defaultValue={DEFAULTS.captions!}
                onChange={updateCaptions}
              />
            )}
          </>
        )}

        {/* Save status */}
        <div className="min-h-6">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {savedToast && (
            <div className="text-sm text-green-700">{savedToast}</div>
          )}
        </div>
      </div>

      {/* Usage Modal */}
      {showUsage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold">AI Usage Summary</h3>
              <button
                onClick={() => setShowUsage(false)}
                className="px-2 py-1 rounded-lg border hover:bg-gray-50"
                title="Close"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4">
              {usageLoading ? (
                <div className="p-6 text-sm text-gray-600">Loading…</div>
              ) : usageError ? (
                <div className="p-4 text-sm text-red-600">{usageError}</div>
              ) : usageData?.__tableMissing ? (
                <div className="rounded-xl border p-4 bg-amber-50 text-amber-900 text-sm">
                  The <code>ai_usage_log</code> table was not found. Create it
                  to enable centralized usage reporting.
                </div>
              ) : (
                <>
                  {/* Totals */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border p-3 bg-white/70">
                      <div className="text-xs text-gray-500">Runs</div>
                      <div className="text-lg font-semibold">
                        {usageData?.totals.runs ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3 bg-white/70">
                      <div className="text-xs text-gray-500">Total Tokens</div>
                      <div className="text-lg font-semibold">
                        {usageData?.totals.totalTokens ?? 0}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        in: {usageData?.totals.inputTokens ?? 0} • out:{" "}
                        {usageData?.totals.outputTokens ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3 bg-white/70">
                      <div className="text-xs text-gray-500">Estimated USD</div>
                      <div className="text-lg font-semibold">
                        ${Number(usageData?.totals.usd ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3 bg-white/70">
                      <div className="text-xs text-gray-500">Provider</div>
                      <div className="text-lg font-semibold">Mixed</div>
                      <div className="text-[11px] text-gray-500">
                        Based on recorded logs
                      </div>
                    </div>
                  </div>

                  {/* Recent runs table */}
                  <div className="rounded-xl border overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600">
                          <th className="text-left p-2">When</th>
                          <th className="text-left p-2">Feature</th>
                          <th className="text-left p-2">Model</th>
                          <th className="text-right p-2">In</th>
                          <th className="text-right p-2">Out</th>
                          <th className="text-right p-2">Total</th>
                          <th className="text-right p-2">USD</th>
                          <th className="text-left p-2">Site</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usageData?.recent ?? []).map((r, idx) => (
                          <tr
                            key={(r.id as any) ?? idx}
                            className={idx % 2 ? "bg-white" : "bg-white/60"}
                          >
                            <td className="p-2 text-gray-700">
                              {r.created_at
                                ? new Date(r.created_at).toLocaleString()
                                : "—"}
                            </td>
                            <td className="p-2">{r.feature ?? "—"}</td>
                            <td className="p-2">
                              {r.provider ?? "?"}/{r.model_id ?? "?"}
                            </td>
                            <td className="p-2 text-right">
                              {r.input_tokens ?? 0}
                            </td>
                            <td className="p-2 text-right">
                              {r.output_tokens ?? 0}
                            </td>
                            <td className="p-2 text-right">
                              {r.total_tokens ?? 0}
                            </td>
                            <td className="p-2 text-right">
                              {r.usd_estimate != null
                                ? `$${Number(r.usd_estimate).toFixed(4)}`
                                : "—"}
                            </td>
                            <td className="p-2">
                              {r.site_id != null ? String(r.site_id) : "—"}
                            </td>
                          </tr>
                        ))}
                        {(!usageData?.recent ||
                          usageData.recent.length === 0) && (
                          <tr>
                            <td
                              colSpan={8}
                              className="p-4 text-center text-gray-500"
                            >
                              No usage recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[11px] text-gray-500">
                    Totals reflect data in <code>ai_usage_log</code>. For
                    provider-verified billing, consult the provider dashboard.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
