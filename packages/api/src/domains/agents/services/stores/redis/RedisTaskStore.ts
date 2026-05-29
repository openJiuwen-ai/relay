/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis Task Store (毛线球)
 * Redis-backed task storage with same interface as in-memory TaskStore.
 *
 * Redis 数据结构:
 *   office-claw:task:{taskId}              → Hash (任务详情)
 *   office-claw:tasks:thread:{threadId}    → Sorted Set (每线程任务列表, score=createdAt)
 *
 * TTL 默认 30 天。
 */

import type { AgentId, CreateTaskInput, TaskItem, UpdateTaskInput } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { generateSortableId } from '../ports/MessageStore.js';
import type { ITaskStore } from '../ports/TaskStore.js';
import { TaskKeys } from '../redis-keys/task-keys.js';

const DEFAULT_TTL = 30 * 24 * 60 * 60; // 30 days

export class RedisTaskStore implements ITaskStore {
  private readonly redis: RedisClient;
  /** null means no expiration. */
  private readonly ttlSeconds: number | null;

  constructor(redis: RedisClient, options?: { ttlSeconds?: number }) {
    this.redis = redis;
    const ttl = options?.ttlSeconds;
    if (ttl === undefined) {
      this.ttlSeconds = DEFAULT_TTL;
    } else if (!Number.isFinite(ttl)) {
      this.ttlSeconds = DEFAULT_TTL;
    } else if (ttl <= 0) {
      this.ttlSeconds = null;
    } else {
      this.ttlSeconds = Math.floor(ttl);
    }
  }

  async create(input: CreateTaskInput): Promise<TaskItem> {
    const now = Date.now();
    const task: TaskItem = {
      id: generateSortableId(now),
      threadId: input.threadId,
      title: input.title,
      ownerAgentId: input.ownerAgentId ?? null,
      status: 'todo',
      why: input.why,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    const key = TaskKeys.detail(task.id);
    const pipeline = this.redis.multi();
    pipeline.hset(key, this.serializeTask(task));
    if (this.ttlSeconds !== null) {
      pipeline.expire(key, this.ttlSeconds);
    }
    pipeline.zadd(TaskKeys.thread(task.threadId), String(now), task.id);
    if (this.ttlSeconds !== null) {
      pipeline.expire(TaskKeys.thread(task.threadId), this.ttlSeconds);
    }
    await pipeline.exec();

    return task;
  }

  async get(taskId: string): Promise<TaskItem | null> {
    const data = await this.redis.hgetall(TaskKeys.detail(taskId));
    if (!data || !data.id) return null;
    return this.hydrateTask(data);
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<TaskItem | null> {
    const existing = await this.get(taskId);
    if (!existing) return null;

    const updated: TaskItem = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.why !== undefined ? { why: input.why } : {}),
      updatedAt: Date.now(),
    };

    await this.redis.hset(TaskKeys.detail(taskId), this.serializeTask(updated));
    return updated;
  }

  async listByThread(threadId: string): Promise<TaskItem[]> {
    const ids = await this.redis.zrange(TaskKeys.thread(threadId), 0, -1);
    if (ids.length === 0) return [];

    const pipeline = this.redis.multi();
    for (const id of ids) {
      pipeline.hgetall(TaskKeys.detail(id));
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const tasks: TaskItem[] = [];
    for (const [err, data] of results) {
      if (err || !data || typeof data !== 'object') continue;
      const d = data as Record<string, string>;
      if (!d.id) continue;
      tasks.push(this.hydrateTask(d));
    }
    return tasks;
  }

  async delete(taskId: string): Promise<boolean> {
    const data = await this.redis.hgetall(TaskKeys.detail(taskId));
    if (!data || !data.id) return false;

    const threadId = data.threadId ?? '';
    const pipeline = this.redis.multi();
    pipeline.del(TaskKeys.detail(taskId));
    if (threadId) {
      pipeline.zrem(TaskKeys.thread(threadId), taskId);
    }
    await pipeline.exec();
    return true;
  }

  /** Delete all tasks in a thread. Returns count of deleted tasks. */
  async deleteByThread(threadId: string): Promise<number> {
    const key = TaskKeys.thread(threadId);
    const ids = await this.redis.zrange(key, 0, -1);
    if (ids.length === 0) return 0;

    const pipeline = this.redis.multi();
    for (const id of ids) {
      pipeline.del(TaskKeys.detail(id));
    }
    pipeline.del(key);
    await pipeline.exec();

    return ids.length;
  }

  private serializeTask(task: TaskItem): Record<string, string> {
    return {
      id: task.id,
      threadId: task.threadId,
      title: task.title,
      ownerAgentId: task.ownerAgentId ?? '',
      status: task.status,
      why: task.why,
      createdBy: task.createdBy,
      createdAt: String(task.createdAt),
      updatedAt: String(task.updatedAt),
    };
  }

  private hydrateTask(data: Record<string, string>): TaskItem {
    return {
      id: data.id ?? '',
      threadId: data.threadId ?? '',
      title: data.title ?? '',
      ownerAgentId: (data.ownerAgentId || null) as AgentId | null,
      status: (data.status ?? 'todo') as TaskItem['status'],
      why: data.why ?? '',
      createdBy: (data.createdBy ?? 'user') as TaskItem['createdBy'],
      createdAt: parseInt(data.createdAt ?? '0', 10),
      updatedAt: parseInt(data.updatedAt ?? '0', 10),
    };
  }
}
