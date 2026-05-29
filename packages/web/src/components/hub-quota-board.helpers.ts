/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentInvocationInfo, ThreadState } from '@/stores/chat-types';

export type QuotaUtilizationLevel = 'ok' | 'warn' | 'high' | 'critical';

export interface AgentQuotaSnapshot {
  agentId: string;
  threadId: string;
  updatedAt: number;
  invocation: AgentInvocationInfo;
}

interface CollectQuotaInput {
  currentThreadId: string;
  activeCatInvocations: Record<string, AgentInvocationInfo>;
  threadStates: Record<string, ThreadState>;
}

function hasQuotaTelemetry(invocation: AgentInvocationInfo): boolean {
  const usage = invocation.usage;
  const hasUsage = Boolean(
    usage &&
      (usage.inputTokens != null ||
        usage.outputTokens != null ||
        usage.totalTokens != null ||
        usage.cacheReadTokens != null ||
        usage.contextUsedTokens != null ||
        usage.contextWindowSize != null),
  );

  const rateLimit = invocation.rateLimit;
  const hasRateLimit = Boolean(
    rateLimit &&
      (rateLimit.utilization != null || (typeof rateLimit.resetsAt === 'string' && rateLimit.resetsAt.length > 0)),
  );

  const contextHealth = invocation.contextHealth;
  const hasContextHealth = Boolean(
    contextHealth && (contextHealth.usedTokens > 0 || contextHealth.windowTokens > 0 || contextHealth.fillRatio > 0),
  );

  return hasUsage || hasRateLimit || hasContextHealth;
}

function resolveUpdatedAt(invocation: AgentInvocationInfo, fallbackLastActivity = 0): number {
  const measuredAt = invocation.contextHealth?.measuredAt;
  const hasQuotaTelemetryTimestamp = typeof measuredAt === 'number' && measuredAt > 0;

  // Prefer direct telemetry timestamps when present; don't let thread activity
  // or non-quota events artificially "elevate" stale quota snapshots.
  if (hasQuotaTelemetryTimestamp) {
    return measuredAt!;
  }

  return Math.max(fallbackLastActivity, 0);
}

function hasTelemetryTimestamp(invocation: AgentInvocationInfo): boolean {
  const measuredAt = invocation.contextHealth?.measuredAt;
  return typeof measuredAt === 'number' && measuredAt > 0;
}

export function collectLatestQuotaByCat(input: CollectQuotaInput): Record<string, AgentQuotaSnapshot> {
  const { currentThreadId, activeCatInvocations, threadStates } = input;
  const result: Record<string, AgentQuotaSnapshot> = {};
  const activeThreadLastActivity = threadStates[currentThreadId]?.lastActivity ?? 0;

  const upsert = (threadId: string, agentId: string, invocation: AgentInvocationInfo, fallbackLastActivity = 0) => {
    if (!hasQuotaTelemetry(invocation)) return;

    const updatedAt = resolveUpdatedAt(invocation, fallbackLastActivity);
    const current = result[agentId];
    if (!current) {
      result[agentId] = { agentId, threadId, updatedAt, invocation };
      return;
    }
    const incomingHasTelemetry = hasTelemetryTimestamp(invocation);
    const currentHasTelemetry = hasTelemetryTimestamp(current.invocation);
    if (incomingHasTelemetry && !currentHasTelemetry) {
      result[agentId] = { agentId, threadId, updatedAt, invocation };
      return;
    }
    if (!incomingHasTelemetry && currentHasTelemetry) {
      return;
    }
    if (!incomingHasTelemetry && !currentHasTelemetry) {
      const incomingIsCurrent = threadId === currentThreadId;
      const currentIsCurrent = current.threadId === currentThreadId;
      if (incomingIsCurrent && !currentIsCurrent) {
        result[agentId] = { agentId, threadId, updatedAt, invocation };
        return;
      }
      if (!incomingIsCurrent && currentIsCurrent) {
        return;
      }
    }
    if (updatedAt > current.updatedAt) {
      result[agentId] = { agentId, threadId, updatedAt, invocation };
      return;
    }
    if (updatedAt === current.updatedAt && threadId === currentThreadId && current.threadId !== currentThreadId) {
      result[agentId] = { agentId, threadId, updatedAt, invocation };
    }
  };

  for (const [agentId, invocation] of Object.entries(activeCatInvocations)) {
    upsert(currentThreadId, agentId, invocation, activeThreadLastActivity);
  }

  for (const [threadId, state] of Object.entries(threadStates)) {
    if (threadId === currentThreadId) continue;
    for (const [agentId, invocation] of Object.entries(state.agentInvocations)) {
      upsert(threadId, agentId, invocation, state.lastActivity);
    }
  }

  return result;
}

export function classifyQuotaUtilization(utilization: number | undefined): QuotaUtilizationLevel {
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) return 'ok';
  if (utilization >= 0.95) return 'critical';
  if (utilization >= 0.9) return 'high';
  if (utilization >= 0.8) return 'warn';
  return 'ok';
}
