/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Factory for creating memory store instances.
 */

import type { Redis } from 'ioredis';
import type { IMemoryStore } from '../ports/MemoryStore.js';
import { MemoryStore } from '../ports/MemoryStore.js';
import { RedisMemoryStore } from '../redis/RedisMemoryStore.js';

/**
 * Create a memory store instance.
 * Returns RedisMemoryStore if redis client is provided, otherwise MemoryStore.
 */
export function createMemoryStore(redis?: Redis): IMemoryStore {
  return redis ? new RedisMemoryStore(redis) : new MemoryStore();
}
