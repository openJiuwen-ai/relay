/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Thread Read State Store (F069)
 * Per-user/per-thread read cursor for unread badge persistence.
 */

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type {
  IThreadReadStateStore,
  ThreadReadState,
  ThreadUnreadSummary,
} from '@openjiuwen/relay-api-server-contracts/storage';

import type {
  IMessageStore,
  IThreadReadStateStore,
  ThreadReadState,
  ThreadUnreadSummary,
} from '@openjiuwen/relay-api-server-contracts/storage';

export class ThreadReadStateStore implements IThreadReadStateStore {
  private states = new Map<string, ThreadReadState>();

  get(userId: string, threadId: string): ThreadReadState | null {
    return this.states.get(`${userId}:${threadId}`) ?? null;
  }

  ack(userId: string, threadId: string, messageId: string): boolean {
    const k = `${userId}:${threadId}`;
    const existing = this.states.get(k);
    if (existing && existing.lastReadMessageId >= messageId) return false;
    this.states.set(k, { userId, threadId, lastReadMessageId: messageId, updatedAt: Date.now() });
    return true;
  }

  async getUnreadSummaries(
    userId: string,
    threadIds: string[],
    messageStore: IMessageStore,
  ): Promise<ThreadUnreadSummary[]> {
    const summaries: ThreadUnreadSummary[] = [];
    for (const threadId of threadIds) {
      const state = this.get(userId, threadId);
      if (!state) {
        summaries.push({ threadId, unreadCount: 0, hasUserMention: false });
        continue;
      }
      const unreadMessages = await messageStore.getByThreadAfter(threadId, state.lastReadMessageId, undefined, userId);
      const relevant = unreadMessages.filter((m) => !m.deletedAt && (m.agentId !== null || !!m.source));
      summaries.push({
        threadId,
        unreadCount: relevant.length,
        hasUserMention: relevant.some((m) => !!m.mentionsUser),
      });
    }
    return summaries;
  }

  deleteByThread(threadId: string): void {
    for (const [k, state] of this.states) {
      if (state.threadId === threadId) this.states.delete(k);
    }
  }
}
