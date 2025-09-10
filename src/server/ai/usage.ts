// src/server/ai/usage.ts
"use server";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

// Admin client: works in server actions without user context.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

export type LogAIUsageInput = {
  feature: string; // 'captions' | 'alt_captions' | ...
  siteId?: string | number | null;
  provider: string; // 'openai' | 'anthropic' | ...
  modelId: string;

  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number; // if not provided, input+output

  usdEstimate?: number | null; // compute here or later
  requestId?: string | null;
  durationMs?: number | null;

  metadata?: Record<string, any> | null; // flexible extras
};

export async function logAIUsage(input: LogAIUsageInput) {
  const {
    feature,
    siteId,
    provider,
    modelId,
    inputTokens = 0,
    outputTokens = 0,
    totalTokens,
    usdEstimate = null,
    requestId = null,
    durationMs = null,
    metadata = null,
  } = input;

  const payload = {
    feature,
    site_id: siteId != null ? String(siteId) : null,
    provider,
    model_id: modelId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens:
      typeof totalTokens === "number"
        ? totalTokens
        : inputTokens + outputTokens,
    usd_estimate: usdEstimate,
    request_id: requestId,
    duration_ms: durationMs,
    metadata,
  };

  const { error } = await admin.from("ai_usage_log").insert(payload);
  if (error) {
    // Keep failures non-fatal to your UX. Log and move on.
    console.error("[ai_usage_log] insert failed:", error);
  }
}
