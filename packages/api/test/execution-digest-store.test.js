/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

/** @returns {import('../dist/domains/projects/execution-digest-store.js').CreateDigestInput} */
function makeDigest(overrides = {}) {
  return {
    projectPath: '/projects/relay-station/awesome-app',
    threadId: 'thread-001',
    agentId: 'opus',
    missionPack: {
      mission: 'Fix the login bug',
      workItem: 'BUG-42',
      phase: 'implementation',
      doneWhen: ['Login works with valid creds', 'Error message shown for invalid creds'],
      links: [],
    },
    userId: 'user1',
    completedAt: Date.now(),
    summary: 'Fixed auth validation and added error handling',
    filesChanged: ['src/auth.ts', 'src/auth.test.ts'],
    status: /** @type {const} */ ('completed'),
    doneWhenResults: [
      { criterion: 'Login works with valid creds', met: true, evidence: 'Test passes' },
      { criterion: 'Error message shown for invalid creds', met: true, evidence: 'Test passes' },
    ],
    nextSteps: ['Deploy to staging'],
    ...overrides,
  };
}

describe('ExecutionDigestStore', () => {
  /** @type {import('../dist/domains/projects/execution-digest-store.js').ExecutionDigestStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/execution-digest-store.js');
    store = new mod.ExecutionDigestStore();
  });

  test('create() returns digest with generated id', () => {
    const digest = store.create(makeDigest());
    assert.ok(digest.id.startsWith('ed-'));
    assert.equal(digest.projectPath, '/projects/relay-station/awesome-app');
    assert.equal(digest.threadId, 'thread-001');
    assert.equal(digest.agentId, 'opus');
    assert.equal(digest.status, 'completed');
    assert.equal(digest.filesChanged.length, 2);
  });

  test('getById() returns digest or undefined', () => {
    const digest = store.create(makeDigest());
    assert.deepEqual(store.getById(digest.id), digest);
    assert.equal(store.getById('nonexistent'), undefined);
  });

  test('listByProject() returns digests for a project, newest first', () => {
    const d1 = store.create(makeDigest({ completedAt: 1000 }));
    store.create(makeDigest({ projectPath: '/other', completedAt: 2000 }));
    const d3 = store.create(makeDigest({ completedAt: 3000 }));

    const results = store.listByProject('/projects/relay-station/awesome-app', 'user1');
    assert.equal(results.length, 2);
    assert.equal(results[0].id, d3.id);
    assert.equal(results[1].id, d1.id);
  });

  test('listByThread() returns digests for a thread', () => {
    store.create(makeDigest({ threadId: 'thread-001' }));
    store.create(makeDigest({ threadId: 'thread-002' }));
    store.create(makeDigest({ threadId: 'thread-001' }));

    const results = store.listByThread('thread-001', 'user1');
    assert.equal(results.length, 2);
    for (const d of results) assert.equal(d.threadId, 'thread-001');
  });

  test('listAll() returns all digests, newest first', () => {
    store.create(makeDigest({ completedAt: 1000 }));
    store.create(makeDigest({ completedAt: 3000 }));
    store.create(makeDigest({ completedAt: 2000 }));

    const results = store.listAll('user1');
    assert.equal(results.length, 3);
    assert.ok(results[0].completedAt >= results[1].completedAt);
    assert.ok(results[1].completedAt >= results[2].completedAt);
  });
});
