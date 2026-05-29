/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cat Context Budget Configuration
 * 优先级: 环境变量 > office-claw-config.json > 硬编码默认值
 *
 * 环境变量 (最高优先级, 覆盖单个字段):
 *   CAT_OPUS_MAX_PROMPT_TOKENS   → Claude prompt token 上限
 *   CAT_CODEX_MAX_PROMPT_TOKENS  → Codex prompt token 上限
 *   CAT_GEMINI_MAX_PROMPT_TOKENS → Gemini prompt token 上限
 *   MAX_PROMPT_TOKENS            → 全局默认 token (fallback)
 *
 * 或直接修改项目根目录的 office-claw-config.json
 */

import type { ContextBudget } from '@openjiuwen/relay-shared';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import { resolveBreedId } from './breed-resolver.js';
import { getAllAgentIdsFromConfig, getDefaultVariant, loadAgentConfig } from './office-claw-config-loader.js';

const BUDGET_ENV_KEYS = {
  opus: 'CAT_OPUS_MAX_PROMPT_TOKENS',
  codex: 'CAT_CODEX_MAX_PROMPT_TOKENS',
  gemini: 'CAT_GEMINI_MAX_PROMPT_TOKENS',
} as const;

/**
 * Hardcoded defaults — keyed by breedId so all variants share the same budget.
 *
 * ⚠️ NOTE on incremental mode (GAP-1 fix): The incremental delivery path
 * (assembleIncrementalContext in route-helpers.ts) now enforces BOTH
 * maxMessages (count cap) and maxContextTokens (aggregate token budget).
 * Per-message content is still truncated by maxContentLengthPerMsg.
 */
const DEFAULT_BUDGETS: Record<string, ContextBudget> = {
  // Keep these in sync with project office-claw-config.json defaults (方案 A) so
  // missing/invalid config doesn't silently regress budgets.
  ragdoll: { maxPromptTokens: 180000, maxContextTokens: 160000, maxMessages: 200, maxContentLengthPerMsg: 10000 },
  'maine-coon': { maxPromptTokens: 240000, maxContextTokens: 216000, maxMessages: 200, maxContentLengthPerMsg: 10000 },
  siamese: { maxPromptTokens: 350000, maxContextTokens: 300000, maxMessages: 300, maxContentLengthPerMsg: 15000 },
};

/** F32-a: Conservative fallback for unknown/dynamic cats — use smallest built-in budget */
const GLOBAL_FALLBACK_BUDGET: ContextBudget = {
  maxPromptTokens: 100000,
  maxContextTokens: 60000,
  maxMessages: 200,
  maxContentLengthPerMsg: 10000,
};

// Cache from office-claw-config.json
let cachedJsonBudgets: Record<string, ContextBudget> | null = null;

function loadBudgetsFromJson(): Record<string, ContextBudget> {
  if (cachedJsonBudgets) return cachedJsonBudgets;

  try {
    const config = loadAgentConfig();
    cachedJsonBudgets = {};
    for (const breed of config.breeds) {
      const defaultVariant = getDefaultVariant(breed);
      const breedBudget = defaultVariant.contextBudget;
      if (breedBudget) {
        cachedJsonBudgets[breed.agentId] = breedBudget;
      }

      // F32-b: variants are independent agents (sonnet, opus-45, gpt52, spark, gemini25).
      // Variant budgets should be configurable independently, and should inherit the
      // breed default budget when not explicitly specified.
      for (const variant of breed.variants) {
        if (!variant.agentId) continue;
        const effective = variant.contextBudget ?? breedBudget;
        if (effective) {
          cachedJsonBudgets[variant.agentId] = effective;
        }
      }
    }
    return cachedJsonBudgets;
  } catch {
    // office-claw-config.json doesn't exist or is invalid
    cachedJsonBudgets = {};
    return cachedJsonBudgets;
  }
}

/**
 * Get context budget for an agent.
 * Priority: env var override (maxPromptTokens only) > office-claw-config.json > hardcoded defaults
 */
export function getAgentContextBudget(agentName: string): ContextBudget {
  // 1. Get base budget from JSON or default (resolve breedId for DEFAULT_BUDGETS)
  const jsonBudgets = loadBudgetsFromJson();
  const breedId = resolveBreedId(agentName);
  const baseBudget: ContextBudget =
    jsonBudgets[agentName] ??
    (breedId ? DEFAULT_BUDGETS[breedId] : undefined) ??
    DEFAULT_BUDGETS[agentName] ??
    GLOBAL_FALLBACK_BUDGET; // F32-a: conservative fallback for dynamic cats

  // 2. Check for per-agent env var override
  const perAgentEnvKey = BUDGET_ENV_KEYS[agentName as keyof typeof BUDGET_ENV_KEYS];
  const perAgentEnvValue = process.env[perAgentEnvKey];
  if (perAgentEnvValue?.trim()) {
    const parsed = parseInt(perAgentEnvValue.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        maxPromptTokens: parsed,
        maxContextTokens: baseBudget.maxContextTokens,
        maxMessages: baseBudget.maxMessages,
        maxContentLengthPerMsg: baseBudget.maxContentLengthPerMsg,
      };
    }
  }

  // 3. Check for global fallback env var
  const globalEnvValue = process.env.MAX_PROMPT_TOKENS;
  if (globalEnvValue?.trim()) {
    const parsed = parseInt(globalEnvValue.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        maxPromptTokens: parsed,
        maxContextTokens: baseBudget.maxContextTokens,
        maxMessages: baseBudget.maxMessages,
        maxContentLengthPerMsg: baseBudget.maxContentLengthPerMsg,
      };
    }
  }

  return baseBudget;
}

/**
 * Get all agent budgets (for ConfigRegistry display)
 */
export function getAllAgentBudgets(): Record<string, ContextBudget> {
  const result: Record<string, ContextBudget> = {};
  // F32-a: iterate officeClawRegistry (includes dynamic cats), F032 P2: use config fallback
  const registryIds = officeClawRegistry.getAllIds();
  const allIds = registryIds.length > 0 ? registryIds.map(String) : getAllAgentIdsFromConfig();
  for (const agentName of allIds) {
    result[agentName] = getAgentContextBudget(agentName);
  }
  return result;
}

/**
 * Clear cached budgets (for testing)
 */
export function clearBudgetCache(): void {
  cachedJsonBudgets = null;
}
