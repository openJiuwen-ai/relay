/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Task Types
 * 智能体任务系统 — 让每个智能体追踪自己负责的事项
 */

import type { AgentId } from './ids.js';

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';

export interface TaskItem {
  readonly id: string;
  readonly threadId: string;
  readonly title: string;
  readonly ownerAgentId: AgentId | null;
  readonly status: TaskStatus;
  readonly why: string;
  readonly createdBy: AgentId | 'user';
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Source message ID for traceability (4-A feature) */
  readonly sourceMessageId?: string;
  /** Source summary ID for traceability (4-A feature) */
  readonly sourceSummaryId?: string;
}

export type CreateTaskInput = Pick<TaskItem, 'threadId' | 'title' | 'why' | 'createdBy'> & {
  ownerAgentId?: AgentId | null;
  sourceMessageId?: string;
  sourceSummaryId?: string;
};

/** Mutable partial for updates — strips readonly from TaskItem fields */
export type UpdateTaskInput = {
  title?: string;
  ownerAgentId?: AgentId | null;
  status?: TaskStatus;
  why?: string;
};
