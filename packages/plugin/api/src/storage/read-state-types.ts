/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { IMessageStore } from './message-types.js';

export interface ThreadReadState {
  userId: string;
  threadId: string;
  lastReadMessageId: string;
  updatedAt: number;
}

export interface ThreadUnreadSummary {
  threadId: string;
  unreadCount: number;
  hasUserMention: boolean;
}

export interface IThreadReadStateStore {
  get(userId: string, threadId: string): ThreadReadState | null | Promise<ThreadReadState | null>;
  ack(userId: string, threadId: string, messageId: string): boolean | Promise<boolean>;
  getUnreadSummaries(
    userId: string,
    threadIds: string[],
    messageStore: IMessageStore,
  ): ThreadUnreadSummary[] | Promise<ThreadUnreadSummary[]>;
  deleteByThread(threadId: string): void | Promise<void>;
}
