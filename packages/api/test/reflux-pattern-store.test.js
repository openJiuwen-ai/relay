/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

function makeInput(overrides = {}) {
  return {
    category: /** @type {const} */ ('methodology'),
    title: 'A-tag hard gate prevents premature commitment',
    insight: 'AI-inferred requirements should never enter Build Now directly',
    evidence: 'Studio-flow had 3 AI-generated features that needed rework after client review',
    ...overrides,
  };
}

describe('RefluxPatternStore', () => {
  /** @type {import('../dist/domains/projects/reflux-pattern-store.js').RefluxPatternStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/reflux-pattern-store.js');
    store = new mod.RefluxPatternStore();
  });

  test('create() returns pattern with generated id', () => {
    const p = store.create('ep-1', makeInput());
    assert.ok(p.id.startsWith('rfx-'));
    assert.equal(p.projectId, 'ep-1');
    assert.equal(p.category, 'methodology');
    assert.equal(p.title, 'A-tag hard gate prevents premature commitment');
    assert.ok(p.createdAt > 0);
  });

  test('listByProject() filters by projectId, newest first', () => {
    store.create('ep-1', makeInput({ title: 'First' }));
    store.create('ep-2', makeInput({ title: 'Other' }));
    store.create('ep-1', makeInput({ title: 'Second' }));
    const results = store.listByProject('ep-1');
    assert.equal(results.length, 2);
    assert.ok(results[0].createdAt >= results[1].createdAt);
  });

  test('listByCategory() filters by category', () => {
    store.create('ep-1', makeInput({ category: /** @type {const} */ ('methodology') }));
    store.create('ep-1', makeInput({ category: /** @type {const} */ ('risk_pattern') }));
    store.create('ep-1', makeInput({ category: /** @type {const} */ ('methodology') }));
    const results = store.listByCategory('ep-1', 'methodology');
    assert.equal(results.length, 2);
    for (const p of results) assert.equal(p.category, 'methodology');
  });

  test('getById() returns pattern or undefined', () => {
    const p = store.create('ep-1', makeInput());
    assert.deepEqual(store.getById(p.id), p);
    assert.equal(store.getById('nonexistent'), undefined);
  });

  test('delete() removes pattern', () => {
    const p = store.create('ep-1', makeInput());
    assert.equal(store.delete(p.id), true);
    assert.equal(store.getById(p.id), undefined);
    assert.equal(store.delete('nonexistent'), false);
  });
});
