/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { Redis } from 'ioredis';
import type { TaskProgressSnapshot, TaskProgressStore } from './TaskProgressStore.js';

/**
 * Redis-backed task progress snapshots.
 *
 * Key naming:
 * - Use bare keys. Our ioredis client applies `office-claw:` via keyPrefix.
 */
function threadKey(threadId: string): string {
  return `task-progress:${threadId}`;
}

export class RedisTaskProgressStore implements TaskProgressStore {
  constructor(
    private readonly redis: Pick<Redis, 'hget' | 'hset' | 'hgetall' | 'hdel' | 'expire' | 'del'>,
    private readonly defaultTtlSeconds: number,
  ) {}

  async getSnapshot(threadId: string, agentId: AgentId): Promise<TaskProgressSnapshot | null> {
    const raw = await this.redis.hget(threadKey(threadId), agentId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TaskProgressSnapshot;
    } catch {
      return null;
    }
  }

  async setSnapshot(snapshot: TaskProgressSnapshot, options?: { ttlSeconds?: number }): Promise<void> {
    const key = threadKey(snapshot.threadId);
    await this.redis.hset(key, snapshot.agentId, JSON.stringify(snapshot));
    const ttl = options?.ttlSeconds ?? this.defaultTtlSeconds;
    if (ttl > 0) await this.redis.expire(key, ttl);
  }

  async deleteSnapshot(threadId: string, agentId: AgentId): Promise<void> {
    await this.redis.hdel(threadKey(threadId), agentId);
  }

  async getThreadSnapshots(threadId: string): Promise<Record<string, TaskProgressSnapshot>> {
    const all = await this.redis.hgetall(threadKey(threadId));
    const out: Record<string, TaskProgressSnapshot> = {};
    for (const [agentId, raw] of Object.entries(all)) {
      try {
        out[agentId] = JSON.parse(raw) as TaskProgressSnapshot;
      } catch {
        // best-effort: ignore corrupted entries
      }
    }
    return out;
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.redis.del(threadKey(threadId));
  }
}
