/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

/** @returns {import('../dist/domains/projects/resolution-store.js').default extends { create: (projectId: string, input: any) => any } ? Parameters<import('../dist/domains/projects/resolution-store.js').ResolutionStore['create']>[1] : never} */
function makeInput(overrides = {}) {
  return {
    cardId: 'ic-001',
    path: /** @type {const} */ ('confirmation'),
    question: 'Is the login page the same as the registration page?',
    options: ['Yes, same page', 'No, separate pages'],
    recommendation: 'Separate pages for clarity',
    ...overrides,
  };
}

describe('ResolutionStore', () => {
  /** @type {import('../dist/domains/projects/resolution-store.js').ResolutionStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/resolution-store.js');
    store = new mod.ResolutionStore();
  });

  test('create() returns resolution with generated id and status=open', () => {
    const item = store.create('ep-1', makeInput());
    assert.ok(item.id.startsWith('res-'));
    assert.equal(item.projectId, 'ep-1');
    assert.equal(item.cardId, 'ic-001');
    assert.equal(item.path, 'confirmation');
    assert.equal(item.status, 'open');
    assert.equal(item.answer, '');
    assert.equal(item.answeredAt, null);
  });

  test('listByProject() filters by projectId', () => {
    store.create('ep-1', makeInput());
    store.create('ep-2', makeInput());
    store.create('ep-1', makeInput({ cardId: 'ic-002' }));
    const results = store.listByProject('ep-1');
    assert.equal(results.length, 2);
    for (const r of results) assert.equal(r.projectId, 'ep-1');
  });

  test('listByCard() filters by cardId', () => {
    store.create('ep-1', makeInput({ cardId: 'ic-001' }));
    store.create('ep-1', makeInput({ cardId: 'ic-002' }));
    store.create('ep-1', makeInput({ cardId: 'ic-001' }));
    const results = store.listByCard('ic-001');
    assert.equal(results.length, 2);
  });

  test('getById() returns item or undefined', () => {
    const item = store.create('ep-1', makeInput());
    assert.deepEqual(store.getById(item.id), item);
    assert.equal(store.getById('nonexistent'), undefined);
  });

  test('answer() sets answer + status=answered + answeredAt', () => {
    const item = store.create('ep-1', makeInput());
    const answered = store.answer(item.id, { answer: 'Separate pages confirmed' });
    assert.ok(answered);
    assert.equal(answered.status, 'answered');
    assert.equal(answered.answer, 'Separate pages confirmed');
    assert.ok(answered.answeredAt);
    assert.ok(answered.answeredAt > 0);
  });

  test('escalate() sets status=escalated', () => {
    const item = store.create('ep-1', makeInput());
    const escalated = store.escalate(item.id);
    assert.ok(escalated);
    assert.equal(escalated.status, 'escalated');
  });

  test('listOpen() returns only open items for a project', () => {
    const r1 = store.create('ep-1', makeInput());
    const r2 = store.create('ep-1', makeInput({ cardId: 'ic-002' }));
    store.answer(r1.id, { answer: 'done' });
    const open = store.listOpen('ep-1');
    assert.equal(open.length, 1);
    assert.equal(open[0].id, r2.id);
  });

  test('delete() removes item', () => {
    const item = store.create('ep-1', makeInput());
    assert.equal(store.delete(item.id), true);
    assert.equal(store.getById(item.id), undefined);
    assert.equal(store.delete('nonexistent'), false);
  });
});
