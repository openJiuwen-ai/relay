/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * SessionChainStore Factory
 * F24: Redis available → RedisSessionChainStore, otherwise in-memory.
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { SessionChainStore } from '../ports/SessionChainStore.js';
import { RedisSessionChainStore } from '../redis/RedisSessionChainStore.js';

export type AnySessionChainStore = SessionChainStore | RedisSessionChainStore;

export function createSessionChainStore(redis?: RedisClient): AnySessionChainStore {
  if (redis) {
    return new RedisSessionChainStore(redis);
  }
  return new SessionChainStore();
}
