/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for message storage.
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const MessageKeys = {
  /** Hash with message details: msg:{id} */
  detail: (id: string) => `msg:${id}`,

  /** Global timeline sorted set */
  TIMELINE: 'msg:timeline',

  /** Per-user timeline sorted set: msg:user:{userId} */
  user: (userId: string) => `msg:user:${userId}`,

  /** Per-agent mentions sorted set: msg:mentions:{agentId} */
  mentions: (agentId: string) => `msg:mentions:${agentId}`,

  /** Per-thread timeline sorted set: msg:thread:{threadId} */
  thread: (threadId: string) => `msg:thread:${threadId}`,

  /** Idempotency index: msg:idem:{userId}:{threadId}:{key} -> messageId */
  idempotency: (userId: string, threadId: string, key: string) => `msg:idem:${userId}:${threadId}:${key}`,
} as const;
