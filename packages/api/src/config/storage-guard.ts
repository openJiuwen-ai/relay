/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Fail-closed storage guard.
 * Ensures Redis is available unless memory mode is explicitly opted into.
 *
 * Two-layer defense:
 * 1. start-dev.sh exits on Redis failure (unless --memory flag)
 * 2. This guard catches direct `pnpm dev` without Redis
 */

export interface StorageGuardResult {
  mode: 'redis' | 'memory';
}

/**
 * Assert that a valid storage backend is available.
 * Throws if Redis is unavailable and MEMORY_STORE env var is not '1'.
 */
export function assertStorageReady(redisAvailable: boolean): StorageGuardResult {
  if (redisAvailable) {
    return { mode: 'redis' };
  }

  if (process.env.MEMORY_STORE === '1') {
    return { mode: 'memory' };
  }

  throw new Error(
    '[api] REDIS_URL not set and MEMORY_STORE not enabled. ' +
      'Start Redis or use --memory flag. ' +
      'Set MEMORY_STORE=1 to explicitly allow in-memory storage.',
  );
}
