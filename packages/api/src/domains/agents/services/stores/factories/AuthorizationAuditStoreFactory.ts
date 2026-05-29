/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AuthorizationAudit Store Factory
 * REDIS_URL 有值 → RedisAuthorizationAuditStore
 * 无 → AuthorizationAuditStore (内存)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IAuthorizationAuditStore } from '../ports/AuthorizationAuditStore.js';
import { AuthorizationAuditStore } from '../ports/AuthorizationAuditStore.js';
import { RedisAuthorizationAuditStore } from '../redis/RedisAuthorizationAuditStore.js';

export function createAuthorizationAuditStore(redis?: RedisClient): IAuthorizationAuditStore {
  if (redis) {
    return new RedisAuthorizationAuditStore(redis);
  }
  return new AuthorizationAuditStore();
}
