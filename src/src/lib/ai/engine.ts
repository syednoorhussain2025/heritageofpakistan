// src/lib/ai/engine.ts
// Minimal, server-only AI engine: provider adapter + inline profiles/prompts + runner.
// Secure by design: cannot be imported by client (uses 'server-only').

import "server-only";

type Role = "system" | "user" | "assistant";
type Message = { role: Role; content: string };

type RunResult = {
  output: any;
  tokensInput?: number;
  tokensOutput?: number;
  usdCost?: number;
  raw?: any;
};

type Profile = {
  slug: string;
  providerKey: "openai"; // extend later: | "anthropic" | "google" | "openrouter" | "ollama"
  modelId: string;
  label: string;
  temperature?: number;
  topP?: number;
  jsonMode?: boolean;
  maxOutputTokens?: number | null;
  systemPromptSlug?: string | null;
};

type PromptVersion = {
  version: number;
  role: Role;
  content: string; // supports {{vars}}
  isActive: boolean;
};

type Prompt = {
  slug: string;
  description?: string;
  versions: PromptVersion[];
};

// ─────────────────────────────────────────────
// 1) Tiny templater

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const val = key
      .split(".")
      .reduce((acc, k) => (acc ? (acc as any)[k] : undefined), vars);
    return typeof val === "string" ? val : JSON.stringify(val ?? "");
  });
}

// ─────────────────────────────────────────────
// 2) Inline profiles & prompts (DB optional later)

const PROFILES: Profile[] = [
  {
    slug: "content-drafter@v1",
    providerKey: "openai",
    modelId: "gpt-4o-mini",
    label: "Draft heritage content (JSON)",
    temperature: 0.2,
    topP: 1,
    jsonMode: true,
    maxOutputTokens: 1200,
    systemPromptSlug: "system-default",
  },
  {
    slug: "captioner@v1",
    providerKey: "openai",
    modelId: "gpt-4o-mini",
    label: "Generate concise captions (JSON)",
    temperature: 0.3,
    jsonMode: true,
    maxOutputTokens: 400,
    systemPromptSlug: "system-default",
  },
];

const PROMPTS: Prompt[] = [
  {
    slug: "system-default",
    description: "General safety & output discipline",
    versions: [
      {
        version: 1,
        role: "system",
        content:
          "You are a careful assistant for a heritage & travel website. Prefer facts from user-provided text. If unsure, say 'unknown'. When asked for JSON, output strictly valid JSON with no prose.",
        isActive: true,
      },
    ],
  },
  {
    slug: "site-draft",
    description: "Create a site draft from raw text",
    versions: [
      {
        version: 1,
        role: "user",
        content: `Source text:
{{raw_text}}

Return JSON with:
{
  "title": string,
  "subtitle": string,
  "overview": string,
  "sections": [{ "heading": string, "html": string }],
  "highlights": [string],
  "warnings": [string]
}`,
        isActive: true,
      },
    ],
  },
  {
    slug: "captioner",
    description: "Generate captions for image files",
    versions: [
      {
        version: 1,
        role: "user",
        content: `Given the following image file names and optional hints, produce JSON:
{
  "captions": [
    { "file": string, "alt": string, "caption": string }
  ]
}
Files: {{files}}
Hints: {{hints}}`,
        isActive: true,
      },
    ],
  },
];

// Lookups
function getProfile(slug: string): Profile {
  const p = PROFILES.find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown profile: ${slug}`);
  return p;
}
function getActivePrompt(slug: string): PromptVersion[] {
  const prompt = PROMPTS.find((x) => x.slug === slug);
  if (!prompt) throw new Error(`Unknown prompt: ${slug}`);
  return prompt.versions.filter((v) => v.isActive);
}

// ─────────────────────────────────────────────
// 3) Provider adapter (OpenAI minimal)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function callOpenAIChat(opts: {
  model: string;
  messages: Message[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}): Promise<RunResult> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");

  const body: any = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    top_p: opts.topP ?? 1,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI error (${res.status}): ${err}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  const usage = json?.usage ?? {};
  const result: RunResult = {
    output: safeTryParse(content),
    tokensInput: usage.prompt_tokens,
    tokensOutput: usage.completion_tokens,
    usdCost: estimateOpenAICost(json?.usage, opts.model),
    raw: json,
  };
  return result;
}

function estimateOpenAICost(usage: any, _model: string) {
  if (!usage?.total_tokens) return undefined;
  // Placeholder cost estimator; we’ll wire precise rates later.
  return usage.total_tokens * 0.000002;
}

function safeTryParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ─────────────────────────────────────────────
// 4) Orchestrator

export async function runProfileServer(opts: {
  profileSlug: string;
  promptSlugs?: string[];
  vars?: Record<string, any>;
  signal?: AbortSignal;
}) {
  const profile = getProfile(opts.profileSlug);

  // Render messages
  const messages: Message[] = [];
  if (profile.systemPromptSlug) {
    const sys = getActivePrompt(profile.systemPromptSlug);
    for (const p of sys) {
      messages.push({
        role: p.role,
        content: renderTemplate(p.content, opts.vars ?? {}),
      });
    }
  }
  for (const slug of opts.promptSlugs ?? []) {
    const vers = getActivePrompt(slug);
    for (const v of vers) {
      messages.push({
        role: v.role,
        content: renderTemplate(v.content, opts.vars ?? {}),
      });
    }
  }

  // Provider dispatch (only openai for now)
  const res = await callOpenAIChat({
    model: profile.modelId,
    messages,
    temperature: profile.temperature,
    topP: profile.topP,
    maxTokens: profile.maxOutputTokens ?? undefined,
    jsonMode: profile.jsonMode,
    signal: opts.signal,
  });

  return res.output;
}

// Convenience helpers you’ll call via server actions
export async function draftSiteFromTextServer(rawText: string) {
  return runProfileServer({
    profileSlug: "content-drafter@v1",
    promptSlugs: ["site-draft"],
    vars: { raw_text: rawText },
  });
}

export async function captionFilesServer(files: string[], hints?: string) {
  return runProfileServer({
    profileSlug: "captioner@v1",
    promptSlugs: ["captioner"],
    vars: { files, hints: hints ?? "" },
  });
}
