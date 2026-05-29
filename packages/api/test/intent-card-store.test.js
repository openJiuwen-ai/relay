/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

/** @returns {import('../dist/domains/projects/intent-card-store.js').CreateIntentCardInput} */
function makeCardInput(overrides = {}) {
  return {
    projectId: 'ep-001',
    actor: 'Admin',
    contextTrigger: 'When reviewing orders',
    goal: 'Approve or reject pending orders',
    objectState: 'Order: pending → approved/rejected',
    successSignal: 'Order status updated in database',
    nonGoal: 'Auto-approval without human review',
    sourceTag: 'Q',
    sourceDetail: 'Client interview 03-07',
    decisionOwner: 'Product Owner',
    confidence: 2,
    originalText: 'Admin should be able to review and approve orders',
    ...overrides,
  };
}

describe('IntentCardStore', () => {
  /** @type {import('../dist/domains/projects/intent-card-store.js').IntentCardStore} */
  let store;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/intent-card-store.js');
    store = new mod.IntentCardStore();
  });

  test('create() returns card with generated id', () => {
    const card = store.create(makeCardInput());
    assert.ok(card.id.startsWith('ic-'));
    assert.equal(card.projectId, 'ep-001');
    assert.equal(card.actor, 'Admin');
    assert.equal(card.sourceTag, 'Q');
    assert.equal(card.triage, null);
    assert.ok(card.createdAt > 0);
  });

  test('listByProject() returns cards for a project, newest-first', () => {
    store.create(makeCardInput({ projectId: 'ep-001' }));
    store.create(makeCardInput({ projectId: 'ep-001' }));
    store.create(makeCardInput({ projectId: 'ep-002' }));

    const cards = store.listByProject('ep-001');
    assert.equal(cards.length, 2);
    assert.ok(cards[0].createdAt >= cards[1].createdAt);
    assert.equal(store.listByProject('ep-002').length, 1);
  });

  test('getById() returns card or null', () => {
    const card = store.create(makeCardInput());
    assert.deepStrictEqual(store.getById(card.id), card);
    assert.equal(store.getById('nope'), null);
  });

  test('update() patches card fields', () => {
    const card = store.create(makeCardInput());
    const updated = store.update(card.id, { actor: 'Super Admin', confidence: 3 });
    assert.equal(updated.actor, 'Super Admin');
    assert.equal(updated.confidence, 3);
    assert.equal(updated.goal, card.goal);
  });

  test('update() returns null for nonexistent id', () => {
    assert.equal(store.update('nope', { actor: 'x' }), null);
  });

  test('triage() sets triage result with computed bucket', () => {
    const card = store.create(makeCardInput({ sourceTag: 'Q' }));
    const triaged = store.triage(card.id, {
      clarity: 3,
      groundedness: 3,
      necessity: 3,
      coupling: 1,
      sizeBand: 'S',
    });
    assert.equal(triaged.triage.bucket, 'build_now');
    assert.equal(triaged.triage.resolutionPath, null);
    assert.equal(triaged.triage.clarity, 3);
  });

  test('triage() A-tagged card cannot be build_now', () => {
    const card = store.create(makeCardInput({ sourceTag: 'A' }));
    const triaged = store.triage(card.id, {
      clarity: 3,
      groundedness: 3,
      necessity: 3,
      coupling: 1,
      sizeBand: 'S',
    });
    assert.notEqual(triaged.triage.bucket, 'build_now');
    assert.equal(triaged.triage.bucket, 'validate_first');
  });

  test('triage() clarify_first when high necessity but low clarity', () => {
    const card = store.create(makeCardInput({ sourceTag: 'Q' }));
    const triaged = store.triage(card.id, {
      clarity: 1,
      groundedness: 2,
      necessity: 3,
      coupling: 1,
      sizeBand: 'M',
    });
    assert.equal(triaged.triage.bucket, 'clarify_first');
  });

  test('triage() validate_first when high clarity but low groundedness', () => {
    const card = store.create(makeCardInput({ sourceTag: 'D' }));
    const triaged = store.triage(card.id, {
      clarity: 3,
      groundedness: 1,
      necessity: 3,
      coupling: 1,
      sizeBand: 'M',
    });
    assert.equal(triaged.triage.bucket, 'validate_first');
  });

  test('triage() challenge when clear + grounded but low necessity', () => {
    const card = store.create(makeCardInput({ sourceTag: 'Q' }));
    const triaged = store.triage(card.id, {
      clarity: 3,
      groundedness: 3,
      necessity: 1,
      coupling: 1,
      sizeBand: 'S',
    });
    assert.equal(triaged.triage.bucket, 'challenge');
  });

  test('triage() later as fallback', () => {
    const card = store.create(makeCardInput({ sourceTag: 'Q' }));
    const triaged = store.triage(card.id, {
      clarity: 1,
      groundedness: 1,
      necessity: 1,
      coupling: 3,
      sizeBand: 'XL',
    });
    assert.equal(triaged.triage.bucket, 'later');
  });

  test('triage() returns null for nonexistent id', () => {
    assert.equal(store.triage('nope', { clarity: 1, groundedness: 1, necessity: 1, coupling: 1, sizeBand: 'S' }), null);
  });

  test('listByProject() with bucket filter', () => {
    const c1 = store.create(makeCardInput({ sourceTag: 'Q' }));
    const c2 = store.create(makeCardInput({ sourceTag: 'A' }));

    store.triage(c1.id, { clarity: 3, groundedness: 3, necessity: 3, coupling: 1, sizeBand: 'S' });
    store.triage(c2.id, { clarity: 3, groundedness: 3, necessity: 3, coupling: 1, sizeBand: 'S' });

    const buildNow = store.listByProject('ep-001', 'build_now');
    assert.equal(buildNow.length, 1);
    assert.equal(buildNow[0].id, c1.id);

    const validateFirst = store.listByProject('ep-001', 'validate_first');
    assert.equal(validateFirst.length, 1);
    assert.equal(validateFirst[0].id, c2.id);
  });

  test('delete() removes card', () => {
    const card = store.create(makeCardInput());
    assert.equal(store.delete(card.id), true);
    assert.equal(store.getById(card.id), null);
    assert.equal(store.delete(card.id), false);
  });
});

describe('computeBucket', () => {
  /** @type {typeof import('../dist/domains/projects/intent-card-store.js').computeBucket} */
  let computeBucket;

  beforeEach(async () => {
    const mod = await import('../dist/domains/projects/intent-card-store.js');
    computeBucket = mod.computeBucket;
  });

  test('A-tagged always goes to validate_first', () => {
    const result = computeBucket({ clarity: 3, groundedness: 3, necessity: 3, coupling: 1, sizeBand: 'S' }, 'A');
    assert.equal(result.bucket, 'validate_first');
    assert.equal(result.resolutionPath, 'evidence');
  });

  test('high scores + S/M size = build_now', () => {
    const result = computeBucket({ clarity: 2, groundedness: 2, necessity: 2, coupling: 2, sizeBand: 'M' }, 'Q');
    assert.equal(result.bucket, 'build_now');
  });

  test('L/XL size prevents build_now even with high scores', () => {
    const result = computeBucket({ clarity: 3, groundedness: 3, necessity: 3, coupling: 1, sizeBand: 'L' }, 'Q');
    assert.notEqual(result.bucket, 'build_now');
  });
});
