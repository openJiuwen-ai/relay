/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F052 regression: cross-thread messages from the same agentId
 * must NOT be filtered out by the self-message exclusion in
 * assembleIncrementalContext.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { assembleIncrementalContext } = await import('../dist/domains/agents/services/agents/routing/route-helpers.js');

function mockMsg(overrides) {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    threadId: 'thread-1',
    userId: 'user-1',
    agentId: null,
    content: 'test message',
    mentions: [],
    timestamp: Date.now(),
    origin: 'callback',
    ...overrides,
  };
}

function makeDeps(messages) {
  return {
    services: {},
    invocationDeps: {},
    messageStore: {
      getByThreadAfter: async () => messages,
    },
    deliveryCursorStore: {
      getCursor: async () => undefined,
    },
  };
}

describe('F052: crossPost self-filter exemption', () => {
  test('same-cat crossPost message is included in incremental context', async () => {
    const crossPostMsg = mockMsg({
      agentId: 'opus',
      content: 'Cross-thread message from opus in another thread',
      extra: { crossPost: { sourceThreadId: 'other-thread-123' } },
    });
    const deps = makeDeps([crossPostMsg]);

    const result = await assembleIncrementalContext(deps, 'user-1', 'thread-1', 'opus');

    assert.ok(
      result.contextText.includes('Cross-thread message from opus'),
      `crossPost from same agentId should appear in context, got: "${result.contextText}"`,
    );
  });

  test('regular same-cat message is still filtered out', async () => {
    const selfMsg = mockMsg({
      agentId: 'opus',
      content: 'My own regular message',
    });
    const deps = makeDeps([selfMsg]);

    const result = await assembleIncrementalContext(deps, 'user-1', 'thread-1', 'opus');

    assert.equal(result.contextText, '', 'regular self message should still be excluded');
  });

  test('other-cat crossPost is also included (no regression)', async () => {
    const otherCatCrossPost = mockMsg({
      agentId: 'codex',
      content: 'Cross-thread from codex',
      extra: { crossPost: { sourceThreadId: 'other-thread-456' } },
    });
    const deps = makeDeps([otherCatCrossPost]);

    const result = await assembleIncrementalContext(deps, 'user-1', 'thread-1', 'opus');

    assert.ok(
      result.contextText.includes('Cross-thread from codex'),
      'crossPost from different cat should be included',
    );
  });
});
