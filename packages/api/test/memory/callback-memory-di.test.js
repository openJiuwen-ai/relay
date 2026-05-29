/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F102 Phase B: Route DI — callback-memory-routes accepts IEvidenceStore/IMarkerQueue/IReflectionService
 * Tests the new SQLite-backed path for callback memory routes.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

describe('callback-memory-routes DI (IEvidenceStore path)', () => {
  let app;
  let registerFn;

  beforeEach(async () => {
    const mod = await import('../../dist/routes/callback-memory-routes.js');
    registerFn = mod.registerCallbackMemoryRoutes;
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  function createMockRegistry() {
    return {
      verify: () => ({
        invocationId: 'inv-1',
        agentId: 'opus',
        userId: 'user-1',
        threadId: 'thread-1',
        callbackToken: 'tok-1',
      }),
    };
  }

  it('retain-memory submits to IMarkerQueue when provided', async () => {
    const submitted = [];
    const mockMarkerQueue = {
      submit: async (marker) => {
        submitted.push(marker);
        return { ...marker, id: 'mk-1', createdAt: new Date().toISOString() };
      },
      list: async () => [],
      transition: async () => {},
    };

    app = Fastify();
    await registerFn(app, {
      registry: createMockRegistry(),
      markerQueue: mockMarkerQueue,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/retain-memory',
      payload: {
        invocationId: 'inv-1',
        callbackToken: 'tok-1',
        content: 'Lesson: always check Redis port',
        tags: 'kind:lesson',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].content, 'Lesson: always check Redis port');
  });

  it('search-evidence delegates to IEvidenceStore and returns mapped EvidenceResult shape', async () => {
    let searchQuery;
    const mockStore = {
      search: async (q, _opts) => {
        searchQuery = q;
        return [
          {
            anchor: 'F042',
            kind: 'feature',
            status: 'active',
            title: 'F042: Prompt Audit',
            summary: 'Prompt engineering audit spec',
            updatedAt: new Date().toISOString(),
          },
        ];
      },
      health: async () => true,
      initialize: async () => {},
      upsert: async () => {},
      deleteByAnchor: async () => {},
      getByAnchor: async () => null,
    };

    app = Fastify();
    await registerFn(app, {
      registry: createMockRegistry(),
      evidenceStore: mockStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/search-evidence?invocationId=inv-1&callbackToken=tok-1&q=prompt+audit',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.results.length > 0);
    assert.equal(searchQuery, 'prompt audit');
    // P1-2: DI results must match legacy schema shape (mapped EvidenceResult, not raw EvidenceItem)
    const r = body.results[0];
    assert.ok('title' in r, 'result must have title');
    assert.ok('anchor' in r, 'result must have anchor');
    assert.ok('snippet' in r, 'result must have snippet (mapped from summary)');
    assert.ok('confidence' in r, 'result must have confidence');
    assert.ok('sourceType' in r, 'result must have sourceType');
  });

  it('reflect delegates to IReflectionService and includes dispositionMode', async () => {
    let reflectQuery;
    const mockReflection = {
      reflect: async (q) => {
        reflectQuery = q;
        return 'Reflected insight about architecture';
      },
    };

    app = Fastify();
    await registerFn(app, {
      registry: createMockRegistry(),
      reflectionService: mockReflection,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/reflect',
      payload: {
        invocationId: 'inv-1',
        callbackToken: 'tok-1',
        query: 'What patterns do we use?',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.reflection, 'Reflected insight about architecture');
    assert.equal(body.degraded, false);
    assert.equal(reflectQuery, 'What patterns do we use?');
    // P1-2: DI path must include dispositionMode for schema consistency
    assert.ok('dispositionMode' in body, 'DI reflect must include dispositionMode');
  });

  it('retain-memory DI path preserves tracing metadata from invocation record', async () => {
    const submitted = [];
    const mockMarkerQueue = {
      submit: async (marker) => {
        submitted.push(marker);
        return { ...marker, id: 'mk-2', createdAt: new Date().toISOString() };
      },
      list: async () => [],
      transition: async () => {},
    };

    app = Fastify();
    await registerFn(app, {
      registry: createMockRegistry(),
      markerQueue: mockMarkerQueue,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/retain-memory',
      payload: {
        invocationId: 'inv-1',
        callbackToken: 'tok-1',
        content: 'Important architectural decision',
        metadata: { custom: 'value' },
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(submitted.length, 1);
    // P2: DI path must include tracing info (at minimum source with invocation context)
    const marker = submitted[0];
    assert.ok(marker.source.includes('callback'), 'source must indicate callback origin');
    assert.ok(
      marker.source.includes('inv-1') || marker.source.includes('opus'),
      'source must contain invocation or cat tracing info',
    );
  });
});
