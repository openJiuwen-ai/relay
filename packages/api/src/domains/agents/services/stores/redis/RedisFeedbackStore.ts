/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { FeedbackRecord, IFeedbackStore } from '../ports/FeedbackStore.js';

const KEY_PREFIX = 'feedback';

export class RedisFeedbackStore implements IFeedbackStore {
  constructor(private readonly redis: RedisClient) {}

  private recordKey(threadId: string, messageId: string, userId: string): string {
    return `${KEY_PREFIX}:${threadId}:${messageId}:${userId}`;
  }

  private threadIndexKey(threadId: string): string {
    return `${KEY_PREFIX}:thread:${threadId}:messages`;
  }

  async set(record: FeedbackRecord): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.set(this.recordKey(record.threadId, record.messageId, record.userId), JSON.stringify(record));
    pipeline.sadd(this.threadIndexKey(record.threadId), `${record.messageId}:${record.userId}`);
    await pipeline.exec();
  }

  async get(threadId: string, messageId: string, userId: string): Promise<FeedbackRecord | null> {
    const raw = await this.redis.get(this.recordKey(threadId, messageId, userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as FeedbackRecord;
    } catch {
      return null;
    }
  }

  async getByThread(threadId: string, userId: string): Promise<Record<string, FeedbackRecord>> {
    const entries: string[] = await this.redis.smembers(this.threadIndexKey(threadId));
    const ownEntries = entries.filter((entry) => entry.endsWith(`:${userId}`));
    if (ownEntries.length === 0) return {};

    const pipeline = this.redis.multi();
    for (const entry of ownEntries) {
      const messageId = entry.slice(0, -userId.length - 1);
      pipeline.get(this.recordKey(threadId, messageId, userId));
    }
    const values = await pipeline.exec();
    const result: Record<string, FeedbackRecord> = {};
    if (!values) return result;

    for (let i = 0; i < values.length; i += 1) {
      const [err, raw] = values[i] ?? [];
      if (err || typeof raw !== 'string') continue;
      try {
        const record = JSON.parse(raw) as FeedbackRecord;
        result[record.messageId] = record;
      } catch {
        // Ignore malformed records; the next write will replace them.
      }
    }
    return result;
  }

  async deleteByMessage(threadId: string, messageId: string): Promise<number> {
    const entries: string[] = await this.redis.smembers(this.threadIndexKey(threadId));
    const matches = entries.filter((entry) => entry.startsWith(`${messageId}:`));
    if (matches.length === 0) return 0;

    const pipeline = this.redis.multi();
    for (const entry of matches) {
      const userId = entry.slice(messageId.length + 1);
      pipeline.del(this.recordKey(threadId, messageId, userId));
      pipeline.srem(this.threadIndexKey(threadId), entry);
    }
    await pipeline.exec();
    return matches.length;
  }

  async deleteByThread(threadId: string): Promise<number> {
    const entries: string[] = await this.redis.smembers(this.threadIndexKey(threadId));
    if (entries.length === 0) {
      await this.redis.del(this.threadIndexKey(threadId));
      return 0;
    }

    const pipeline = this.redis.multi();
    for (const entry of entries) {
      const separator = entry.lastIndexOf(':');
      if (separator <= 0) continue;
      const messageId = entry.slice(0, separator);
      const userId = entry.slice(separator + 1);
      pipeline.del(this.recordKey(threadId, messageId, userId));
    }
    pipeline.del(this.threadIndexKey(threadId));
    await pipeline.exec();
    return entries.length;
  }
}
