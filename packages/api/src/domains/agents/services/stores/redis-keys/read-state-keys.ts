/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for thread read state (F069).
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const ReadStateKeys = {
  /** Hash: read-state:{userId}:{threadId} → { lastReadMessageId, updatedAt } */
  cursor: (userId: string, threadId: string) => `read-state:${userId}:${threadId}`,
  /** Pattern for cleanup: read-state:*:{threadId} */
  threadPattern: (threadId: string) => `read-state:*:${threadId}`,
} as const;
