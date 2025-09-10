// src/app/admin/ai/actions.ts
// Server actions for AI Settings (read/save/reset).
"use server";

import { createClient } from "@supabase/supabase-js";

/* ----------------------------- Types ----------------------------- */

type AISettings = {
  providerKey: string;
  modelId: string;

  temperature: number;
  topP: number;
  jsonMode: boolean;
  maxOutputTokens: number | null;

  redactPII: boolean;
  enableLogging: boolean;
  retentionDays: number | null;

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

/* ------------------------- Supabase (server) ---------------------- */

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error(
      "Supabase service environment variables are not configured."
    );
  }
  return createClient(url, key);
}

/* ----------------------------- Actions --------------------------- */

/**
 * Reads settings from public.ai_engine_settings (row keyed by scope='admin').
 * If table doesn't exist, returns defaults and a flag so UI can show a warning.
 */
export async function getAISettingsAction(): Promise<
  AISettings & { __tableMissing?: boolean }
> {
  const supabase = svc();

  // Try select; if table missing, bubble a specific marker
  const { data, error } = await supabase
    .from("ai_engine_settings")
    .select("data")
    .eq("scope", "admin")
    .maybeSingle();

  if (error) {
    // 42P01 = undefined_table
    if ((error as any).code === "42P01") {
      return { ...DEFAULTS, __tableMissing: true };
    }
    throw new Error(error.message);
  }

  const payload = (data?.data as AISettings) ?? DEFAULTS;
  // Merge with defaults to be forward-compatible with new fields
  return { ...DEFAULTS, ...payload };
}

/**
 * Saves settings into public.ai_engine_settings via upsert.
 * If table is missing, returns a clear error so the UI can prompt to run SQL.
 */
export async function saveAISettingsAction(input: AISettings) {
  const supabase = svc();

  // Basic validation
  if (!input.providerKey?.trim()) throw new Error("Provider is required.");
  if (!input.modelId?.trim()) throw new Error("Model ID is required.");

  const { error } = await supabase.from("ai_engine_settings").upsert(
    {
      scope: "admin",
      data: input,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope" }
  );

  if (error) {
    if ((error as any).code === "42P01") {
      throw new Error(
        "Settings table not found. Please run the ai_engine_settings SQL migration and try again."
      );
    }
    throw new Error(error.message);
  }

  return { ok: true };
}

/**
 * Resets settings to curated defaults (and persists them if table exists).
 */
export async function resetAISettingsAction(): Promise<AISettings> {
  const supabase = svc();

  const { error } = await supabase.from("ai_engine_settings").upsert(
    {
      scope: "admin",
      data: DEFAULTS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope" }
  );

  if (error) {
    if ((error as any).code === "42P01") {
      // Table missing → return defaults to the UI; user can run SQL later.
      return DEFAULTS;
    }
    throw new Error(error.message);
  }

  return DEFAULTS;
}
