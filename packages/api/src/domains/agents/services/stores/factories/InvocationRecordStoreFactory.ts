/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * InvocationRecord Store Factory
 * REDIS_URL 有值 → RedisInvocationRecordStore
 * 无 → InvocationRecordStore (内存，现有行为不变)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { InvocationRecordStore } from '../ports/InvocationRecordStore.js';
import { RedisInvocationRecordStore } from '../redis/RedisInvocationRecordStore.js';

export type AnyInvocationRecordStore = InvocationRecordStore | RedisInvocationRecordStore;

export function createInvocationRecordStore(redis?: RedisClient): AnyInvocationRecordStore {
  if (redis) {
    return new RedisInvocationRecordStore(redis);
  }
  return new InvocationRecordStore();
}
