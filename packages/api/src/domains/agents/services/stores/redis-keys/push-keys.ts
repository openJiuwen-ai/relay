/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for Push Subscription store.
 * All keys share the office-claw: prefix set by the Redis client.
 */

import { createHash } from 'node:crypto';

/** Hash an endpoint URL to a fixed-length key (endpoints can be very long). */
export function hashEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

export const PushSubKeys = {
  /** Hash with subscription details: push-sub:{endpointHash} */
  detail: (endpointHash: string) => `push-sub:${endpointHash}`,
  /** Set of endpoint hashes for a user: push-user:{userId} */
  userSet: (userId: string) => `push-user:${userId}`,
  /** Set of all endpoint hashes: push-subs:all */
  ALL: 'push-subs:all',
} as const;
