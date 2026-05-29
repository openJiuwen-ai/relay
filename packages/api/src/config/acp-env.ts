/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ACPModelAccessMode } from './provider-profiles.types.js';

const ACP_ALWAYS_BLOCKED_ENV_PREFIXES = ['AWS_', 'DATABASE_', 'GITHUB_', 'OFFICE_CLAW_', 'POSTGRES_', 'REDIS_'];
const ACP_MODEL_CREDENTIAL_ENV_PREFIXES = ['ANTHROPIC_', 'DARE_', 'GEMINI_', 'GOOGLE_', 'OPENAI_', 'OPENROUTER_'];
const ACP_ALWAYS_BLOCKED_ENV_KEYS = new Set(['DATABASE_URL', 'GITHUB_MCP_PAT', 'GITHUB_TOKEN', 'REDIS_URL']);
const ACP_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function blockedPrefixes(modelAccessMode: ACPModelAccessMode | undefined): string[] {
  return modelAccessMode === 'clowder_default_profile'
    ? [...ACP_ALWAYS_BLOCKED_ENV_PREFIXES, ...ACP_MODEL_CREDENTIAL_ENV_PREFIXES]
    : ACP_ALWAYS_BLOCKED_ENV_PREFIXES;
}

export function isBlockedACPEnvKey(key: string, modelAccessMode: ACPModelAccessMode | undefined): boolean {
  if (ACP_ALWAYS_BLOCKED_ENV_KEYS.has(key)) return true;
  return blockedPrefixes(modelAccessMode).some((prefix) => key.startsWith(prefix));
}

export function normalizeACPEnvEntries(
  env: Record<string, unknown> | undefined | null,
  modelAccessMode: ACPModelAccessMode | undefined,
  options?: { strict?: boolean },
): { env: Record<string, string> | undefined; dirty: boolean } {
  if (!env || typeof env !== 'object') {
    return { env: undefined, dirty: false };
  }

  const strict = options?.strict ?? true;
  let dirty = false;
  const normalizedEntries: Array<[string, string]> = [];

  for (const [rawKey, rawValue] of Object.entries(env)) {
    const key = rawKey.trim();
    if (!key) {
      if (strict) throw new Error('ACP env key cannot be blank');
      dirty = true;
      continue;
    }
    if (!ACP_ENV_KEY_PATTERN.test(key)) {
      if (strict) throw new Error(`ACP env key "${key}" is invalid`);
      dirty = true;
      continue;
    }
    if (isBlockedACPEnvKey(key, modelAccessMode)) {
      if (strict) throw new Error(`ACP env key "${key}" is reserved and cannot be overridden`);
      dirty = true;
      continue;
    }
    const value = typeof rawValue === 'string' ? rawValue : rawValue == null ? '' : String(rawValue);
    if (rawKey !== key || rawValue !== value) dirty = true;
    normalizedEntries.push([key, value]);
  }

  normalizedEntries.sort(([left], [right]) => left.localeCompare(right));
  const normalized = Object.fromEntries(normalizedEntries);
  return {
    env: Object.keys(normalized).length > 0 ? normalized : undefined,
    dirty,
  };
}

export function buildACPSubprocessEnv(input: {
  modelAccessMode?: ACPModelAccessMode;
  env?: Record<string, string>;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    if (isBlockedACPEnvKey(key, input.modelAccessMode)) continue;
    env[key] = value;
  }

  const normalizedCustomEnv = normalizeACPEnvEntries(input.env, input.modelAccessMode, { strict: false }).env;
  if (normalizedCustomEnv) {
    for (const [key, value] of Object.entries(normalizedCustomEnv)) {
      env[key] = value;
    }
  }

  return env;
}
