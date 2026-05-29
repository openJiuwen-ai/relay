/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F102 Phase B: Evidence + Reflect Route DI
 * When IEvidenceStore/IReflectionService is provided, bypasses Hindsight entirely.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';

const MOCK_HINDSIGHT = {
  recall: async () => [],
  retain: async () => {},
  reflect: async () => '',
  ensureBank: async () => {},
  isHealthy: async () => true,
};

describe('evidence route DI (IEvidenceStore path)', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  function createMockEvidenceStore(overrides = {}) {
    return {
      search: async () => [],
      upsert: async () => {},
      deleteByAnchor: async () => {},
      getByAnchor: async () => null,
      health: async () => true,
      initialize: async () => {},
      ...overrides,
    };
  }

  it('uses IEvidenceStore when provided, skipping Hindsight', async () => {
    let searchQuery;
    const mockStore = createMockEvidenceStore({
      search: async (q) => {
        searchQuery = q;
        return [
          {
            anchor: 'F042',
            kind: 'feature',
            status: 'active',
            title: 'F042: Prompt Audit',
            updatedAt: new Date().toISOString(),
          },
        ];
      },
    });

    let recallCalled = false;
    const mockHindsight = {
      ...MOCK_HINDSIGHT,
      recall: async () => {
        recallCalled = true;
        return [];
      },
    };

    const { evidenceRoutes } = await import('../../dist/routes/evidence.js');
    app = Fastify();
    await app.register(evidenceRoutes, {
      hindsightClient: mockHindsight,
      sharedBank: 'office-claw-shared',
      evidenceStore: mockStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/evidence/search?q=prompt+audit',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.degraded, false);
    assert.ok(body.results.length > 0);
    assert.equal(searchQuery, 'prompt audit');
    assert.equal(recallCalled, false, 'Hindsight recall should NOT be called when IEvidenceStore is provided');
    // P1-2: DI path results must have mapped fields (snippet, confidence, sourceType)
    const r = body.results[0];
    assert.ok('snippet' in r, 'DI evidence result must have snippet');
    assert.ok('confidence' in r, 'DI evidence result must have confidence');
    assert.ok('sourceType' in r, 'DI evidence result must have sourceType');
  });

  it('returns 400 for missing q even with IEvidenceStore', async () => {
    const mockStore = createMockEvidenceStore();
    const { evidenceRoutes } = await import('../../dist/routes/evidence.js');
    app = Fastify();
    await app.register(evidenceRoutes, {
      hindsightClient: MOCK_HINDSIGHT,
      sharedBank: 'office-claw-shared',
      evidenceStore: mockStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/evidence/search',
    });

    assert.equal(res.statusCode, 400);
  });

  it('degrades gracefully when IEvidenceStore.search throws', async () => {
    const mockStore = createMockEvidenceStore({
      search: async () => {
        throw new Error('SQLite locked');
      },
    });
    const { evidenceRoutes } = await import('../../dist/routes/evidence.js');
    app = Fastify();
    await app.register(evidenceRoutes, {
      hindsightClient: MOCK_HINDSIGHT,
      sharedBank: 'office-claw-shared',
      evidenceStore: mockStore,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/evidence/search?q=test',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.degraded, true);
    assert.equal(body.results.length, 0);
  });
});

describe('reflect route DI (IReflectionService path)', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('uses IReflectionService when provided, skipping Hindsight', async () => {
    let reflectQuery;
    const mockReflection = {
      reflect: async (q) => {
        reflectQuery = q;
        return 'Insight from local reflection';
      },
    };

    let hindsightReflectCalled = false;
    const mockHindsight = {
      ...MOCK_HINDSIGHT,
      reflect: async () => {
        hindsightReflectCalled = true;
        return 'from hindsight';
      },
    };

    const { reflectRoutes } = await import('../../dist/routes/reflect.js');
    app = Fastify();
    await app.register(reflectRoutes, {
      hindsightClient: mockHindsight,
      sharedBank: 'office-claw-shared',
      reflectionService: mockReflection,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/reflect',
      payload: { query: 'What patterns do we use?' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.degraded, false);
    assert.equal(body.reflection, 'Insight from local reflection');
    assert.equal(reflectQuery, 'What patterns do we use?');
    assert.equal(hindsightReflectCalled, false, 'Hindsight reflect should NOT be called');
  });

  it('degrades gracefully when IReflectionService throws', async () => {
    const mockReflection = {
      reflect: async () => {
        throw new Error('LLM timeout');
      },
    };

    const { reflectRoutes } = await import('../../dist/routes/reflect.js');
    app = Fastify();
    await app.register(reflectRoutes, {
      hindsightClient: MOCK_HINDSIGHT,
      sharedBank: 'office-claw-shared',
      reflectionService: mockReflection,
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/reflect',
      payload: { query: 'test query' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.degraded, true);
    assert.equal(body.reflection, '');
  });
});
