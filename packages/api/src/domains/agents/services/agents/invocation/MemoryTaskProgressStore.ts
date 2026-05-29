/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { TaskProgressSnapshot, TaskProgressStore } from './TaskProgressStore.js';

export class MemoryTaskProgressStore implements TaskProgressStore {
  private readonly byThread = new Map<string, Map<string, TaskProgressSnapshot>>();

  async getSnapshot(threadId: string, agentId: AgentId): Promise<TaskProgressSnapshot | null> {
    return this.byThread.get(threadId)?.get(agentId) ?? null;
  }

  async setSnapshot(snapshot: TaskProgressSnapshot): Promise<void> {
    let thread = this.byThread.get(snapshot.threadId);
    if (!thread) {
      thread = new Map<string, TaskProgressSnapshot>();
      this.byThread.set(snapshot.threadId, thread);
    }
    thread.set(snapshot.agentId, snapshot);
  }

  async deleteSnapshot(threadId: string, agentId: AgentId): Promise<void> {
    const thread = this.byThread.get(threadId);
    if (!thread) return;
    thread.delete(agentId);
    if (thread.size === 0) this.byThread.delete(threadId);
  }

  async getThreadSnapshots(threadId: string): Promise<Record<string, TaskProgressSnapshot>> {
    const thread = this.byThread.get(threadId);
    if (!thread) return {};
    return Object.fromEntries(thread.entries());
  }

  async deleteThread(threadId: string): Promise<void> {
    this.byThread.delete(threadId);
  }
}
