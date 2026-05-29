/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for InvocationRecord storage.
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const InvocationKeys = {
  /** Hash with invocation record details: invoc:{id} */
  detail: (id: string) => `invoc:${id}`,

  /** Idempotency key: idemp:{threadId}:{userId}:{key} */
  idempotency: (threadId: string, userId: string, key: string) => `idemp:${threadId}:${userId}:${key}`,
} as const;
