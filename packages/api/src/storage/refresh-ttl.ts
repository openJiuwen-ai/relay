/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis TTL Refresh
 * On startup, refreshes TTL on existing message and thread Redis keys
 * so that keys written with older defaults get updated to the current TTL.
 *
 * Uses SCAN (not KEYS) for production safety. Runs as a non-blocking
 * background task — does not delay server startup.
 */

import type { Redis } from 'ioredis';
import { createModuleLogger } from '../infrastructure/logger.js';

const log = createModuleLogger('refresh-ttl');

/** SCAN batch size — balance between round-trips and per-iteration load */
const SCAN_COUNT = 500;
/** Log progress every N keys */
const PROGRESS_INTERVAL = 5000;

const MSG_TTL_DEFAULT = 90 * 24 * 60 * 60;
const THREAD_TTL_DEFAULT = 90 * 24 * 60 * 60;

/**
 * Refresh TTL on existing message and thread Redis keys.
 * Safe to call on every startup — EXPIRE is idempotent.
 * TTL=0 means "no expiration" → skip refresh for that category.
 */
export async function refreshRedisTtl(
  redis: Redis,
  messageTtlSeconds: number | undefined,
  threadTtlSeconds: number | undefined,
): Promise<void> {
  const msgTtl = messageTtlSeconds ?? MSG_TTL_DEFAULT;
  const thrTtl = threadTtlSeconds ?? THREAD_TTL_DEFAULT;

  if (msgTtl <= 0 && thrTtl <= 0) {
    log.info('TTL refresh skipped: both message and thread TTL are disabled (0)');
    return;
  }

  const prefix = (redis.options as { keyPrefix?: string }).keyPrefix ?? '';

  log.info({ msgTtl, thrTtl, prefix: prefix || '(none)' }, 'Starting Redis TTL refresh for existing keys');

  const startedAt = Date.now();
  let msgCount = 0;
  let thrCount = 0;

  // ── Message keys ──────────────────────────────────────────────
  if (msgTtl > 0) {
    const pattern = `${prefix}msg:*`;
    let cursor = '0';
    let scanned = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
      cursor = nextCursor;
      scanned += keys.length;

      const pipeline = redis.pipeline();
      for (const fullKey of keys) {
        const bareKey = prefix ? fullKey.slice(prefix.length) : fullKey;
        // Skip idempotency keys (short-lived, 5 min TTL)
        if (bareKey.startsWith('msg:idem:')) continue;
        pipeline.expire(bareKey, msgTtl);
        msgCount++;
      }
      await pipeline.exec();

      if (scanned % PROGRESS_INTERVAL === 0 || cursor === '0') {
        log.info({ msgScanned: scanned, msgRefreshed: msgCount }, 'TTL refresh progress — messages');
      }
    } while (cursor !== '0');
    log.info({ msgRefreshed: msgCount }, 'TTL refresh complete for messages');
  }

  // ── Thread detail + sub-keys ──────────────────────────────────
  if (thrTtl > 0) {
    const detailPattern = `${prefix}thread:*`;
    let cursor = '0';
    let scanned = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', detailPattern, 'COUNT', SCAN_COUNT);
      cursor = nextCursor;
      scanned += keys.length;

      const pipeline = redis.pipeline();
      for (const fullKey of keys) {
        const bareKey = prefix ? fullKey.slice(prefix.length) : fullKey;
        // Skip ephemeral mention-routing-feedback keys
        if (bareKey.includes(':mention-routing-feedback')) continue;
        pipeline.expire(bareKey, thrTtl);
        thrCount++;
      }
      await pipeline.exec();

      if (scanned % PROGRESS_INTERVAL === 0 || cursor === '0') {
        log.info({ threadScanned: scanned, threadRefreshed: thrCount }, 'TTL refresh progress — threads');
      }
    } while (cursor !== '0');

    // Thread user lists: threads:user:{userId}
    const userListPattern = `${prefix}threads:user:*`;
    cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', userListPattern, 'COUNT', SCAN_COUNT);
      cursor = nextCursor;

      const pipeline = redis.pipeline();
      for (const fullKey of keys) {
        const bareKey = prefix ? fullKey.slice(prefix.length) : fullKey;
        pipeline.expire(bareKey, thrTtl);
        thrCount++;
      }
      await pipeline.exec();
    } while (cursor !== '0');

    log.info({ threadRefreshed: thrCount }, 'TTL refresh complete for threads');
  }

  const elapsed = Date.now() - startedAt;
  log.info({ msgCount, thrCount, elapsedMs: elapsed }, 'Redis TTL refresh finished');
}

/**
 * Fire-and-forget wrapper: runs refreshRedisTtl in the background.
 * Use at startup so TTL refresh doesn't block the server from listening.
 */
export function refreshRedisTtlBackground(
  redis: Redis,
  messageTtlSeconds: number | undefined,
  threadTtlSeconds: number | undefined,
): void {
  refreshRedisTtl(redis, messageTtlSeconds, threadTtlSeconds).catch((err) => {
    log.error({ err }, 'Redis TTL refresh failed');
  });
}
