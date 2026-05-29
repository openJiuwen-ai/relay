/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/** Metrics from system_info invocation_metrics / invocation_complete (per invocation). */
export type InvocationCompleteMetrics = { invocationId: string; durationMs: number };

/**
 * Build `extra.stream` for Redis append: keep invocationId and attach duration when
 * invocation_complete matched this bubble's invocation (survives F5 / history GET).
 */
export function streamExtraForPersistence(
  ownInvocationId: string | undefined,
  metrics: InvocationCompleteMetrics | undefined,
  flags?: { userStopped?: boolean },
): { invocationId: string; durationMs?: number; userStopped?: boolean } | undefined {
  if (!ownInvocationId) return undefined;
  const base =
    metrics &&
    metrics.invocationId === ownInvocationId &&
    typeof metrics.durationMs === 'number' &&
    Number.isFinite(metrics.durationMs) &&
    metrics.durationMs >= 0
      ? { invocationId: ownInvocationId, durationMs: metrics.durationMs }
      : { invocationId: ownInvocationId };
  if (flags?.userStopped) {
    return { ...base, userStopped: true };
  }
  return base;
}

/** Read whether the streaming draft was marked user-stopped (F5 / formal append carry-over). */
export async function draftHadUserStopped(
  draftStore: { getByThread(userId: string, threadId: string): unknown } | undefined,
  userId: string,
  threadId: string,
  ownInvocationId: string | undefined,
): Promise<boolean> {
  if (!draftStore || !ownInvocationId) return false;
  try {
    const drafts = (await draftStore.getByThread(userId, threadId)) as Array<{ invocationId: string; userStopped?: boolean }>;
    if (!Array.isArray(drafts)) return false;
    return drafts.some((d) => d.invocationId === ownInvocationId && d.userStopped === true);
  } catch {
    return false;
  }
}
