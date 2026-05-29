/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMissionPack, formatMissionPackPrompt } from '../../dist/config/governance/mission-pack.js';

describe('mission-pack', () => {
  it('builds pack from thread with backlogItemId and phase', () => {
    const pack = buildMissionPack({
      title: 'Implement auth flow',
      phase: 'implementing',
      backlogItemId: 'AUTH-001',
    });
    assert.equal(pack.workItem, 'AUTH-001');
    assert.equal(pack.phase, 'implementing');
    assert.ok(pack.mission.includes('Implement auth flow'));
  });

  it('falls back to thread title when no backlogItemId', () => {
    const pack = buildMissionPack({ title: 'Fix login bug' });
    assert.equal(pack.workItem, 'Fix login bug');
    assert.equal(pack.phase, 'unknown');
  });

  it('formats prompt block with all fields', () => {
    const prompt = formatMissionPackPrompt({
      mission: 'Implement OAuth2 login',
      workItem: 'AUTH-001',
      phase: 'implementing',
      doneWhen: ['Login endpoint returns JWT', 'Tests pass'],
      links: ['docs/features/F001-auth.md'],
    });
    assert.ok(prompt.includes('mission:'));
    assert.ok(prompt.includes('AUTH-001'));
    assert.ok(prompt.includes('implementing'));
    assert.ok(prompt.includes('Login endpoint returns JWT'));
    assert.ok(prompt.includes('docs/features/F001-auth.md'));
  });

  it('handles empty doneWhen and links gracefully', () => {
    const prompt = formatMissionPackPrompt({
      mission: 'Quick fix',
      workItem: 'thread title',
      phase: 'unknown',
      doneWhen: [],
      links: [],
    });
    assert.ok(prompt.includes('mission:'));
    assert.ok(!prompt.includes('done_when:'));
    assert.ok(!prompt.includes('links:'));
  });
});
