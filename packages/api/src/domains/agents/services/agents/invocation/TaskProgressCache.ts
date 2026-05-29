/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F045: In-memory task progress cache for persistence across page refresh.
 * Module-level state — lost on server restart (acceptable for V1).
 */

export interface CachedTaskItem {
  id: string;
  subject: string;
  status: string;
  activeForm?: string;
}

export interface CachedTaskProgress {
  tasks: CachedTaskItem[];
  lastUpdate: number;
}

const cache = new Map<string, Record<string, CachedTaskProgress>>();

export function setTaskProgress(threadId: string, agentId: string, tasks: CachedTaskItem[]): void {
  let byThread = cache.get(threadId);
  if (!byThread) {
    byThread = {};
    cache.set(threadId, byThread);
  }
  byThread[agentId] = { tasks, lastUpdate: Date.now() };
}

export function getTaskProgress(threadId: string): Record<string, CachedTaskProgress> | null {
  return cache.get(threadId) ?? null;
}

export function clearTaskProgress(threadId: string, agentId: string): void {
  const byThread = cache.get(threadId);
  if (!byThread) return;
  delete byThread[agentId];
  if (Object.keys(byThread).length === 0) cache.delete(threadId);
}
