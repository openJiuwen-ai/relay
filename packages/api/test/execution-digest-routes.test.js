/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

const H = { 'x-office-claw-user': 'user1' };

/** @returns {import('../dist/domains/projects/execution-digest-store.js').CreateDigestInput} */
function makeDigest(overrides = {}) {
  return {
    projectPath: '/projects/awesome-app',
    threadId: 'thread-001',
    agentId: 'opus',
    missionPack: {
      mission: 'Fix login bug',
      workItem: 'BUG-42',
      phase: 'implementation',
      doneWhen: ['Login works'],
      links: [],
    },
    userId: 'user1',
    completedAt: Date.now(),
    summary: 'Fixed auth',
    filesChanged: ['src/auth.ts'],
    status: /** @type {const} */ ('completed'),
    doneWhenResults: [{ criterion: 'Login works', met: true, evidence: 'Test passes' }],
    nextSteps: [],
    ...overrides,
  };
}

describe('Execution Digest Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  /** @type {import('../dist/domains/projects/execution-digest-store.js').ExecutionDigestStore} */
  let store;

  beforeEach(async () => {
    const { ExecutionDigestStore } = await import('../dist/domains/projects/execution-digest-store.js');
    const { executionDigestRoutes } = await import('../dist/routes/execution-digests.js');
    store = new ExecutionDigestStore();
    app = Fastify();
    await app.register(executionDigestRoutes, { executionDigestStore: store });
  });

  test('GET /api/execution-digests returns all digests', async () => {
    store.create(makeDigest());
    store.create(makeDigest({ threadId: 'thread-002' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests',
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.digests.length, 2);
  });

  test('GET /api/execution-digests?projectPath= filters by project', async () => {
    store.create(makeDigest());
    store.create(makeDigest({ projectPath: '/other' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests?projectPath=%2Fprojects%2Fawesome-app',
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().digests.length, 1);
  });

  test('GET /api/execution-digests?threadId= filters by thread', async () => {
    store.create(makeDigest({ threadId: 'thread-001' }));
    store.create(makeDigest({ threadId: 'thread-002' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests?threadId=thread-001',
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().digests.length, 1);
  });

  test('GET /api/execution-digests/:id returns single digest', async () => {
    const digest = store.create(makeDigest());
    const res = await app.inject({
      method: 'GET',
      url: `/api/execution-digests/${digest.id}`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().digest.id, digest.id);
  });

  test('GET /api/execution-digests/:id returns 404 for missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests/nonexistent',
      headers: H,
    });
    assert.equal(res.statusCode, 404);
  });

  test('GET without identity returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests',
    });
    assert.equal(res.statusCode, 401);
  });

  // P1 fix: cross-user isolation
  test('GET /api/execution-digests does NOT return other users digests', async () => {
    store.create(makeDigest({ userId: 'user1' }));
    store.create(makeDigest({ userId: 'user2' }));
    const res = await app.inject({
      method: 'GET',
      url: '/api/execution-digests',
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.digests.length, 1);
    for (const d of body.digests) {
      assert.equal(d.userId, 'user1');
    }
  });

  test('GET /api/execution-digests/:id returns 404 for other users digest', async () => {
    const digest = store.create(makeDigest({ userId: 'user2' }));
    const res = await app.inject({
      method: 'GET',
      url: `/api/execution-digests/${digest.id}`,
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(res.statusCode, 404);
  });
});
