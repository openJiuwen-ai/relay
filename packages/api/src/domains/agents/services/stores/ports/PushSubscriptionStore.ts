/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Push Subscription Store
 * 管理 Web Push 订阅记录 — 用户的设备订阅信息
 */

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { IPushSubscriptionStore, PushSubscriptionRecord } from '@openjiuwen/relay-api-server-contracts/storage';

import type { IPushSubscriptionStore, PushSubscriptionRecord } from '@openjiuwen/relay-api-server-contracts/storage';

const DEFAULT_MAX = 100;

export class PushSubscriptionStore implements IPushSubscriptionStore {
  private records = new Map<string, PushSubscriptionRecord>();
  private readonly maxRecords: number;

  constructor(options?: { maxRecords?: number }) {
    this.maxRecords = options?.maxRecords ?? DEFAULT_MAX;
  }

  upsert(record: PushSubscriptionRecord): void {
    // If at capacity and this is a new endpoint, evict oldest
    if (this.records.size >= this.maxRecords && !this.records.has(record.endpoint)) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey) this.records.delete(oldestKey);
    }
    this.records.set(record.endpoint, record);
  }

  remove(endpoint: string): boolean {
    return this.records.delete(endpoint);
  }

  removeForUser(userId: string, endpoint: string): boolean {
    const rec = this.records.get(endpoint);
    if (!rec || rec.userId !== userId) return false;
    return this.records.delete(endpoint);
  }

  listByUser(userId: string): PushSubscriptionRecord[] {
    const result: PushSubscriptionRecord[] = [];
    for (const rec of this.records.values()) {
      if (rec.userId === userId) result.push(rec);
    }
    return result;
  }

  listAll(): PushSubscriptionRecord[] {
    return [...this.records.values()];
  }
}
