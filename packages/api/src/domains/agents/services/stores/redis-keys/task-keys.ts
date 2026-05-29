/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for task storage.
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const TaskKeys = {
  /** Hash with task details: task:{taskId} */
  detail: (id: string) => `task:${id}`,

  /** Per-thread task list sorted set: tasks:thread:{threadId} */
  thread: (threadId: string) => `tasks:thread:${threadId}`,
} as const;
