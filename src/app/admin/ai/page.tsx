// src/app/admin/ai/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import AdminGuard from "@/components/AdminGuard";
import {
  getAISettingsAction,
  saveAISettingsAction,
  resetAISettingsAction,
} from "./actions";

type AISettings = {
  // Core model selection
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
};

export default function AISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAISettingsAction();
        if (!cancelled) {
          if (res.__tableMissing) {
            setDbReady(false);
            setSettings(DEFAULTS);
          } else {
            setSettings({ ...DEFAULTS, ...res });
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSave = useMemo(() => !saving && !loading, [saving, loading]);

  function update<K extends keyof AISettings>(key: K, value: AISettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSavedToast(null);
    try {
      await saveAISettingsAction(settings);
      setSavedToast("Settings saved.");
      // fade toast
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
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--brand-blue)" }}
            >
              AI Engine — Settings
            </h1>
            <p className="text-sm text-gray-600">
              Centralize provider/model selection, parameters, safety, logging,
              and quotas. These settings will be read by the AI engine; feature
              pages won’t need changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
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
        </header>

        {!dbReady && (
          <div className="rounded-2xl border p-4 bg-amber-50 text-amber-900">
            <div className="font-semibold mb-1">
              Heads up: settings table not found
            </div>
            <p className="text-sm">
              You can still preview and save, but persistence requires creating
              the small <code>ai_engine_settings</code> table. I can provide the
              SQL whenever you’re ready.
            </p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border p-6 animate-pulse bg-white/60">
            Loading settings…
          </div>
        ) : (
          <>
            {/* Provider & Model */}
            <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
              <h2 className="text-base font-semibold">Provider &amp; Model</h2>
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
                  <p className="text-xs text-gray-500 mt-1">
                    Engine dispatches by provider; adapters can be added without
                    touching features.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Model ID</label>
                  <input
                    className="w-full border rounded-xl p-3"
                    value={settings.modelId}
                    onChange={(e) => update("modelId", e.target.value)}
                    placeholder="e.g., gpt-4o-mini"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Provider-facing model name. Kept centrally to avoid
                    scattered edits.
                  </p>
                </div>
              </div>
            </section>

            {/* Parameters */}
            <section className="rounded-2xl border p-4 bg-white/70 space-y-3">
              <h2 className="text-base font-semibold">Generation Parameters</h2>
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
              <h2 className="text-base font-semibold">Safety &amp; Logging</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <input
                    id="redactPII"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={settings.redactPII}
                    onChange={(e) => update("redactPII", e.target.checked)}
                  />
                  <label htmlFor="redactPII" className="text-sm font-medium">
                    Redact PII in logs
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="enableLogging"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={settings.enableLogging}
                    onChange={(e) => update("enableLogging", e.target.checked)}
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
                We’ll enforce these caps in the engine when we wire quotas (next
                steps).
              </p>
            </section>

            {/* Save status */}
            <div className="min-h-6">
              {error && <div className="text-sm text-red-600">{error}</div>}
              {savedToast && (
                <div className="text-sm text-green-700">{savedToast}</div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  );
}
