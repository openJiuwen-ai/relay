/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Context Window Size Fallback Table
 * F24: Hardcoded model → context window mapping for cats whose CLI
 * doesn't report window size (Codex exec, Gemini -p).
 *
 * Claude CLI reports exact values via modelUsage[model].contextWindow,
 * so these entries are fallback only.
 * Update when new models are released or window sizes change.
 */

export const CONTEXT_WINDOW_SIZES: Record<string, number> = {
  // Claude (exact values from CLI, these are fallback)
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  // Codex/GPT
  'gpt-5.3': 128_000,
  'gpt-5.2': 128_000,
  'gpt-5.1-codex': 400_000,
  o3: 200_000,
  'o4-mini': 200_000,
  // Gemini
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-3-pro': 1_000_000,
  'gemini-3.1-pro-preview': 1_000_000,
  // Huawei MaaS / common OpenAI-compatible (relay context fallback)
  'deepseek-v3.1-128k': 128_000,
  'qwen3-30b-a3b-128k': 128_000,
  'qwen3-32b': 128_000,
  'kimi-k2': 128_000,
  'qwen3-235b-a22b': 128_000,
  'longcat-flash-chat': 128_000,
  'deepseek-r1-0528': 128_000,
  'qwen3-coder-480b-a35b-instruct': 128_000,
  'deepseek-v3.2': 160_000,
  'deepseek-v3': 128_000,
  // Huawei ModelArts (GLM)
  'glm-5': 196_608,
  'glm-5.1': 196_608,
  'glm-4': 128_000,
};

export function getContextWindowFallback(model: string): number | undefined {
  if (CONTEXT_WINDOW_SIZES[model]) return CONTEXT_WINDOW_SIZES[model];
  const modelLower = model.toLowerCase();
  if (CONTEXT_WINDOW_SIZES[modelLower]) return CONTEXT_WINDOW_SIZES[modelLower];
  // Strip provider prefix (e.g. 'huawei-modelarts/glm-5' → 'glm-5', 'z-ai/glm-4.7' → 'glm-4.7')
  const bare = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  if (bare !== model && CONTEXT_WINDOW_SIZES[bare]) return CONTEXT_WINDOW_SIZES[bare];
  // Longest key first so e.g. deepseek-v3.2 / deepseek-v3.1-128k beat deepseek-v3.
  const bareLower = bare.toLowerCase();
  if (CONTEXT_WINDOW_SIZES[bareLower]) return CONTEXT_WINDOW_SIZES[bareLower];
  const prefixEntries = Object.entries(CONTEXT_WINDOW_SIZES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of prefixEntries) {
    if (bareLower.startsWith(key)) return value;
  }
  return undefined;
}
