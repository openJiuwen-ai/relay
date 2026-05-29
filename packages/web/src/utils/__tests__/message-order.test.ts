/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { compareMessagesByOrder, resolveAssistantMessageTimestamp } from '../message-order';

describe('compareMessagesByOrder', () => {
  it('uses serverSeq when available', () => {
    const earlier = { id: 'a', timestamp: 100, deliveredAt: 200, serverSeq: 1 };
    const later = { id: 'b', timestamp: 1000, deliveredAt: 1100, serverSeq: 2 };
    expect(compareMessagesByOrder(earlier, later)).toBeLessThan(0);
    expect(compareMessagesByOrder(later, earlier)).toBeGreaterThan(0);
  });

  it('falls back to deliveredAt then timestamp when serverSeq is absent', () => {
    const earlier = { id: 'a', timestamp: 100, deliveredAt: 200 };
    const later = { id: 'b', timestamp: 300, deliveredAt: undefined };
    expect(compareMessagesByOrder(earlier, later)).toBeLessThan(0);
    expect(compareMessagesByOrder(later, earlier)).toBeGreaterThan(0);
  });

  it('preserves insertion order when order values are equal', () => {
    const msgA = { id: 'a', timestamp: 100, deliveredAt: 200 };
    const msgB = { id: 'b', timestamp: 100, deliveredAt: 200 };
    expect(compareMessagesByOrder(msgA, msgB)).toBe(0);
    expect(compareMessagesByOrder(msgB, msgA)).toBe(0);
  });
});

describe('resolveAssistantMessageTimestamp', () => {
  it('prefers backend event timestamp when present', () => {
    expect(
      resolveAssistantMessageTimestamp({
        agentId: 'office',
        eventTimestamp: 1500,
        agentInvocations: { office: { startedAt: 1000, invocationId: 'inv-1' } },
      }),
    ).toBe(1500);
  });

  it('clamps a later delegate bubble after an existing assistant bubble', () => {
    const existing = [
      { id: 'u1', type: 'user' as const, timestamp: 500 },
      { id: 'a1', type: 'assistant' as const, timestamp: 2000, agentId: 'assistant' },
    ];
    expect(
      resolveAssistantMessageTimestamp({
        agentId: 'agentteams',
        invocationId: 'inv-2',
        eventTimestamp: 1000,
        activeInvocations: {
          'inv-2': { agentId: 'agentteams', startedAt: 1000 },
        },
        existingMessages: existing,
      }),
    ).toBe(2001);
  });

  it('uses invocation startedAt for causal multi-agent ordering', () => {
    expect(
      resolveAssistantMessageTimestamp({
        agentId: 'office',
        invocationId: 'inv-office',
        activeInvocations: {
          'inv-office': { agentId: 'office', startedAt: 1000 },
          'inv-codex': { agentId: 'codex', startedAt: 5000 },
        },
        existingMessages: [],
      }),
    ).toBe(1000);
    expect(
      resolveAssistantMessageTimestamp({
        agentId: 'codex',
        invocationId: 'inv-codex',
        activeInvocations: {
          'inv-office': { agentId: 'office', startedAt: 1000 },
          'inv-codex': { agentId: 'codex', startedAt: 5000 },
        },
        existingMessages: [],
      }),
    ).toBe(5000);
  });
});
