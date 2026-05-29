/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * PushSubscription Store Factory
 * REDIS_URL 有值 → RedisPushSubscriptionStore
 * 无 → PushSubscriptionStore (内存)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IPushSubscriptionStore } from '../ports/PushSubscriptionStore.js';
import { PushSubscriptionStore } from '../ports/PushSubscriptionStore.js';
import { RedisPushSubscriptionStore } from '../redis/RedisPushSubscriptionStore.js';

export function createPushSubscriptionStore(redis?: RedisClient): IPushSubscriptionStore {
  if (redis) {
    return new RedisPushSubscriptionStore(redis);
  }
  return new PushSubscriptionStore();
}
