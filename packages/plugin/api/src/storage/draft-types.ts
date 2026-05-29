/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId, TaskRunPersistExtra } from '@openjiuwen/relay-shared';

export interface DraftRecord {
  userId: string;
  threadId: string;
  invocationId: string;
  agentId: AgentId;
  content: string;
  toolEvents?: unknown[];
  thinking?: string;
  taskRuns?: TaskRunPersistExtra;
  /** 用户手动停止 — 持久化到 Redis，刷新后仍显示停止态 */
  userStopped?: boolean;
  updatedAt: number;
}

export interface IDraftStore {
  upsert(draft: DraftRecord): void | Promise<void>;
  touch(userId: string, threadId: string, invocationId: string): void | Promise<void>;
  getByThread(userId: string, threadId: string): DraftRecord[] | Promise<DraftRecord[]>;
  delete(userId: string, threadId: string, invocationId: string): void | Promise<void>;
  deleteByThread(userId: string, threadId: string): void | Promise<void>;
}
