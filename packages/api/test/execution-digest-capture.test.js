/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

/** @type {import('../dist/config/governance/execution-digest-capture.js').CaptureContext} */
const ctx = {
  projectPath: '/projects/awesome-app',
  threadId: 'thread-001',
  agentId: 'opus',
  userId: 'user1',
};

/** @type {import('@openjiuwen/relay-shared').DispatchMissionPack} */
const missionPack = {
  mission: 'Fix the login bug',
  workItem: 'BUG-42',
  phase: 'implementation',
  doneWhen: ['Login works', 'Error shown'],
  links: [],
};

describe('captureExecutionDigest', () => {
  test('completed dispatch → status=completed, all doneWhen met', async () => {
    const { captureExecutionDigest } = await import('../dist/config/governance/execution-digest-capture.js');
    const result = captureExecutionDigest(
      missionPack,
      { summary: 'Fixed auth', filesChanged: ['src/auth.ts'], blocked: false, hadError: false },
      ctx,
    );
    assert.equal(result.status, 'completed');
    assert.equal(result.projectPath, '/projects/awesome-app');
    assert.equal(result.agentId, 'opus');
    assert.equal(result.summary, 'Fixed auth');
    assert.deepEqual(result.filesChanged, ['src/auth.ts']);
    assert.equal(result.doneWhenResults.length, 2);
    assert.ok(result.doneWhenResults.every((r) => r.met));
    assert.ok(result.completedAt > 0);
  });

  test('blocked dispatch → status=blocked, doneWhen not met', async () => {
    const { captureExecutionDigest } = await import('../dist/config/governance/execution-digest-capture.js');
    const result = captureExecutionDigest(
      missionPack,
      { summary: 'Stuck on config', filesChanged: [], blocked: true, hadError: false },
      ctx,
    );
    assert.equal(result.status, 'blocked');
    assert.ok(result.doneWhenResults.every((r) => !r.met));
    assert.ok(result.doneWhenResults[0].evidence.includes('blocked'));
  });

  test('error dispatch → status=partial', async () => {
    const { captureExecutionDigest } = await import('../dist/config/governance/execution-digest-capture.js');
    const result = captureExecutionDigest(
      missionPack,
      { summary: 'Partial work done', filesChanged: ['a.ts'], blocked: false, hadError: true },
      ctx,
    );
    assert.equal(result.status, 'partial');
    assert.ok(result.doneWhenResults.every((r) => !r.met));
  });

  test('empty summary falls back to default', async () => {
    const { captureExecutionDigest } = await import('../dist/config/governance/execution-digest-capture.js');
    const result = captureExecutionDigest(
      missionPack,
      { summary: '', filesChanged: [], blocked: false, hadError: false },
      ctx,
    );
    assert.equal(result.summary, 'No summary available');
  });

  test('empty doneWhen → empty results array', async () => {
    const { captureExecutionDigest } = await import('../dist/config/governance/execution-digest-capture.js');
    const result = captureExecutionDigest(
      { ...missionPack, doneWhen: [] },
      { summary: 'Done', filesChanged: [], blocked: false, hadError: false },
      ctx,
    );
    assert.equal(result.doneWhenResults.length, 0);
  });
});
