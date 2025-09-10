// src/app/admin/ai/actions.ts
// Server actions for AI Settings (read/save/reset) + Usage summary.
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

export type UsageSummaryResponse = {
  __tableMissing?: boolean;
  totals: UsageTotals;
  recent: UsageRow[];
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
  return { ...DEFAULTS, ...payload };
}

/**
 * Saves settings into public.ai_engine_settings via upsert.
 * If table is missing, returns a clear error so the UI can prompt to run SQL.
 */
export async function saveAISettingsAction(input: AISettings) {
  const supabase = svc();

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
      return DEFAULTS;
    }
    throw new Error(error.message);
  }

  return DEFAULTS;
}

/* ----------------------- Usage Summary (NEW) ---------------------- */

/**
 * Fetches aggregated usage from public.ai_usage_log:
 * - Totals across all rows (tokens & USD)
 * - Recent 50 runs (ordered by created_at desc)
 *
 * Keeps it simple by scanning in pages (1k rows/page, up to 20k rows).
 * If the table is missing, returns __tableMissing for the UI to warn.
 */
export async function getAIUsageSummaryAction(): Promise<UsageSummaryResponse> {
  const supabase = svc();

  // Helper: fetch all usage rows in pages (lightweight column projection)
  async function fetchAllUsageRows(
    pageSize = 1000,
    maxPages = 20
  ): Promise<UsageRow[]> {
    const rows: UsageRow[] = [];
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("ai_usage_log")
        .select(
          "id, created_at, feature, provider, model_id, input_tokens, output_tokens, total_tokens, usd_estimate, site_id"
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        // 42P01 = undefined_table
        if ((error as any).code === "42P01") {
          return Promise.reject({ code: "42P01" });
        }
        throw new Error(error.message);
      }

      if (!data || data.length === 0) break;
      rows.push(...data);

      if (data.length < pageSize) break; // last page
    }
    return rows;
  }

  try {
    // Get recent 50 for the table view
    const { data: recent, error: recentErr } = await supabase
      .from("ai_usage_log")
      .select(
        "id, created_at, feature, provider, model_id, input_tokens, output_tokens, total_tokens, usd_estimate, site_id"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (recentErr) {
      if ((recentErr as any).code === "42P01") {
        return {
          __tableMissing: true,
          totals: {
            runs: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usd: 0,
          },
          recent: [],
        };
      }
      throw new Error(recentErr.message);
    }

    // Totals: scan in pages (simple, robust for now)
    const all = await fetchAllUsageRows();

    const totals: UsageTotals = all.reduce<UsageTotals>(
      (acc, r) => {
        acc.runs += 1;
        acc.inputTokens += r.input_tokens ?? 0;
        acc.outputTokens += r.output_tokens ?? 0;
        acc.totalTokens += r.total_tokens ?? 0;
        const usd = r.usd_estimate ?? 0;
        acc.usd = (acc.usd ?? 0) + usd;
        return acc;
      },
      { runs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, usd: 0 }
    );

    return {
      totals: {
        ...totals,
        usd: totals.usd ?? 0,
      },
      recent: recent ?? [],
    };
  } catch (err: any) {
    if (err?.code === "42P01") {
      return {
        __tableMissing: true,
        totals: {
          runs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          usd: 0,
        },
        recent: [],
      };
    }
    throw new Error(err?.message ?? "Failed to load usage summary");
  }
}
