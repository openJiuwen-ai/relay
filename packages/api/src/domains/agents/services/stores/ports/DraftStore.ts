/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Draft Store — streaming draft persistence (#80)
 *
 * Stores partial content during agent streaming so that F5 refresh
 * can recover in-progress messages from Redis instead of losing them.
 *
 * Key design decisions:
 * - userId-scoped for isolation (R1 P1-1)
 * - invocationId as primary identifier (supports parallel streaming)
 * - explicit cleanup only (no TTL auto-expiry)
 */

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { DraftRecord, IDraftStore } from '@openjiuwen/relay-api-server-contracts/storage';

import type { DraftRecord, IDraftStore } from '@openjiuwen/relay-api-server-contracts/storage';

/** Default TTL for drafts: disabled (explicit cleanup only) */
const DEFAULT_DRAFT_TTL_MS = 0;

/**
 * In-memory DraftStore implementation.
 * Uses Map with TTL simulation via updatedAt + reap on read.
 */
export class DraftStore implements IDraftStore {
  private drafts = new Map<string, DraftRecord>();
  private ttlMs: number | null;

  constructor(options?: { ttlMs?: number }) {
    const ttl = options?.ttlMs ?? DEFAULT_DRAFT_TTL_MS;
    this.ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : null;
  }

  private key(userId: string, threadId: string, invocationId: string): string {
    return `${userId}:${threadId}:${invocationId}`;
  }

  upsert(draft: DraftRecord): void {
    const k = this.key(draft.userId, draft.threadId, draft.invocationId);
    const prev = this.drafts.get(k);
    const merged: DraftRecord =
      prev?.userStopped && !draft.userStopped ? { ...draft, userStopped: true } : draft;
    this.drafts.set(k, merged);
  }

  touch(userId: string, threadId: string, invocationId: string): void {
    const k = this.key(userId, threadId, invocationId);
    const existing = this.drafts.get(k);
    if (existing) {
      existing.updatedAt = Date.now();
    }
  }

  getByThread(userId: string, threadId: string): DraftRecord[] {
    const now = Date.now();
    const results: DraftRecord[] = [];
    const prefix = `${userId}:${threadId}:`;
    for (const [k, v] of this.drafts) {
      if (!k.startsWith(prefix)) continue;
      if (this.ttlMs !== null && now - v.updatedAt > this.ttlMs) {
        this.drafts.delete(k);
        continue;
      }
      results.push(v);
    }
    return results;
  }

  delete(userId: string, threadId: string, invocationId: string): void {
    this.drafts.delete(this.key(userId, threadId, invocationId));
  }

  deleteByThread(userId: string, threadId: string): void {
    const prefix = `${userId}:${threadId}:`;
    for (const k of this.drafts.keys()) {
      if (k.startsWith(prefix)) {
        this.drafts.delete(k);
      }
    }
  }

  /** Expose size for testing */
  get size(): number {
    return this.drafts.size;
  }
}
