/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * MemoryGovernanceStore tests
 * Phase 5.0 Step 2a: 治理状态机
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  GovernanceConflictError,
  MemoryGovernanceStore,
  resolveTransition,
} from '../dist/domains/agents/services/stores/ports/MemoryGovernanceStore.js';

describe('resolveTransition (pure function)', () => {
  it('draft → submit_review = pending_review', () => {
    assert.equal(resolveTransition('draft', 'submit_review'), 'pending_review');
  });

  it('pending_review → approve = published', () => {
    assert.equal(resolveTransition('pending_review', 'approve'), 'published');
  });

  it('published → archive = archived', () => {
    assert.equal(resolveTransition('published', 'archive'), 'archived');
  });

  it('published → rollback = draft', () => {
    assert.equal(resolveTransition('published', 'rollback'), 'draft');
  });

  it('draft → approve throws GovernanceConflictError', () => {
    assert.throws(() => resolveTransition('draft', 'approve'), GovernanceConflictError);
  });

  it('archived → approve throws GovernanceConflictError', () => {
    assert.throws(() => resolveTransition('archived', 'approve'), GovernanceConflictError);
  });

  it('pending_review → rollback throws GovernanceConflictError', () => {
    assert.throws(() => resolveTransition('pending_review', 'rollback'), GovernanceConflictError);
  });
});

describe('MemoryGovernanceStore', () => {
  /** @type {import('../src/domains/agents/services/stores/ports/MemoryGovernanceStore.js').MemoryGovernanceStore} */
  let store;

  beforeEach(() => {
    store = new MemoryGovernanceStore();
  });

  it('create() returns draft entry', () => {
    const entry = store.create('e1', 'opus');
    assert.equal(entry.entryId, 'e1');
    assert.equal(entry.status, 'draft');
    assert.equal(entry.updatedBy, 'opus');
    assert.ok(entry.updatedAt > 0);
  });

  it('create() with anchors', () => {
    const entry = store.create('e2', 'user', ['docs/decisions/005.md']);
    assert.deepEqual(entry.anchors, ['docs/decisions/005.md']);
  });

  it('create() duplicate throws', () => {
    store.create('e1', 'opus');
    assert.throws(() => store.create('e1', 'codex'), GovernanceConflictError);
  });

  it('full lifecycle: draft → pending_review → published → archived', () => {
    store.create('e1', 'opus');

    const r1 = store.transition('e1', 'submit_review', 'opus');
    assert.equal(r1.status, 'pending_review');

    const r2 = store.transition('e1', 'approve', 'user');
    assert.equal(r2.status, 'published');

    const r3 = store.transition('e1', 'archive', 'user');
    assert.equal(r3.status, 'archived');
  });

  it('rollback: published → draft', () => {
    store.create('e1', 'opus');
    store.transition('e1', 'submit_review', 'opus');
    store.transition('e1', 'approve', 'user');
    const r = store.transition('e1', 'rollback', 'user');
    assert.equal(r.status, 'draft');
  });

  it('transition on non-existent entry throws', () => {
    assert.throws(() => store.transition('nope', 'approve', 'user'), GovernanceConflictError);
  });

  it('invalid transition throws', () => {
    store.create('e1', 'opus');
    assert.throws(() => store.transition('e1', 'approve', 'user'), GovernanceConflictError);
  });

  it('get() returns entry or null', () => {
    assert.equal(store.get('nope'), null);
    store.create('e1', 'opus');
    const entry = store.get('e1');
    assert.equal(entry?.entryId, 'e1');
  });

  it('list() returns all entries', () => {
    store.create('e1', 'opus');
    store.create('e2', 'codex');
    const all = store.list();
    assert.equal(all.length, 2);
  });
});
