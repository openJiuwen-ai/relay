/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';

const mod = await import('../dist/domains/agents/services/agents/routing/multi-mention-state-machine.js');

describe('MultiMentionStateMachine', () => {
  // ── Deterministic transition tests ──────────────────────────────

  test('valid transitions from pending', () => {
    assert.ok(mod.isValidTransition('pending', 'running'));
    assert.ok(mod.isValidTransition('pending', 'failed'));
    assert.ok(!mod.isValidTransition('pending', 'done'));
    assert.ok(!mod.isValidTransition('pending', 'partial'));
    assert.ok(!mod.isValidTransition('pending', 'timeout'));
  });

  test('valid transitions from running', () => {
    assert.ok(mod.isValidTransition('running', 'partial'));
    assert.ok(mod.isValidTransition('running', 'done'));
    assert.ok(mod.isValidTransition('running', 'timeout'));
    assert.ok(mod.isValidTransition('running', 'failed'));
    assert.ok(!mod.isValidTransition('running', 'pending'));
  });

  test('valid transitions from partial', () => {
    assert.ok(mod.isValidTransition('partial', 'done'));
    assert.ok(mod.isValidTransition('partial', 'timeout'));
    assert.ok(!mod.isValidTransition('partial', 'pending'));
    assert.ok(!mod.isValidTransition('partial', 'running'));
    assert.ok(!mod.isValidTransition('partial', 'failed'));
  });

  test('terminal states have no outbound transitions', () => {
    for (const terminal of ['done', 'timeout', 'failed']) {
      const allowed = mod.getAllowedTransitions(terminal);
      assert.deepEqual(allowed, [], `${terminal} should have no outbound transitions`);
    }
  });

  test('ALL_STATUSES contains all 6 states', () => {
    assert.equal(mod.ALL_STATUSES.length, 6);
    for (const s of ['pending', 'running', 'partial', 'done', 'timeout', 'failed']) {
      assert.ok(mod.ALL_STATUSES.includes(s), `missing ${s}`);
    }
  });

  test('TERMINAL_STATES contains exactly done, timeout, failed', () => {
    assert.equal(mod.TERMINAL_STATES.size, 3);
    assert.ok(mod.TERMINAL_STATES.has('done'));
    assert.ok(mod.TERMINAL_STATES.has('timeout'));
    assert.ok(mod.TERMINAL_STATES.has('failed'));
  });

  // ── Property-based tests ────────────────────────────────────────

  test('random walk never reaches invalid state', () => {
    const statusArb = fc.constantFrom('pending', 'running', 'partial', 'done', 'timeout', 'failed');
    fc.assert(
      fc.property(fc.array(statusArb, { minLength: 1, maxLength: 20 }), (steps) => {
        let state = 'pending';
        for (const next of steps) {
          if (mod.isValidTransition(state, next)) state = next;
        }
        return mod.ALL_STATUSES.includes(state);
      }),
      { seed: 20260308, numRuns: 500 },
    );
  });

  test('terminal states absorb (no outbound)', () => {
    for (const terminal of mod.TERMINAL_STATES) {
      for (const any of mod.ALL_STATUSES) {
        assert.ok(!mod.isValidTransition(terminal, any), `terminal ${terminal} should not transition to ${any}`);
      }
    }
  });

  test('isValidTransition and getAllowedTransitions are consistent', () => {
    for (const from of mod.ALL_STATUSES) {
      const allowed = mod.getAllowedTransitions(from);
      for (const to of mod.ALL_STATUSES) {
        const valid = mod.isValidTransition(from, to);
        const inAllowed = allowed.includes(to);
        assert.equal(
          valid,
          inAllowed,
          `inconsistency: isValid(${from},${to})=${valid} but getAllowed(${from}).includes(${to})=${inAllowed}`,
        );
      }
    }
  });
});
