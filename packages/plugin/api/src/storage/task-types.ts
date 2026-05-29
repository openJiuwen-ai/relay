/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CreateTaskInput, TaskItem, UpdateTaskInput } from '@openjiuwen/relay-shared';

export type { CreateTaskInput, TaskItem, UpdateTaskInput };

export interface ITaskStore {
  create(input: CreateTaskInput): TaskItem | Promise<TaskItem>;
  get(taskId: string): TaskItem | null | Promise<TaskItem | null>;
  update(taskId: string, input: UpdateTaskInput): TaskItem | null | Promise<TaskItem | null>;
  listByThread(threadId: string): TaskItem[] | Promise<TaskItem[]>;
  delete(taskId: string): boolean | Promise<boolean>;
  deleteByThread(threadId: string): number | Promise<number>;
}
