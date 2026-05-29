/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * WorkflowSop callback route tests (F073 P1)
 * Tests the MCP callback endpoint /api/callbacks/update-workflow-sop
 */

import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

const INVOCATION_ID = 'inv-test-001';
const CALLBACK_TOKEN = 'token-test-001';

// Minimal InvocationRegistry stub
function createStubRegistry() {
  return {
    verify(invId, token) {
      if (invId === INVOCATION_ID && token === CALLBACK_TOKEN) {
        return { agentId: 'opus', threadId: 'thread-1', userId: 'test-user' };
      }
      return null;
    },
  };
}

// Minimal backlog store stub
function createStubBacklogStore() {
  const items = new Map();
  items.set('item-1', {
    id: 'item-1',
    userId: 'test-user',
    title: 'F073 Test',
    summary: 'Test',
    priority: 'p1',
    tags: ['f073'],
    status: 'open',
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    audit: [],
  });
  return {
    get(itemId, userId) {
      const item = items.get(itemId) ?? null;
      if (item && userId && item.userId !== userId) return null;
      return item;
    },
  };
}

// Minimal in-memory workflow SOP store
function createInMemoryWorkflowSopStore() {
  const store = new Map();
  return {
    store,
    async get(backlogItemId) {
      return store.get(backlogItemId) ?? null;
    },
    async upsert(backlogItemId, featureId, input, updatedBy) {
      const existing = store.get(backlogItemId);
      const now = Date.now();
      const sop = existing
        ? {
            ...existing,
            stage: input.stage ?? existing.stage,
            batonHolder: input.batonHolder ?? existing.batonHolder,
            version: existing.version + 1,
            updatedAt: now,
            updatedBy,
          }
        : {
            featureId,
            backlogItemId,
            stage: input.stage ?? 'kickoff',
            batonHolder: input.batonHolder ?? updatedBy,
            nextSkill: null,
            resumeCapsule: { goal: '', done: [], currentFocus: '' },
            checks: {
              remoteMainSynced: 'unknown',
              qualityGatePassed: 'unknown',
              reviewApproved: 'unknown',
              visionGuardDone: 'unknown',
            },
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

describe('WorkflowSop callback route', () => {
  let app;
  let workflowSopStore;

  before(async () => {
    const module = await import('../dist/routes/callback-workflow-sop-routes.js');

    workflowSopStore = createInMemoryWorkflowSopStore();

    app = Fastify();
    module.registerCallbackWorkflowSopRoutes(app, {
      registry: createStubRegistry(),
      workflowSopStore,
      backlogStore: createStubBacklogStore(),
    });
    await app.ready();
  });

  beforeEach(() => {
    workflowSopStore.store.clear();
  });

  it('creates workflow SOP via callback with auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/update-workflow-sop',
      headers: { 'content-type': 'application/json' },
      payload: {
        invocationId: INVOCATION_ID,
        callbackToken: CALLBACK_TOKEN,
        backlogItemId: 'item-1',
        featureId: 'F073',
        stage: 'impl',
        batonHolder: 'opus',
      },
    });
    assert.equal(res.statusCode, 200);
    const sop = JSON.parse(res.payload);
    assert.equal(sop.featureId, 'F073');
    assert.equal(sop.stage, 'impl');
    assert.equal(sop.updatedBy, 'opus'); // extracted from invocation context
    assert.equal(sop.version, 1);
  });

  it('rejects invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/update-workflow-sop',
      headers: { 'content-type': 'application/json' },
      payload: {
        invocationId: 'bad-id',
        callbackToken: 'bad-token',
        backlogItemId: 'item-1',
        featureId: 'F073',
      },
    });
    assert.equal(res.statusCode, 401);
  });

  it('returns 404 for non-existent backlog item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/update-workflow-sop',
      headers: { 'content-type': 'application/json' },
      payload: {
        invocationId: INVOCATION_ID,
        callbackToken: CALLBACK_TOKEN,
        backlogItemId: 'nonexistent',
        featureId: 'F073',
      },
    });
    assert.equal(res.statusCode, 404);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/update-workflow-sop',
      headers: { 'content-type': 'application/json' },
      payload: {
        invocationId: INVOCATION_ID,
        callbackToken: CALLBACK_TOKEN,
        // missing backlogItemId and featureId
      },
    });
    assert.equal(res.statusCode, 400);
  });
});
