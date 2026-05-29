/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * WorkflowSop API routes tests (F073 P1)
 * In-memory stores, no Redis needed.
 */

import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

const USER_HEADERS = { 'x-office-claw-user': 'test-user' };

// Minimal in-memory backlog store stub (only needs get)
function createStubBacklogStore() {
  const items = new Map();
  return {
    items,
    get(itemId, userId) {
      const item = items.get(itemId) ?? null;
      if (item && userId && item.userId !== userId) return null;
      return item;
    },
    create() {
      throw new Error('not implemented');
    },
    refreshMetadata() {
      throw new Error('not implemented');
    },
    listByUser() {
      return [];
    },
    suggestClaim() {
      throw new Error('not implemented');
    },
    decideClaim() {
      throw new Error('not implemented');
    },
    updateDispatchProgress() {
      throw new Error('not implemented');
    },
    markDispatched() {
      throw new Error('not implemented');
    },
    markDone() {
      throw new Error('not implemented');
    },
    acquireLease() {
      throw new Error('not implemented');
    },
    heartbeatLease() {
      throw new Error('not implemented');
    },
    releaseLease() {
      throw new Error('not implemented');
    },
    reclaimExpiredLease() {
      throw new Error('not implemented');
    },
  };
}

// Minimal in-memory workflow SOP store
function createInMemoryWorkflowSopStore() {
  const store = new Map();

  const DEFAULT_CHECKS = {
    remoteMainSynced: 'unknown',
    qualityGatePassed: 'unknown',
    reviewApproved: 'unknown',
    visionGuardDone: 'unknown',
  };

  return {
    store,
    async get(backlogItemId) {
      return store.get(backlogItemId) ?? null;
    },
    async upsert(backlogItemId, featureId, input, updatedBy) {
      const existing = store.get(backlogItemId);

      if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
        // Import real error class so instanceof works in route handler
        const { VersionConflictError } = await import('../dist/domains/agents/services/stores/ports/WorkflowSopStore.js');
        throw new VersionConflictError(existing);
      }

      const now = Date.now();
      const sop = existing
        ? {
            ...existing,
            stage: input.stage ?? existing.stage,
            batonHolder: input.batonHolder ?? existing.batonHolder,
            nextSkill: input.nextSkill !== undefined ? input.nextSkill : existing.nextSkill,
            resumeCapsule: input.resumeCapsule
              ? { ...existing.resumeCapsule, ...input.resumeCapsule }
              : existing.resumeCapsule,
            checks: input.checks ? { ...existing.checks, ...input.checks } : existing.checks,
            version: existing.version + 1,
            updatedAt: now,
            updatedBy,
          }
        : {
            featureId,
            backlogItemId,
            stage: input.stage ?? 'kickoff',
            batonHolder: input.batonHolder ?? updatedBy,
            nextSkill: input.nextSkill !== undefined ? input.nextSkill : null,
            resumeCapsule: input.resumeCapsule
              ? { goal: '', done: [], currentFocus: '', ...input.resumeCapsule }
              : { goal: '', done: [], currentFocus: '' },
            checks: input.checks ? { ...DEFAULT_CHECKS, ...input.checks } : { ...DEFAULT_CHECKS },
            version: 1,
            updatedAt: now,
            updatedBy,
          };
      store.set(backlogItemId, sop);
      return sop;
    },
    async delete(backlogItemId) {
      return store.delete(backlogItemId);
    },
  };
}

describe('WorkflowSop API routes', () => {
  let app;
  let backlogStore;
  let workflowSopStore;

  before(async () => {
    const routeModule = await import('../dist/routes/workflow-sop.js');

    backlogStore = createStubBacklogStore();
    workflowSopStore = createInMemoryWorkflowSopStore();

    // Seed a backlog item for testing
    backlogStore.items.set('item-1', {
      id: 'item-1',
      userId: 'test-user',
      title: 'F073 Test',
      summary: 'Test item',
      priority: 'p1',
      tags: ['f073'],
      status: 'open',
      createdBy: 'user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      audit: [],
    });

    app = Fastify();
    await app.register(routeModule.workflowSopRoutes, {
      workflowSopStore,
      backlogStore,
    });
    await app.ready();
  });

  beforeEach(() => {
    workflowSopStore.store.clear();
  });

  it('GET returns 404 when no SOP exists', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/backlog/item-1/workflow-sop',
      headers: USER_HEADERS,
    });
    assert.equal(res.statusCode, 404);
  });

  it('GET returns 401 without identity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/backlog/item-1/workflow-sop',
    });
    assert.equal(res.statusCode, 401);
  });

  it('PUT creates new SOP and GET retrieves it', async () => {
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: {
        featureId: 'F073',
        updatedBy: 'opus',
        stage: 'impl',
        batonHolder: 'opus',
      },
    });
    assert.equal(putRes.statusCode, 200);
    const sop = JSON.parse(putRes.payload);
    assert.equal(sop.featureId, 'F073');
    assert.equal(sop.stage, 'impl');
    assert.equal(sop.batonHolder, 'opus');
    assert.equal(sop.version, 1);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/backlog/item-1/workflow-sop',
      headers: USER_HEADERS,
    });
    assert.equal(getRes.statusCode, 200);
    const fetched = JSON.parse(getRes.payload);
    assert.equal(fetched.stage, 'impl');
  });

  it('PUT updates existing SOP', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', stage: 'impl' },
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', stage: 'review', batonHolder: 'codex' },
    });
    assert.equal(res.statusCode, 200);
    const sop = JSON.parse(res.payload);
    assert.equal(sop.stage, 'review');
    assert.equal(sop.batonHolder, 'codex');
    assert.equal(sop.version, 2);
  });

  it('GET returns 404 when backlog item belongs to different user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { 'x-office-claw-user': 'other-user' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.payload).error, 'Backlog item not found');
  });

  it('PUT returns 404 when backlog item belongs to different user', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { 'x-office-claw-user': 'other-user', 'content-type': 'application/json' },
      payload: { featureId: 'F073', stage: 'impl' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.payload).error, 'Backlog item not found');
  });

  it('PUT returns 404 when backlog item does not exist', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/backlog/nonexistent/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', updatedBy: 'opus' },
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error, 'Backlog item not found');
  });

  it('PUT returns 400 on invalid body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { stage: 'invalid_stage' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('PUT returns 409 on version conflict', async () => {
    // Create v1
    await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', updatedBy: 'opus' },
    });

    // Update to v2
    await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', stage: 'impl' },
    });

    // Try with stale version
    const res = await app.inject({
      method: 'PUT',
      url: '/api/backlog/item-1/workflow-sop',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { featureId: 'F073', stage: 'review', expectedVersion: 1 },
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.ok(body.error.includes('conflict') || body.error.includes('Version'));
  });
});
