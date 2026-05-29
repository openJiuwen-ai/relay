/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis implementation of ThreadReadStateStore (F069)
 * Per-user/per-thread read cursor for unread badge persistence.
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { IMessageStore } from '../ports/MessageStore.js';
import type { IThreadReadStateStore, ThreadReadState, ThreadUnreadSummary } from '../ports/ThreadReadStateStore.js';
import { ReadStateKeys } from '../redis-keys/read-state-keys.js';

/**
 * Lua CAS: atomic monotonic ack — only advance cursor, never regress.
 * KEYS[1] = read-state hash key
 * ARGV[1] = new messageId
 * ARGV[2] = updatedAt timestamp
 * Returns 1 if advanced, 0 if rejected (same or older).
 */
const ACK_CAS_LUA = `
local cur = redis.call('HGET', KEYS[1], 'lastReadMessageId')
if cur and ARGV[1] <= cur then return 0 end
redis.call('HSET', KEYS[1], 'lastReadMessageId', ARGV[1], 'updatedAt', ARGV[2])
return 1
`;

export class RedisThreadReadStateStore implements IThreadReadStateStore {
  constructor(private readonly redis: RedisClient) {}

  async get(userId: string, threadId: string): Promise<ThreadReadState | null> {
    const key = ReadStateKeys.cursor(userId, threadId);
    const data = await this.redis.hgetall(key);
    if (!data || !data.lastReadMessageId) return null;
    return {
      userId,
      threadId,
      lastReadMessageId: data.lastReadMessageId,
      updatedAt: Number(data.updatedAt ?? 0),
    };
  }

  async ack(userId: string, threadId: string, messageId: string): Promise<boolean> {
    const key = ReadStateKeys.cursor(userId, threadId);
    const result = await this.redis.eval(ACK_CAS_LUA, 1, key, messageId, String(Date.now()));
    return result === 1;
  }

  async getUnreadSummaries(
    userId: string,
    threadIds: string[],
    messageStore: IMessageStore,
  ): Promise<ThreadUnreadSummary[]> {
    // TODO(F069): N+1 serial queries — parallelize or add aggregate interface when thread count grows
    const summaries: ThreadUnreadSummary[] = [];

    for (const threadId of threadIds) {
      const state = await this.get(userId, threadId);
      // Cold-start guard: no read cursor = treat as fully read (0 unread).
      // Pre-F069 threads have no cursor; counting all messages as unread
      // causes every badge to reappear on every page refresh.
      if (!state) {
        summaries.push({ threadId, unreadCount: 0, hasUserMention: false });
        continue;
      }
      const afterId = state.lastReadMessageId;

      const unreadMessages = await messageStore.getByThreadAfter(threadId, afterId, undefined, userId);
      // P1-2 fix: exclude user's own typed messages + deleted/tombstone messages
      // Cat messages (agentId !== null) and connector messages (source) are counted as unread.
      // Only the user's own direct messages (agentId === null, no source) are excluded.
      const relevant = unreadMessages.filter((m) => !m.deletedAt && (m.agentId !== null || !!m.source));
      const unreadCount = relevant.length;
      const hasUserMention = relevant.some((m) => !!m.mentionsUser);

      summaries.push({ threadId, unreadCount, hasUserMention });
    }

    return summaries;
  }

  async deleteByThread(threadId: string): Promise<void> {
    const prefix = (this.redis.options as { keyPrefix?: string }).keyPrefix ?? '';
    const pattern = `${prefix}${ReadStateKeys.threadPattern(threadId)}`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        // Strip prefix for DEL (ioredis auto-prefixes normal commands)
        const bareKeys = prefix ? keys.map((k: string) => (k.startsWith(prefix) ? k.slice(prefix.length) : k)) : keys;
        await this.redis.del(...bareKeys);
      }
    } while (cursor !== '0');
  }
}
