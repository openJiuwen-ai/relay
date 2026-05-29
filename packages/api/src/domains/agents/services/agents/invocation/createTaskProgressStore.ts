/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { Redis } from 'ioredis';
import { MemoryTaskProgressStore } from './MemoryTaskProgressStore.js';
import { RedisTaskProgressStore } from './RedisTaskProgressStore.js';
import type { TaskProgressStore } from './TaskProgressStore.js';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createTaskProgressStore(
  redis: Redis | undefined,
  options?: { defaultTtlSeconds?: number },
): TaskProgressStore {
  if (!redis) return new MemoryTaskProgressStore();
  return new RedisTaskProgressStore(redis, options?.defaultTtlSeconds ?? DEFAULT_TTL_SECONDS);
}
