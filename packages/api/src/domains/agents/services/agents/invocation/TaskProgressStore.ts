/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';

export type TaskProgressStatus = 'running' | 'completed' | 'interrupted';

export interface TaskProgressItem {
  id: string;
  subject: string;
  status: string;
  activeForm?: string;
}

export interface TaskProgressSnapshot {
  threadId: string;
  agentId: AgentId;
  tasks: TaskProgressItem[];
  status: TaskProgressStatus;
  updatedAt: number;
  lastInvocationId?: string;
  interruptReason?: string;
}

export interface TaskProgressStore {
  getSnapshot(threadId: string, agentId: AgentId): Promise<TaskProgressSnapshot | null>;
  setSnapshot(snapshot: TaskProgressSnapshot, options?: { ttlSeconds?: number }): Promise<void>;
  deleteSnapshot(threadId: string, agentId: AgentId): Promise<void>;
  getThreadSnapshots(threadId: string): Promise<Record<string, TaskProgressSnapshot>>;
  deleteThread(threadId: string): Promise<void>;
}
