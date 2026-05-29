/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Shared helpers for Redis integration tests.
 * Enforces isolated test Redis and provides keyPrefix-safe cleanup.
 */

const ISOLATION_FLAG = 'OFFICE_CLAW_REDIS_TEST_ISOLATED';

function parseRedisUrl(redisUrl) {
  try {
    return new URL(redisUrl);
  } catch {
    return null;
  }
}

/**
 * Guardrail: Redis integration tests must run against isolated local Redis.
 */
export function assertRedisIsolationOrThrow(redisUrl, suiteName) {
  if (!redisUrl) return;

  if (process.env[ISOLATION_FLAG] !== '1') {
    throw new Error(
      `[${suiteName}] REDIS_URL is set without ${ISOLATION_FLAG}=1. ` +
        'Run via: pnpm --filter @openjiuwen/relay-api-server test:redis',
    );
  }

  const parsed = parseRedisUrl(redisUrl);
  if (!parsed) {
    throw new Error(`[${suiteName}] Invalid REDIS_URL: ${redisUrl}`);
  }

  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(`[${suiteName}] REDIS_URL must point to localhost for tests, got hostname=${parsed.hostname}`);
  }

  const db = parsed.pathname.replace('/', '') || '0';
  if (db !== '15') {
    throw new Error(`[${suiteName}] REDIS_URL must use /15 test DB for isolation, got /${db}`);
  }
}

function normalizePattern(pattern) {
  return pattern.replace(/^office-claw:/, '');
}

/**
 * Cleanup helper that works with ioredis keyPrefix and legacy double-prefix leftovers.
 */
export async function cleanupPrefixedRedisKeys(redis, patterns) {
  const normalized = patterns.map(normalizePattern);
  const expandedPatterns = normalized.flatMap((pattern) => [`office-claw:${pattern}`, `office-claw:office-claw:${pattern}`]);

  const grouped = await Promise.all(expandedPatterns.map((pattern) => redis.keys(pattern)));
  const prefixedKeys = [...new Set(grouped.flat())];
  if (prefixedKeys.length === 0) return 0;

  const stripped = prefixedKeys.map((key) => key.replace(/^office-claw:/, ''));
  return redis.del(...stripped);
}
