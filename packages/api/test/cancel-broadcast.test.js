/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cancel broadcast integration test
 * Verifies that cancel_invocation produces correct agentId-aware broadcasts.
 *
 * Tests the REAL production buildCancelMessages function (not a copy).
 * - Single system_info message (no "cancel chorus")
 * - Per-cat done messages to clear each cat's loading state
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { InvocationTracker } = await import('../dist/domains/agents/services/agents/invocation/InvocationTracker.js');
const { buildCancelMessages } = await import('../dist/infrastructure/websocket/SocketManager.js');

describe('buildCancelMessages (production function)', () => {
  test('single cat cancel: 1 system_info + 1 done with correct agentId', () => {
    const tracker = new InvocationTracker();
    // start(threadId, agentId, userId, agentIds)
    tracker.start('t1', 'gemini', 'user1', ['gemini']);
    const result = tracker.cancel('t1', 'gemini', 'user1');
    const messages = buildCancelMessages(result);

    assert.equal(messages.length, 2);
    assert.equal(messages[0].type, 'system_info');
    assert.equal(messages[0].agentId, 'gemini');
    assert.equal(messages[1].type, 'done');
    assert.equal(messages[1].agentId, 'gemini');
    assert.equal(messages[1].isFinal, true);
  });

  test('multi-cat cancel: 1 system_info + N done (no cancel chorus)', () => {
    const tracker = new InvocationTracker();
    // start(threadId, agentId, userId, agentIds) — primary cat is opus
    tracker.start('t1', 'opus', 'user1', ['opus', 'codex', 'gemini']);
    const result = tracker.cancel('t1', 'opus', 'user1');
    const messages = buildCancelMessages(result);

    // 1 system_info + 3 done = 4 total
    assert.equal(messages.length, 4);

    // Only one system_info (not three!)
    const systemInfos = messages.filter((m) => m.type === 'system_info');
    assert.equal(systemInfos.length, 1);
    assert.equal(systemInfos[0].agentId, 'opus');

    // Three done messages, one per cat
    const dones = messages.filter((m) => m.type === 'done');
    assert.equal(dones.length, 3);
    assert.deepEqual(
      dones.map((d) => d.agentId),
      ['opus', 'codex', 'gemini'],
    );
    assert.ok(dones.every((d) => d.isFinal === true));
  });

  test('empty agentIds fallback: defaults to opus', () => {
    const tracker = new InvocationTracker();
    // start(threadId, agentId, userId) — no agentIds
    tracker.start('t1', 'opus', 'user1');
    const result = tracker.cancel('t1', 'opus', 'user1');
    const messages = buildCancelMessages(result);

    assert.equal(messages.length, 2);
    assert.equal(messages[0].agentId, 'opus');
    assert.equal(messages[1].agentId, 'opus');
  });

  test('failed cancel: no messages', () => {
    const result = { cancelled: false, agentIds: [] };
    const messages = buildCancelMessages(result);
    assert.equal(messages.length, 0);
  });

  test('cancelled with unknown agentId still produces messages (F32-a: any string is valid agentId)', () => {
    // F32-a: createAgentId accepts any non-empty string, so unknown agentId no longer throws
    const result = { cancelled: true, agentIds: ['unknown-cat'] };
    const messages = buildCancelMessages(result);
    assert.equal(messages.length, 2); // system + done
    assert.equal(messages[0].agentId, 'unknown-cat');
  });
});
