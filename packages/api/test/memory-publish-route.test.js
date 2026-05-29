/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Memory Publish Route tests
 * Phase 5.0 Step 2a: POST /api/memory/publish
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { MemoryGovernanceStore } from '../dist/domains/agents/services/stores/ports/MemoryGovernanceStore.js';
import { memoryPublishRoutes } from '../dist/routes/memory-publish.js';

/** @returns {import('fastify').FastifyInstance} */
function buildApp() {
  const app = Fastify();
  const governanceStore = new MemoryGovernanceStore();
  app.register(memoryPublishRoutes, { governanceStore });
  return { app, governanceStore };
}

describe('POST /api/memory/publish', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  /** @type {MemoryGovernanceStore} */
  let governanceStore;

  beforeEach(async () => {
    const built = buildApp();
    app = built.app;
    governanceStore = built.governanceStore;
    await app.ready();
  });

  it('submit_review: auto-creates draft then transitions to pending_review', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'submit_review', actor: 'opus' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.entryId, 'e1');
    assert.equal(body.previousStatus, 'draft');
    assert.equal(body.currentStatus, 'pending_review');
  });

  it('approve: pending_review → published', async () => {
    // Setup: create and submit
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'submit_review', actor: 'opus' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'approve', actor: 'user' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.previousStatus, 'pending_review');
    assert.equal(body.currentStatus, 'published');
  });

  it('archive: published → archived', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'submit_review', actor: 'opus' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'approve', actor: 'user' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'archive', actor: 'user' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.previousStatus, 'published');
    assert.equal(body.currentStatus, 'archived');
  });

  it('rollback: published → draft', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'submit_review', actor: 'opus' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'approve', actor: 'user' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'rollback', actor: 'user' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.previousStatus, 'published');
    assert.equal(body.currentStatus, 'draft');
  });

  it('invalid transition returns 409', async () => {
    // Create draft, then try to approve directly (invalid: draft → approve)
    await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'submit_review', actor: 'opus' },
    });

    // Now try archive on pending_review (invalid)
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'archive', actor: 'user' },
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.ok(body.error.includes('cannot'));
  });

  it('missing fields returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1' },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.error);
  });

  it('invalid action value returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'e1', action: 'nope', actor: 'user' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('approve on missing entry returns 404 and does not create draft side-effect', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory/publish',
      payload: { entryId: 'ghost-entry', action: 'approve', actor: 'user' },
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.ok(body.error.includes('not found'));
    assert.equal(governanceStore.get('ghost-entry'), null);
  });
});
