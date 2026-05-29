/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F33 Phase 3: Runtime session strategy overrides.
 *
 * Redis-backed with sync in-memory cache.
 * - initRuntimeOverrides() at startup: hydrate cache from Redis
 * - setRuntimeOverride() / deleteRuntimeOverride(): write-through (Redis first, then cache)
 * - getRuntimeOverride() / getAllRuntimeOverrides(): read from sync cache
 *
 * This keeps getSessionStrategy() synchronous while having persistent storage.
 *
 * IMPORTANT: ioredis keyPrefix does NOT auto-apply to SCAN MATCH patterns.
 * We must manually prefix MATCH, then strip prefix from results before using
 * them with normal commands (which DO auto-prefix). See RedisSessionChainStore.scanKeys().
 */

import type { SessionStrategyConfig } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { createModuleLogger } from '../infrastructure/logger.js';
import { SessionStrategyKeys } from './session-strategy-keys.js';

const log = createModuleLogger('session-strategy-overrides');

let _redis: RedisClient | undefined;
const _cache = new Map<string, Partial<SessionStrategyConfig>>();

/**
 * Initialize the runtime override layer with a Redis client.
 * Call once at startup (index.ts). Hydrates the in-memory cache from Redis.
 */
export async function initRuntimeOverrides(redis: RedisClient): Promise<void> {
  _redis = redis;
  await hydrateFromRedis();
}

/** Get the runtime override for a specific agent (sync, from cache). */
export function getRuntimeOverride(agentId: string): Partial<SessionStrategyConfig> | undefined {
  return _cache.get(agentId);
}

/** Get all runtime overrides (sync, from cache). */
export function getAllRuntimeOverrides(): ReadonlyMap<string, Partial<SessionStrategyConfig>> {
  return _cache;
}

/**
 * Set a runtime strategy override for a variant agent.
 * Write-through: Redis first, then cache on success (P1-3: no cache split on Redis failure).
 */
export async function setRuntimeOverride(agentId: string, override: Partial<SessionStrategyConfig>): Promise<void> {
  if (_redis) {
    await _redis.set(SessionStrategyKeys.override(agentId), JSON.stringify(override));
  }
  _cache.set(agentId, override);
}

/**
 * Delete a runtime strategy override for a variant agent.
 * Redis DEL result is the source of truth for existence (not cache).
 * Falls back to cache check only when Redis is unavailable.
 */
export async function deleteRuntimeOverride(agentId: string): Promise<boolean> {
  let existed: boolean;
  if (_redis) {
    const deleted = await _redis.del(SessionStrategyKeys.override(agentId));
    existed = deleted > 0;
  } else {
    existed = _cache.has(agentId);
  }
  _cache.delete(agentId);
  return existed;
}

/** @internal Test-only: clear cache without touching Redis. */
export function _clearRuntimeOverrides(): void {
  _cache.clear();
  _redis = undefined;
}

/**
 * Hydrate the in-memory cache by scanning Redis for all override keys.
 *
 * IMPORTANT: ioredis keyPrefix does NOT auto-apply to SCAN MATCH patterns.
 * We must manually add the prefix for matching, then strip it from results
 * so that subsequent get() calls (which DO auto-prefix) work correctly.
 * Reference: RedisSessionChainStore.scanKeys()
 */
async function hydrateFromRedis(): Promise<void> {
  if (!_redis) return;
  const prefix = (_redis.options as { keyPrefix?: string }).keyPrefix ?? '';
  const barePattern = SessionStrategyKeys.override('*');
  const matchPattern = `${prefix}${barePattern}`;
  const keyPrefix = `${prefix}session-strategy:override:`;
  // Build into a temporary map — only swap to _cache on full success.
  // If SCAN fails mid-way, _cache stays empty (clean fallback) rather than
  // holding a partial subset that silently drops some overrides.
  const tempCache = new Map<string, Partial<SessionStrategyConfig>>();
  let cursor = '0';
  do {
    const [nextCursor, keys] = await _redis.scan(cursor, 'MATCH', matchPattern, 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      // Strip prefix so ioredis auto-prefix on get() doesn't double-prefix
      const bareKey = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key;
      const raw = await _redis.get(bareKey);
      if (raw) {
        const agentId = key.slice(keyPrefix.length);
        try {
          tempCache.set(agentId, JSON.parse(raw) as Partial<SessionStrategyConfig>);
        } catch {
          log.warn({ key }, 'invalid JSON in Redis key, skipping');
        }
      }
    }
  } while (cursor !== '0');
  // Atomic swap: replace cache contents (not append) so deleted Redis keys
  // don't linger in memory after re-hydration.
  _cache.clear();
  for (const [agentId, override] of tempCache) {
    _cache.set(agentId, override);
  }
}
