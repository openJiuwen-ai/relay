/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * ReadState Store Factory (F069)
 * REDIS_URL 有值 → RedisThreadReadStateStore
 * 无 → undefined (read state requires Redis)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IThreadReadStateStore } from '../ports/ThreadReadStateStore.js';
import { RedisThreadReadStateStore } from '../redis/RedisThreadReadStateStore.js';

export function createReadStateStore(redis?: RedisClient): IThreadReadStateStore | undefined {
  if (!redis) return undefined;
  return new RedisThreadReadStateStore(redis);
}
