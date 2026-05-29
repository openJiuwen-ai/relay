/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AuthorizationRule Store Factory
 * REDIS_URL 有值 → RedisAuthorizationRuleStore
 * 无 → AuthorizationRuleStore (内存)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IAuthorizationRuleStore } from '../ports/AuthorizationRuleStore.js';
import { AuthorizationRuleStore } from '../ports/AuthorizationRuleStore.js';
import { RedisAuthorizationRuleStore } from '../redis/RedisAuthorizationRuleStore.js';

export function createAuthorizationRuleStore(redis?: RedisClient): IAuthorizationRuleStore {
  if (redis) {
    return new RedisAuthorizationRuleStore(redis);
  }
  return new AuthorizationRuleStore();
}
