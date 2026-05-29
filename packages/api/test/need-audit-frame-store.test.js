/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

describe('NeedAuditFrameStore', () => {
  /** @type {import('../dist/domains/projects/need-audit-frame-store.js').NeedAuditFrameStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/need-audit-frame-store.js');
    store = new mod.NeedAuditFrameStore();
  });

  test('upsert() creates frame with generated id', () => {
    const frame = store.upsert('ep-001', {
      sponsor: 'Client CEO',
      motivation: 'Digitize review process',
      successMetric: 'Review time < 2 hours',
      constraints: '3 month deadline',
      currentWorkflow: 'Manual Excel tracking',
      provenanceMap: 'CEO interview + existing Excel',
    });
    assert.ok(frame.id.startsWith('frame-'));
    assert.equal(frame.projectId, 'ep-001');
    assert.equal(frame.sponsor, 'Client CEO');
    assert.ok(frame.createdAt > 0);
  });

  test('upsert() updates existing frame for same project', () => {
    const first = store.upsert('ep-001', {
      sponsor: 'CEO',
      motivation: 'v1',
      successMetric: 'metric',
      constraints: '',
      currentWorkflow: '',
      provenanceMap: '',
    });
    const second = store.upsert('ep-001', {
      sponsor: 'CTO',
      motivation: 'v2',
      successMetric: 'updated metric',
      constraints: 'new',
      currentWorkflow: 'updated',
      provenanceMap: 'updated',
    });
    assert.equal(second.id, first.id);
    assert.equal(second.sponsor, 'CTO');
    assert.equal(second.motivation, 'v2');
    assert.ok(second.updatedAt >= first.updatedAt);
  });

  test('getByProject() returns frame or null', () => {
    store.upsert('ep-001', {
      sponsor: 'X',
      motivation: '',
      successMetric: 'Y',
      constraints: '',
      currentWorkflow: '',
      provenanceMap: '',
    });
    assert.ok(store.getByProject('ep-001'));
    assert.equal(store.getByProject('ep-999'), null);
  });

  test('upsert() throws if sponsor is empty', () => {
    assert.throws(
      () =>
        store.upsert('ep-001', {
          sponsor: '',
          motivation: '',
          successMetric: 'Y',
          constraints: '',
          currentWorkflow: '',
          provenanceMap: '',
        }),
      /sponsor is required/,
    );
  });

  test('upsert() throws if successMetric is empty', () => {
    assert.throws(
      () =>
        store.upsert('ep-001', {
          sponsor: 'X',
          motivation: '',
          successMetric: '',
          constraints: '',
          currentWorkflow: '',
          provenanceMap: '',
        }),
      /successMetric is required/,
    );
  });
});
