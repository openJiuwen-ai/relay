/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Task Store (毛线球)
 * 内存实现，Map-based，有界 (MAX=500)。
 *
 * ID 使用 generateSortableId 保证天然有序。
 */

import type { CreateTaskInput, TaskItem, UpdateTaskInput } from '@openjiuwen/relay-shared';
import { generateSortableId } from './MessageStore.js';

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { ITaskStore } from '@openjiuwen/relay-api-server-contracts/storage';

import type { ITaskStore } from '@openjiuwen/relay-api-server-contracts/storage';

const MAX_TASKS = 500;

/**
 * In-memory task store with bounded capacity.
 */
export class TaskStore implements ITaskStore {
  private tasks: Map<string, TaskItem> = new Map();
  private readonly maxTasks: number;

  constructor(options?: { maxTasks?: number }) {
    this.maxTasks = options?.maxTasks ?? MAX_TASKS;
  }

  create(input: CreateTaskInput): TaskItem {
    this.evictDoneIfNeeded();

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

    this.tasks.set(task.id, task);
    return task;
  }

  get(taskId: string): TaskItem | null {
    return this.tasks.get(taskId) ?? null;
  }

  update(taskId: string, input: UpdateTaskInput): TaskItem | null {
    const existing = this.tasks.get(taskId);
    if (!existing) return null;

    const updated: TaskItem = {
      ...existing,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.ownerAgentId !== undefined ? { ownerAgentId: input.ownerAgentId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.why !== undefined ? { why: input.why } : {}),
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updated);
    return updated;
  }

  listByThread(threadId: string): TaskItem[] {
    const result: TaskItem[] = [];
    for (const task of this.tasks.values()) {
      if (task.threadId === threadId) {
        result.push(task);
      }
    }
    // Natural order by sortable ID (ascending = oldest first)
    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
  }

  delete(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /** Delete all tasks in a thread. Returns count of deleted tasks. */
  deleteByThread(threadId: string): number {
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (task.threadId === threadId) {
        this.tasks.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Current task count (for testing) */
  get size(): number {
    return this.tasks.size;
  }

  /** Evict oldest done tasks when at capacity */
  private evictDoneIfNeeded(): void {
    if (this.tasks.size < this.maxTasks) return;

    // First pass: evict 'done' tasks (oldest first — Map insertion order)
    for (const [id, task] of this.tasks) {
      if (task.status === 'done') {
        this.tasks.delete(id);
        if (this.tasks.size < this.maxTasks) return;
      }
    }

    // If still full, evict oldest task regardless of status
    if (this.tasks.size >= this.maxTasks) {
      const firstKey = this.tasks.keys().next().value;
      if (firstKey) this.tasks.delete(firstKey);
    }
  }
}
