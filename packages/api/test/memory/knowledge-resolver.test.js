/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F102 Phase B: KnowledgeResolver — RRF fusion of project + global stores
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

describe('KnowledgeResolver', () => {
  let KnowledgeResolver;
  let SqliteEvidenceStore;

  beforeEach(async () => {
    const mod = await import('../../dist/domains/memory/KnowledgeResolver.js');
    KnowledgeResolver = mod.KnowledgeResolver;
    const storeMod = await import('../../dist/domains/memory/SqliteEvidenceStore.js');
    SqliteEvidenceStore = storeMod.SqliteEvidenceStore;
  });

  function createMockStore(items = []) {
    return {
      search: async () => items,
      upsert: async () => {},
      deleteByAnchor: async () => {},
      getByAnchor: async () => null,
      health: async () => true,
      initialize: async () => {},
    };
  }

  it('returns project-only results with single store (Phase A compat)', async () => {
    const store = new SqliteEvidenceStore(':memory:');
    await store.initialize();
    await store.upsert([
      {
        anchor: 'F042',
        kind: 'feature',
        status: 'active',
        title: 'Prompt Engineering Audit',
        summary: 'Three-layer information architecture',
        updatedAt: '2026-03-11T00:00:00Z',
      },
    ]);

    const resolver = new KnowledgeResolver({ projectStore: store });
    const result = await resolver.resolve('prompt engineering');

    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].anchor, 'F042');
    assert.deepEqual(result.sources, ['project']);
    assert.equal(result.query, 'prompt engineering');

    store.close();
  });

  it('merges project + global results via RRF', async () => {
    const projectItems = [
      { anchor: 'F042', kind: 'feature', status: 'active', title: 'F042: Prompt Audit', updatedAt: '2026-03-12' },
    ];
    const globalItems = [
      { anchor: 'F099', kind: 'feature', status: 'active', title: 'F099: Global Feature', updatedAt: '2026-03-12' },
    ];

    const resolver = new KnowledgeResolver({
      projectStore: createMockStore(projectItems),
      globalStore: createMockStore(globalItems),
    });

    const result = await resolver.resolve('feature');

    assert.equal(result.results.length, 2);
    assert.deepEqual(result.sources, ['project', 'global']);
    const anchors = result.results.map((r) => r.anchor);
    assert.ok(anchors.includes('F042'));
    assert.ok(anchors.includes('F099'));
  });

  it('deduplicates by anchor (project wins)', async () => {
    const projectItems = [
      { anchor: 'F042', kind: 'feature', status: 'active', title: 'Project F042', updatedAt: '2026-03-12' },
    ];
    const globalItems = [
      { anchor: 'F042', kind: 'feature', status: 'active', title: 'Global F042', updatedAt: '2026-03-11' },
    ];

    const resolver = new KnowledgeResolver({
      projectStore: createMockStore(projectItems),
      globalStore: createMockStore(globalItems),
    });

    const result = await resolver.resolve('F042');

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].title, 'Project F042');
  });

  it('respects limit option', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      anchor: `F${String(i).padStart(3, '0')}`,
      kind: 'feature',
      status: 'active',
      title: `Feature ${i}`,
      updatedAt: '2026-03-12',
    }));

    const resolver = new KnowledgeResolver({ projectStore: createMockStore(items) });
    const result = await resolver.resolve('feature', { limit: 3 });

    assert.equal(result.results.length, 3);
  });

  it('degrades gracefully when global store throws', async () => {
    const projectItems = [
      { anchor: 'F042', kind: 'feature', status: 'active', title: 'F042', updatedAt: '2026-03-12' },
    ];
    const failingStore = {
      search: async () => {
        throw new Error('connection refused');
      },
      upsert: async () => {},
      deleteByAnchor: async () => {},
      getByAnchor: async () => null,
      health: async () => false,
      initialize: async () => {},
    };

    const resolver = new KnowledgeResolver({
      projectStore: createMockStore(projectItems),
      globalStore: failingStore,
    });

    const result = await resolver.resolve('test');

    assert.ok(result.results.length >= 1);
    assert.deepEqual(result.sources, ['project']);
  });

  it('returns empty for no matches', async () => {
    const resolver = new KnowledgeResolver({ projectStore: createMockStore([]) });
    const result = await resolver.resolve('nonexistent topic xyz');

    assert.equal(result.results.length, 0);
    assert.deepEqual(result.sources, ['project']);
  });
});
