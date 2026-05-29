/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentInvocationInfo, ChatMessage } from '@/stores/chat-types';

export interface ResolveAssistantMessageTimestampInput {
  agentId: string;
  invocationId?: string;
  eventTimestamp?: number;
  agentInvocations?: Record<string, AgentInvocationInfo>;
  activeInvocations?: Record<string, { agentId: string; startedAt?: number }>;
  /** Current thread messages — used to keep handoff bubbles after prior timeline entries. */
  existingMessages?: Pick<ChatMessage, 'serverSeq' | 'deliveredAt' | 'timestamp' | 'type'>[];
}

function resolveInvocationStartedAt(input: ResolveAssistantMessageTimestampInput): number | undefined {
  const { agentId, invocationId, agentInvocations, activeInvocations } = input;
  if (invocationId) {
    const slotStartedAt = activeInvocations?.[invocationId]?.startedAt;
    if (typeof slotStartedAt === 'number' && Number.isFinite(slotStartedAt)) {
      return slotStartedAt;
    }
  }

  const agentStartedAt = agentInvocations?.[agentId]?.startedAt;
  if (typeof agentStartedAt === 'number' && Number.isFinite(agentStartedAt)) {
    return agentStartedAt;
  }

  if (activeInvocations) {
    let earliestStartedAt: number | undefined;
    for (const [slotId, slot] of Object.entries(activeInvocations)) {
      if (slot.agentId !== agentId) continue;
      if (invocationId && slotId !== invocationId) continue;
      if (typeof slot.startedAt !== 'number' || !Number.isFinite(slot.startedAt)) continue;
      earliestStartedAt =
        earliestStartedAt === undefined ? slot.startedAt : Math.min(earliestStartedAt, slot.startedAt);
    }
    if (earliestStartedAt !== undefined) return earliestStartedAt;
  }

  return undefined;
}

/**
 * Stable ordering timestamp for assistant bubbles during multi-agent handoff.
 * Prefer backend event time, then invocation start time (causal order), then now.
 * When a delegate agent's invocation startedAt is earlier than an already-visible
 * orchestrator bubble, clamp after the current timeline tail so UI matches socket order.
 */
export function resolveAssistantMessageTimestamp(input: ResolveAssistantMessageTimestampInput): number {
  let candidate: number;
  if (typeof input.eventTimestamp === 'number' && Number.isFinite(input.eventTimestamp)) {
    candidate = input.eventTimestamp;
  } else {
    candidate = resolveInvocationStartedAt(input) ?? Date.now();
  }

  const existing = input.existingMessages;
  if (!existing?.length) return candidate;

  const timelineFloor = existing.reduce((max, message) => Math.max(max, getMessageOrderValue(message)), 0);
  if (timelineFloor > 0 && candidate <= timelineFloor) {
    return timelineFloor + 1;
  }
  return candidate;
}

export function getMessageOrderValue(msg: Pick<ChatMessage, 'serverSeq' | 'deliveredAt' | 'timestamp'>): number {
  if (typeof msg.serverSeq === 'number' && Number.isFinite(msg.serverSeq)) {
    return msg.serverSeq;
  }
  return msg.deliveredAt ?? msg.timestamp;
}

export function compareMessagesByOrder(
  a: Pick<ChatMessage, 'id' | 'serverSeq' | 'deliveredAt' | 'timestamp'>,
  b: Pick<ChatMessage, 'id' | 'serverSeq' | 'deliveredAt' | 'timestamp'>,
): number {
  const aValue = getMessageOrderValue(a);
  const bValue = getMessageOrderValue(b);
  if (aValue !== bValue) {
    return aValue - bValue;
  }
  // Preserve insertion order for messages with identical order keys.
  // Modern JavaScript Array.prototype.sort is stable, so returning 0 keeps
  // the existing relative order and avoids reordering concurrent bubbles.
  return 0;
}
