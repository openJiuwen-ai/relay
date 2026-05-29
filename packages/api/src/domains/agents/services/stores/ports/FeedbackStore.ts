/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type FeedbackVote = 1 | -1;

export interface FeedbackTrajectory {
  trajectoryId?: string;
  trajectoryRunId?: string;
  trajectoryStepId?: string;
  trajectoryEventIds?: string[];
  trajectoryEventNames?: string[];
}

export interface FeedbackRecord {
  threadId: string;
  messageId: string;
  userId: string;
  vote: FeedbackVote;
  timestamp: number;
  invocationId?: string;
  originalTraceId?: string;
  apmConversationReported?: boolean;
  trajectory?: FeedbackTrajectory;
  model?: string;
  provider?: string;
  catId?: string;
  reason: string | null;
}

export interface IFeedbackStore {
  set(record: FeedbackRecord): void | Promise<void>;
  get(threadId: string, messageId: string, userId: string): FeedbackRecord | null | Promise<FeedbackRecord | null>;
  getByThread(threadId: string, userId: string): Record<string, FeedbackRecord> | Promise<Record<string, FeedbackRecord>>;
  deleteByMessage(threadId: string, messageId: string): number | Promise<number>;
  deleteByThread(threadId: string): number | Promise<number>;
}

export class FeedbackStore implements IFeedbackStore {
  private readonly records = new Map<string, FeedbackRecord>();
  private readonly threadIndex = new Map<string, Set<string>>();

  private recordKey(threadId: string, messageId: string, userId: string): string {
    return `${threadId}:${messageId}:${userId}`;
  }

  private threadKey(threadId: string): string {
    return threadId;
  }

  set(record: FeedbackRecord): void {
    const key = this.recordKey(record.threadId, record.messageId, record.userId);
    this.records.set(key, { ...record });
    const threadKey = this.threadKey(record.threadId);
    const index = this.threadIndex.get(threadKey) ?? new Set<string>();
    index.add(`${record.messageId}:${record.userId}`);
    this.threadIndex.set(threadKey, index);
  }

  get(threadId: string, messageId: string, userId: string): FeedbackRecord | null {
    return this.records.get(this.recordKey(threadId, messageId, userId)) ?? null;
  }

  getByThread(threadId: string, userId: string): Record<string, FeedbackRecord> {
    const result: Record<string, FeedbackRecord> = {};
    const index = this.threadIndex.get(this.threadKey(threadId));
    if (!index) return result;
    for (const entry of index) {
      const [messageId, entryUserId] = entry.split(':');
      if (!messageId || entryUserId !== userId) continue;
      const record = this.get(threadId, messageId, userId);
      if (record) result[messageId] = record;
    }
    return result;
  }

  deleteByMessage(threadId: string, messageId: string): number {
    const index = this.threadIndex.get(this.threadKey(threadId));
    if (!index) return 0;
    let deleted = 0;
    for (const entry of [...index]) {
      const [entryMessageId, userId] = entry.split(':');
      if (entryMessageId !== messageId || !userId) continue;
      if (this.records.delete(this.recordKey(threadId, messageId, userId))) deleted += 1;
      index.delete(entry);
    }
    if (index.size === 0) this.threadIndex.delete(this.threadKey(threadId));
    return deleted;
  }

  deleteByThread(threadId: string): number {
    const index = this.threadIndex.get(this.threadKey(threadId));
    if (!index) return 0;
    let deleted = 0;
    for (const entry of index) {
      const [messageId, userId] = entry.split(':');
      if (!messageId || !userId) continue;
      if (this.records.delete(this.recordKey(threadId, messageId, userId))) deleted += 1;
    }
    this.threadIndex.delete(this.threadKey(threadId));
    return deleted;
  }
}
