/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for InvocationQueue snapshot persistence.
 * All keys share the office-claw: prefix set by the Redis client.
 */
export const InvocationQueueKeys = {
  /** Serialized global queue snapshot: invocation-queue:snapshot */
  snapshot: () => 'invocation-queue:snapshot',
} as const;

