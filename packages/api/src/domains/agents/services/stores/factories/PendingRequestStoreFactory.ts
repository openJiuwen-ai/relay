/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * PendingRequest Store Factory
 * REDIS_URL 有值 → RedisPendingRequestStore
 * 无 → PendingRequestStore (内存)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IPendingRequestStore } from '../ports/PendingRequestStore.js';
import { PendingRequestStore } from '../ports/PendingRequestStore.js';
import { RedisPendingRequestStore } from '../redis/RedisPendingRequestStore.js';

export function createPendingRequestStore(redis?: RedisClient): IPendingRequestStore {
  if (redis) {
    return new RedisPendingRequestStore(redis);
  }
  return new PendingRequestStore();
}
