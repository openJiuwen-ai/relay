/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Anti-Cascade Guard Tests (F086 M1 — Task 6)
 *
 * Validates:
 * - A cat that is an active multi-mention target cannot create new multi-mentions
 * - A cat that is NOT a target can create multi-mentions normally
 * - Guard clears after multi-mention completes (done/timeout/failed)
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry, createAgentId } from '@openjiuwen/relay-shared';

// Bootstrap officeClawRegistry
for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
  if (!officeClawRegistry.has(id)) officeClawRegistry.register(id, config);
}

const { MultiMentionOrchestrator } = await import(
  '../dist/domains/agents/services/agents/routing/MultiMentionOrchestrator.js'
);

describe('Anti-Cascade Guard', () => {
  /** @type {InstanceType<typeof MultiMentionOrchestrator>} */
  let orch;

  const opus = createAgentId('opus');
  const codex = createAgentId('codex');
  const gemini = createAgentId('gemini');

  beforeEach(() => {
    orch = new MultiMentionOrchestrator();
  });

  test('isActiveTarget returns true for targets in running request', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex, gemini],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.start(req.id);

    assert.equal(orch.isActiveTarget('thread1', codex), true);
    assert.equal(orch.isActiveTarget('thread1', gemini), true);
    // Initiator is not a target
    assert.equal(orch.isActiveTarget('thread1', opus), false);
  });

  test('isActiveTarget returns true for targets in partial request', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex, gemini],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.start(req.id);
    orch.recordResponse(req.id, codex, 'answer');

    // codex responded but gemini hasn't — both still "active targets"
    // because the request is still running (partial)
    assert.equal(orch.isActiveTarget('thread1', codex), true);
    assert.equal(orch.isActiveTarget('thread1', gemini), true);
  });

  test('isActiveTarget returns false after request completes (done)', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.start(req.id);
    orch.recordResponse(req.id, codex, 'answer');

    assert.equal(orch.getStatus(req.id), 'done');
    assert.equal(orch.isActiveTarget('thread1', codex), false);
  });

  test('isActiveTarget returns false after timeout', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.start(req.id);
    orch.handleTimeout(req.id);

    assert.equal(orch.isActiveTarget('thread1', codex), false);
  });

  test('isActiveTarget returns false after failure', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.handleFailure(req.id, 'dispatch error');

    assert.equal(orch.isActiveTarget('thread1', codex), false);
  });

  test('isActiveTarget is scoped to thread', () => {
    const req = orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex],
      question: 'test',
      timeoutMinutes: 8,
    });
    orch.start(req.id);

    assert.equal(orch.isActiveTarget('thread1', codex), true);
    assert.equal(orch.isActiveTarget('thread2', codex), false);
  });

  test('isActiveTarget returns false for pending requests (not yet started)', () => {
    orch.create({
      threadId: 'thread1',
      initiator: opus,
      callbackTo: opus,
      targets: [codex],
      question: 'test',
      timeoutMinutes: 8,
    });

    // Pending is not "active" — guard only applies to running/partial
    assert.equal(orch.isActiveTarget('thread1', codex), false);
  });
});
