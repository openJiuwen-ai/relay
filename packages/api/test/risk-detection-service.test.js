/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('detectRisks', () => {
  /** @type {typeof import('../dist/domains/projects/risk-detection-service.js').detectRisks} */
  let detectRisks;

  test('setup', async () => {
    const mod = await import('../dist/domains/projects/risk-detection-service.js');
    detectRisks = mod.detectRisks;
  });

  /** minimal card factory */
  function makeCard(overrides = {}) {
    return {
      id: 'ic-1',
      projectId: 'ep-1',
      actor: 'Store Manager',
      contextTrigger: 'When reviewing daily sales',
      goal: 'View today sales summary',
      objectState: 'Dashboard shows aggregated numbers',
      successSignal: 'Manager sees revenue, orders, top items',
      nonGoal: 'No real-time streaming',
      sourceTag: /** @type {const} */ ('Q'),
      sourceDetail: 'Client interview 2026-03-01',
      decisionOwner: 'Product Manager',
      confidence: /** @type {const} */ (2),
      dependencyTags: [],
      riskSignals: [],
      triage: null,
      originalText: 'As a store manager I want to see daily sales',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  test('hollow_verbs: detects vague action words in goal', () => {
    const card = makeCard({ goal: 'Improve system performance and optimize workflows' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'hollow_verbs'));
  });

  test('missing_actors: detects system-only or empty actor', () => {
    const card = makeCard({ actor: 'the system' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'missing_actors'));
  });

  test('unknown_data_source: detects empty sourceDetail with data references', () => {
    const card = makeCard({ sourceDetail: '', goal: 'Query the database for user records' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'unknown_data_source'));
  });

  test('missing_success_signal: detects empty successSignal', () => {
    const card = makeCard({ successSignal: '' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'missing_success_signal'));
  });

  test('missing_edge_cases: detects no error/boundary mentions', () => {
    const card = makeCard({ nonGoal: '' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'missing_edge_cases'));
  });

  test('hidden_dependencies: detects 4+ dependency tags', () => {
    const card = makeCard({ dependencyTags: ['auth', 'billing', 'notification', 'analytics'] });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'hidden_dependencies'));
  });

  test('ai_fake_specificity: detects A-tagged card with empty objectState', () => {
    const card = makeCard({ sourceTag: /** @type {const} */ ('A'), objectState: '' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'ai_fake_specificity'));
  });

  test('scope_creep: detects expansive language', () => {
    const card = makeCard({ goal: 'Build enterprise-grade MVP with all modules' });
    const results = detectRisks(card);
    assert.ok(results.some((r) => r.signal === 'scope_creep'));
  });

  test('clean card: no risks detected', () => {
    const card = makeCard();
    const results = detectRisks(card);
    assert.equal(results.length, 0);
  });

  test('combo: card with multiple signals', () => {
    const card = makeCard({
      actor: '',
      goal: 'Enhance the enterprise system',
      successSignal: '',
      sourceTag: /** @type {const} */ ('A'),
      objectState: '',
      dependencyTags: ['a', 'b', 'c', 'd'],
    });
    const results = detectRisks(card);
    assert.ok(results.length >= 4);
    const signals = results.map((r) => r.signal);
    assert.ok(signals.includes('missing_actors'));
    assert.ok(signals.includes('missing_success_signal'));
    assert.ok(signals.includes('ai_fake_specificity'));
    assert.ok(signals.includes('hidden_dependencies'));
  });
});
