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
    name: 'Login Flow Learning Slice',
    sliceType: /** @type {const} */ ('learning'),
    description: 'Verify login assumptions with minimal implementation',
    cardIds: ['ic-001', 'ic-002'],
    actor: 'Store Manager',
    workflow: 'Manager opens app → enters creds → sees dashboard',
    verifiableOutcome: 'Client can login and see a dashboard stub',
    ...overrides,
  };
}

describe('SliceStore', () => {
  /** @type {import('../dist/domains/projects/slice-store.js').SliceStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/slice-store.js');
    store = new mod.SliceStore();
  });

  test('create() returns slice with generated id + auto-increment order', () => {
    const s1 = store.create('ep-1', makeInput());
    assert.ok(s1.id.startsWith('sl-'));
    assert.equal(s1.projectId, 'ep-1');
    assert.equal(s1.order, 0);
    assert.equal(s1.status, 'planned');
    assert.equal(s1.sliceType, 'learning');

    const s2 = store.create('ep-1', makeInput({ name: 'Value Slice' }));
    assert.equal(s2.order, 1);
  });

  test('listByProject() returns slices sorted by order', () => {
    store.create('ep-1', makeInput({ name: 'A' }));
    store.create('ep-2', makeInput({ name: 'Other' }));
    store.create('ep-1', makeInput({ name: 'B' }));
    const results = store.listByProject('ep-1');
    assert.equal(results.length, 2);
    assert.ok(results[0].order <= results[1].order);
  });

  test('getById() returns slice or undefined', () => {
    const s = store.create('ep-1', makeInput());
    assert.deepEqual(store.getById(s.id), s);
    assert.equal(store.getById('nonexistent'), undefined);
  });

  test('update() patches fields', () => {
    const s = store.create('ep-1', makeInput());
    const updated = store.update(s.id, { name: 'Updated Name', status: 'in_progress' });
    assert.ok(updated);
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.status, 'in_progress');
    assert.ok(updated.updatedAt >= s.updatedAt);
  });

  test('reorder() swaps two slices order values', () => {
    const s1 = store.create('ep-1', makeInput({ name: 'First' }));
    const s2 = store.create('ep-1', makeInput({ name: 'Second' }));
    assert.equal(s1.order, 0);
    assert.equal(s2.order, 1);
    const result = store.reorder(s1.id, s2.id);
    assert.ok(result);
    assert.equal(store.getById(s1.id).order, 1);
    assert.equal(store.getById(s2.id).order, 0);
  });

  test('delete() removes slice', () => {
    const s = store.create('ep-1', makeInput());
    assert.equal(store.delete(s.id), true);
    assert.equal(store.getById(s.id), undefined);
    assert.equal(store.delete('nonexistent'), false);
  });

  test('listByType() filters by sliceType', () => {
    store.create('ep-1', makeInput({ sliceType: /** @type {const} */ ('learning') }));
    store.create('ep-1', makeInput({ sliceType: /** @type {const} */ ('value') }));
    store.create('ep-1', makeInput({ sliceType: /** @type {const} */ ('learning') }));
    const results = store.listByType('ep-1', 'learning');
    assert.equal(results.length, 2);
    for (const s of results) assert.equal(s.sliceType, 'learning');
  });

  test('order auto-increments per project independently', () => {
    const a1 = store.create('ep-1', makeInput());
    const b1 = store.create('ep-2', makeInput());
    const a2 = store.create('ep-1', makeInput({ name: 'Second' }));
    assert.equal(a1.order, 0);
    assert.equal(b1.order, 0);
    assert.equal(a2.order, 1);
  });
});
