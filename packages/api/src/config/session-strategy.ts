/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F33: Session Strategy Configuration
 *
 * Configurable per-agent session lifecycle strategies:
 *   - handoff: seal at threshold → new session (current default behavior)
 *   - compress: let CLI compress, don't intervene
 *   - hybrid: allow N compressions, then seal (hook-capable providers only)
 *
 * Lookup order (Phase 3):
 *   test override → runtime override (Redis, per-variant) → office-claw-config.json (breed) → STRATEGY_BY_BREED → provider default → global default
 *
 * Phase 2: seal-thresholds.ts merged into this file; office-claw-config.json integration added.
 * Phase 3: Runtime override via Redis + settings UI.
 */

import type { ContextHealthConfig, SessionStrategyConfig, StrategyAction } from '@openjiuwen/relay-shared';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import { createModuleLogger } from '../infrastructure/logger.js';
import { resolveBreedId } from './breed-resolver.js';
import { getConfigSessionStrategy } from './office-claw-config-loader.js';
import { getRuntimeOverride } from './session-strategy-overrides.js';

const log = createModuleLogger('session-strategy');

// ── Default Configurations ──

const GLOBAL_DEFAULT_STRATEGY: SessionStrategyConfig = {
  strategy: 'handoff',
  thresholds: { warn: 0.75, action: 0.85 },
  turnBudget: 12_000,
  safetyMargin: 4_000,
};

const DEFAULT_STRATEGY_BY_PROVIDER: Record<string, SessionStrategyConfig> = {
  anthropic: {
    strategy: 'handoff',
    thresholds: { warn: 0.8, action: 0.9 },
    turnBudget: 12_000,
    safetyMargin: 4_000,
  },
  openai: {
    strategy: 'handoff',
    thresholds: { warn: 0.75, action: 0.85 },
    turnBudget: 12_000,
    safetyMargin: 4_000,
  },
  google: {
    strategy: 'handoff',
    thresholds: { warn: 0.55, action: 0.65 },
    turnBudget: 12_000,
    safetyMargin: 4_000,
  },
};

/** breedId-keyed overrides (same breed's variants share strategy) */
const STRATEGY_BY_BREED: Record<string, Partial<SessionStrategyConfig>> = {
  // Example: ragdoll hybrid — allow 1 compression then handoff
  // ragdoll: {
  //   strategy: 'hybrid',
  //   hybrid: { maxCompressions: 1 },
  // },
};

/** Providers that support compression event signaling (PreCompact hook) */
const HOOK_CAPABLE_PROVIDERS = new Set(['anthropic']);

/**
 * Test-only: per-agent strategy override. Cleared between tests.
 * Use _setTestStrategyOverride / _clearTestStrategyOverrides.
 */
const _testOverrides = new Map<string, SessionStrategyConfig>();

/** @internal Test-only: set a strategy override for a specific agent. */
export function _setTestStrategyOverride(agentName: string, config: SessionStrategyConfig): void {
  _testOverrides.set(agentName, config);
}

/** @internal Test-only: clear all test overrides. */
export function _clearTestStrategyOverrides(): void {
  _testOverrides.clear();
}

// ── Lookup ──

/** Source of the effective strategy config — tells the UI where the value came from. */
export type StrategySource = 'runtime_override' | 'config_file' | 'breed_code' | 'provider_default' | 'global_default';

/**
 * Get session strategy config for an agent.
 *
 * Lookup order (Phase 3):
 * 1. Test override (testing only)
 * 2. Runtime override (Redis, per-variant) — Phase 3 UI writes here
 * 3. office-claw-config.json features.sessionStrategy (Phase 2: config-driven, breed level)
 * 4. STRATEGY_BY_BREED code override
 * 5. Provider default → global default
 */
export function getSessionStrategy(agentName: string): SessionStrategyConfig {
  return getSessionStrategyWithSource(agentName).effective;
}

/**
 * Get session strategy + its source. Used by the settings UI API to show
 * where the effective config comes from.
 */
export function getSessionStrategyWithSource(agentName: string): {
  effective: SessionStrategyConfig;
  source: StrategySource;
} {
  // Test-only override (highest priority)
  const testOverride = _testOverrides.get(agentName);
  if (testOverride) return { effective: testOverride, source: 'runtime_override' };

  // Resolve the full fallback chain first (config-file → breed → provider → global)
  const fallback = resolveFallbackStrategy(agentName);

  // Phase 3: Runtime override layers ON TOP of the resolved fallback,
  // so partial runtime overrides preserve lower-layer values.
  const runtimeOverride = getRuntimeOverride(agentName);
  if (runtimeOverride) {
    const merged = mergeStrategyConfig(fallback.effective, runtimeOverride);
    return { effective: validateProviderCapability(merged, agentName), source: 'runtime_override' };
  }

  return {
    effective: validateProviderCapability(fallback.effective, agentName),
    source: fallback.source,
  };
}

/**
 * Resolve the non-runtime fallback chain:
 *   config-file → breed code → provider default → global default
 */
function resolveFallbackStrategy(agentName: string): {
  effective: SessionStrategyConfig;
  source: StrategySource;
} {
  const base = getBaseStrategy(agentName);

  // Phase 2: office-claw-config.json features.sessionStrategy (breed level)
  const configOverride = getConfigSessionStrategy(agentName);
  if (configOverride) {
    return { effective: mergeStrategyConfig(base, configOverride), source: 'config_file' };
  }

  // Code-level breedId override
  const breedId = resolveBreedId(agentName);
  const breedOverride = (breedId ? STRATEGY_BY_BREED[breedId] : undefined) ?? STRATEGY_BY_BREED[agentName];
  if (breedOverride) {
    return { effective: mergeStrategyConfig(base, breedOverride), source: 'breed_code' };
  }

  // Provider default or global default
  const provider = officeClawRegistry.tryGet(agentName)?.config.provider ?? OFFICE_CLAW_CONFIGS[agentName]?.provider;
  if (provider && DEFAULT_STRATEGY_BY_PROVIDER[provider]) {
    return { effective: base, source: 'provider_default' };
  }
  return { effective: base, source: 'global_default' };
}

/**
 * Deep-merge a partial override into a base config.
 * Nested objects (thresholds, handoff, compress, hybrid) are merged individually
 * so that a partial override of e.g. { thresholds: { action: 0.88 } } preserves warn.
 */
export function mergeStrategyConfig(
  base: SessionStrategyConfig,
  override: Partial<SessionStrategyConfig>,
): SessionStrategyConfig {
  return {
    ...base,
    ...override,
    thresholds: { ...base.thresholds, ...override.thresholds },
    ...(override.handoff || base.handoff ? { handoff: { ...base.handoff, ...override.handoff } } : {}),
    ...(override.compress || base.compress ? { compress: { ...base.compress, ...override.compress } } : {}),
    ...(override.hybrid || base.hybrid ? { hybrid: { ...base.hybrid, ...override.hybrid } } : {}),
  } as SessionStrategyConfig;
}

function getBaseStrategy(agentName: string): SessionStrategyConfig {
  // Try officeClawRegistry first (runtime, includes variants), then static OFFICE_CLAW_CONFIGS fallback
  const provider = officeClawRegistry.tryGet(agentName)?.config.provider ?? OFFICE_CLAW_CONFIGS[agentName]?.provider;
  if (provider) {
    const providerDefault = DEFAULT_STRATEGY_BY_PROVIDER[provider];
    if (providerDefault) return providerDefault;
  }
  return GLOBAL_DEFAULT_STRATEGY;
}

/**
 * Phase 1 guard: hybrid requires hook-capable provider.
 * If provider lacks compression signal, degrade to handoff + log warning.
 */
function validateProviderCapability(config: SessionStrategyConfig, agentName: string): SessionStrategyConfig {
  if (config.strategy !== 'hybrid') return config;

  const entry = officeClawRegistry.tryGet(agentName);
  const provider = entry?.config.provider;

  if (!provider || !HOOK_CAPABLE_PROVIDERS.has(provider)) {
    log.warn(
      { agentName, provider },
      'hybrid strategy configured but provider lacks compression signal hook, degrading to handoff',
    );
    return { ...config, strategy: 'handoff' };
  }

  return config;
}

// ── Strategy Decision ──

/**
 * Pure function: determine what action to take based on context health + strategy.
 *
 * Replaces the boolean shouldSeal() from seal-thresholds.ts with a
 * discriminated union that supports compress/hybrid strategies.
 */
export function shouldTakeAction(
  fillRatio: number,
  windowTokens: number,
  usedTokens: number,
  compressionCount: number,
  strategy: SessionStrategyConfig,
): StrategyAction {
  const turnBudget = strategy.turnBudget ?? 12_000;
  const safetyMargin = strategy.safetyMargin ?? 4_000;
  const remaining = windowTokens - usedTokens;

  // Budget exhausted — strategy-aware:
  // - compress: CLI will free space by compressing, don't pre-emptively seal
  // - hybrid: allow compress if compressions remain, seal only when max reached
  // - handoff: seal immediately
  if (remaining < turnBudget + safetyMargin) {
    if (strategy.strategy === 'compress') {
      return { type: 'allow_compress' };
    }
    if (strategy.strategy === 'hybrid') {
      const max = strategy.hybrid?.maxCompressions ?? 2;
      if (compressionCount < max) {
        return { type: 'allow_compress' };
      }
    }
    return { type: 'seal', reason: 'budget_exhausted' };
  }

  // Below action threshold
  if (fillRatio < strategy.thresholds.action) {
    if (fillRatio >= strategy.thresholds.warn) {
      return { type: 'warn' };
    }
    return { type: 'none' };
  }

  // At or above action threshold — branch by strategy
  switch (strategy.strategy) {
    case 'handoff':
      return { type: 'seal', reason: 'threshold' };

    case 'compress':
      return { type: 'allow_compress' };

    case 'hybrid': {
      const max = strategy.hybrid?.maxCompressions ?? 2;
      if (compressionCount >= max) {
        return { type: 'seal_after_compress', reason: 'max_compressions' };
      }
      return { type: 'allow_compress' };
    }
  }
}

// ── Backward Compatibility (merged from seal-thresholds.ts in Phase 2) ──

/**
 * Get seal threshold config for an agent.
 * Thin adapter: converts SessionStrategyConfig → ContextHealthConfig format.
 *
 * @deprecated Prefer getSessionStrategy() + shouldTakeAction() for new code.
 * Kept for existing tests and consumers during migration.
 */
export function getSealConfig(agentName: string): ContextHealthConfig {
  const strategy = getSessionStrategy(agentName);
  return {
    warnThreshold: strategy.thresholds.warn,
    sealThreshold: strategy.thresholds.action,
    turnBudget: strategy.turnBudget ?? 12_000,
    safetyMargin: strategy.safetyMargin ?? 4_000,
  };
}

/**
 * Pure function: should this session be sealed?
 *
 * @deprecated Prefer shouldTakeAction() which supports compress/hybrid strategies.
 * Kept for existing tests during migration.
 */
export function shouldSeal(
  fillRatio: number,
  windowTokens: number,
  usedTokens: number,
  config: ContextHealthConfig,
): boolean {
  if (fillRatio >= config.sealThreshold) return true;
  const turnBudget = config.turnBudget ?? 12_000;
  const safetyMargin = config.safetyMargin ?? 4_000;
  const remaining = windowTokens - usedTokens;
  return remaining < turnBudget + safetyMargin;
}
