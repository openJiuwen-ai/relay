/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Draft Store Factory
 * Redis → RedisDraftStore, 无 → DraftStore (内存)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import type { IDraftStore } from '../ports/DraftStore.js';
import { DraftStore } from '../ports/DraftStore.js';
import { RedisDraftStore } from '../redis/RedisDraftStore.js';

const log = createModuleLogger('draft-store-factory');

export function createDraftStore(redis?: RedisClient): IDraftStore {
  // Draft persistence is intentionally non-expiring:
  // drafts are removed only by explicit delete/deleteByThread.
  if (process.env.DRAFT_TTL_SECONDS) {
    log.warn(
      { raw: process.env.DRAFT_TTL_SECONDS },
      'DRAFT_TTL_SECONDS is ignored: draft TTL is disabled for crash recovery',
    );
  }
  if (redis) {
    return new RedisDraftStore(redis, { ttlSeconds: 0 });
  }
  return new DraftStore({ ttlMs: 0 });
}
