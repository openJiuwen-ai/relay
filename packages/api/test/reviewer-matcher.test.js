/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Tests for reviewer-matcher.ts
 * F032: Dynamic reviewer selection
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

// Mock cat-config-loader before importing reviewer-matcher
const _mockRoster = {
  opus: { family: 'ragdoll', roles: ['architect', 'peer-reviewer'], lead: true, available: true, evaluation: 'test' },
  'opus-45': {
    family: 'ragdoll',
    roles: ['architect', 'peer-reviewer'],
    lead: false,
    available: true,
    evaluation: 'test',
  },
  sonnet: { family: 'ragdoll', roles: ['assistant'], lead: false, available: true, evaluation: 'test' },
  codex: {
    family: 'maine-coon',
    roles: ['peer-reviewer', 'security'],
    lead: true,
    available: true,
    evaluation: 'test',
  },
  gpt52: {
    family: 'maine-coon',
    roles: ['peer-reviewer', 'thinker'],
    lead: false,
    available: true,
    evaluation: 'test',
  },
  gemini: { family: 'siamese', roles: ['designer'], lead: true, available: true, evaluation: 'test' },
};

const _mockPolicy = {
  requireDifferentFamily: true,
  preferActiveInThread: true,
  preferLead: true,
  excludeUnavailable: true,
};

// We need to test the module with mocked config
let resolveReviewer, canReview, _getAvailableReviewers;

describe('reviewer-matcher', () => {
  beforeEach(async () => {
    // Dynamic import to get fresh module
    const mod = await import('../dist/domains/agents/services/collaboration/reviewer-matcher.js');
    resolveReviewer = mod.resolveReviewer;
    canReview = mod.canReview;
    _getAvailableReviewers = mod.getAvailableReviewers;
  });

  describe('resolveReviewer', () => {
    it('selects different-family reviewer for opus', async () => {
      // opus is ragdoll, should get maine-coon or siamese reviewer
      const result = await resolveReviewer({ author: 'opus' });

      // Should be codex or gpt52 (maine-coon family, has peer-reviewer role)
      assert.ok(
        result.reviewer === 'codex' || result.reviewer === 'gpt52',
        `Expected codex or gpt52, got ${result.reviewer}`,
      );
      assert.equal(result.isDegraded, false);
    });

    it('selects different-family reviewer for codex', async () => {
      // codex is maine-coon, should get ragdoll reviewer
      const result = await resolveReviewer({ author: 'codex' });

      // Should be opus or opus-45 (ragdoll family, has peer-reviewer role)
      assert.ok(
        result.reviewer === 'opus' || result.reviewer === 'opus-45',
        `Expected opus or opus-45, got ${result.reviewer}`,
      );
      assert.equal(result.isDegraded, false);
    });

    it('prefers lead when multiple candidates available', async () => {
      // For codex, both opus (lead) and opus-45 (not lead) are available
      // Should prefer opus (lead)
      const result = await resolveReviewer({ author: 'codex' });

      // Without thread activity, should prefer lead
      assert.equal(result.reviewer, 'opus');
      assert.equal(result.isDegraded, false);
    });

    it('returns candidates list', async () => {
      const result = await resolveReviewer({ author: 'opus' });

      // Should include all available peer-reviewers except author
      assert.ok(result.candidates.length >= 2);
      assert.ok(!result.candidates.includes('opus')); // author excluded
    });
  });

  describe('canReview', () => {
    it('rejects self-review', () => {
      const result = canReview('opus', 'opus');
      assert.equal(result.canReview, false);
      assert.ok(result.reason.includes('own code'));
    });

    it('rejects non-peer-reviewer', () => {
      // sonnet has 'assistant' role, not 'peer-reviewer'
      const result = canReview('sonnet', 'codex');
      assert.equal(result.canReview, false);
      assert.ok(result.reason.includes('peer-reviewer role'));
    });

    it('rejects same-family when policy requires different', () => {
      // opus and opus-45 are both ragdoll
      const result = canReview('opus-45', 'opus');
      assert.equal(result.canReview, false);
      assert.ok(result.reason.includes('Same family'));
    });

    it('allows different-family peer-reviewer', () => {
      // codex (maine-coon) reviewing opus (ragdoll)
      const result = canReview('codex', 'opus');
      assert.equal(result.canReview, true);
      assert.equal(result.reason, 'OK');
    });

    it('allows opus reviewing codex', () => {
      const result = canReview('opus', 'codex');
      assert.equal(result.canReview, true);
      assert.equal(result.reason, 'OK');
    });
  });

  describe('unavailable cats', () => {
    // Note: These tests would need mock injection to fully test
    // For now, we verify the logic works with the current roster

    it('handles missing author in roster gracefully', async () => {
      // unknown cat not in roster
      const result = await resolveReviewer({ author: 'unknown-cat' });

      // Should return default cat without error
      assert.ok(result.reviewer);
      assert.equal(result.isDegraded, false);
    });
  });
});
