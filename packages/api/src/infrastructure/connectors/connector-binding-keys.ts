/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for connector thread bindings.
 * F088 Multi-Platform Chat Gateway — Redis persistence.
 */

export const ConnectorBindingKeys = {
  /** Hash with binding details: connector-binding:{connectorId}:{externalChatId} */
  detail: (connectorId: string, externalChatId: string) => `connector-binding:${connectorId}:${externalChatId}`,

  /** Set of forward keys per thread (reverse index): connector-binding-rev:{threadId} */
  byThread: (threadId: string) => `connector-binding-rev:${threadId}`,

  /** Sorted set of bindings per user (score = createdAt): connector-binding-user:{connectorId}:{userId} */
  byUser: (connectorId: string, userId: string) => `connector-binding-user:${connectorId}:${userId}`,
} as const;
