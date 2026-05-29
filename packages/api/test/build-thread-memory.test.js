/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildThreadMemory } from '../dist/domains/agents/services/session/buildThreadMemory.js';

describe('buildThreadMemory', () => {
  const baseDigest = {
    v: 1,
    sessionId: 's1',
    threadId: 't1',
    agentId: 'opus',
    seq: 0,
    time: { createdAt: 1000000, sealedAt: 1060000 },
    invocations: [{ toolNames: ['Edit', 'Read', 'Grep'] }],
    filesTouched: [{ path: 'src/index.ts', ops: ['edit'] }],
    errors: [],
  };

  it('creates new memory from null + digest', () => {
    const result = buildThreadMemory(null, baseDigest, 1500);
    assert.equal(result.v, 1);
    assert.equal(result.sessionsIncorporated, 1);
    assert.ok(result.summary.includes('Session #1'));
    assert.ok(result.summary.includes('Edit'));
    assert.ok(result.summary.includes('src/index.ts'));
  });

  it('appends to existing memory', () => {
    const existing = {
      v: 1,
      summary: 'Session #1 (00:16-00:17, 1min): Edit, Read. Files: src/a.ts.',
      sessionsIncorporated: 1,
      updatedAt: 1000,
    };
    const digest2 = { ...baseDigest, seq: 1, sessionId: 's2' };
    const result = buildThreadMemory(existing, digest2, 1500);
    assert.equal(result.sessionsIncorporated, 2);
    assert.ok(result.summary.includes('Session #2'));
    assert.ok(result.summary.includes('Session #1'));
  });

  it('trims oldest sessions when exceeding maxTokens', () => {
    let mem = null;
    for (let i = 0; i < 20; i++) {
      const d = {
        ...baseDigest,
        seq: i,
        sessionId: `s${i}`,
        invocations: [
          {
            toolNames: Array.from({ length: 10 }, (_, j) => `Tool${j}_${'x'.repeat(20)}`),
          },
        ],
        filesTouched: Array.from({ length: 10 }, (_, j) => ({
          path: `src/deep/module-${j}.ts`,
          ops: ['edit'],
        })),
      };
      mem = buildThreadMemory(mem, d, 500); // low cap to force trimming
    }
    assert.ok(mem);
    assert.ok(mem.summary.includes('Session #20')); // newest kept
    assert.equal(mem.summary.includes('Session #1 '), false); // oldest trimmed
  });

  it('includes error count when digest has errors', () => {
    const digestWithErrors = {
      ...baseDigest,
      errors: [{ at: 1050000, message: 'TypeError: foo' }],
    };
    const result = buildThreadMemory(null, digestWithErrors, 1500);
    assert.ok(result.summary.includes('1 error'));
  });

  it('caps tools at 10 and files at 10', () => {
    const bigDigest = {
      ...baseDigest,
      invocations: [{ toolNames: Array.from({ length: 20 }, (_, i) => `Tool${i}`) }],
      filesTouched: Array.from({ length: 20 }, (_, i) => ({
        path: `f${i}.ts`,
        ops: ['edit'],
      })),
    };
    const result = buildThreadMemory(null, bigDigest, 1500);
    // Should mention "+N more" for overflow
    assert.ok(result.summary.includes('+'));
  });

  it('returns v:1 with correct updatedAt', () => {
    const before = Date.now();
    const result = buildThreadMemory(null, baseDigest, 1500);
    assert.ok(result.updatedAt >= before);
  });

  it('handles digest with no toolNames gracefully', () => {
    const noToolsDigest = {
      ...baseDigest,
      invocations: [{ invocationId: 'inv1' }], // no toolNames
    };
    const result = buildThreadMemory(null, noToolsDigest, 1500);
    assert.equal(result.v, 1);
    assert.ok(result.summary.includes('Session #1'));
  });

  it('hard-caps single line that exceeds maxTokens', () => {
    const hugeDigest = {
      ...baseDigest,
      invocations: [
        {
          toolNames: Array.from({ length: 10 }, (_, i) => `VeryLongToolName_${'z'.repeat(100)}_${i}`),
        },
      ],
      filesTouched: Array.from({ length: 10 }, (_, i) => ({
        path: `src/very/deep/nested/directory/structure/module-${i}-with-long-name.ts`,
        ops: ['edit'],
      })),
    };
    // Very low cap — single line will exceed it
    const result = buildThreadMemory(null, hugeDigest, 50);
    assert.equal(result.v, 1);
    assert.ok(result.summary.endsWith('...'));
  });

  // R1 P1-1: session number must use digest.seq, not sessionsIncorporated
  it('uses digest.seq for session number (late-start thread)', () => {
    // Thread already on session #5 (seq=4), but no ThreadMemory yet
    const lateDigest = { ...baseDigest, seq: 4, sessionId: 's5' };
    const result = buildThreadMemory(null, lateDigest, 1500);
    // Should show "Session #5" (seq 4 → 1-based = 5), NOT "Session #1"
    assert.ok(result.summary.includes('Session #5'), `Expected "Session #5" but got: ${result.summary}`);
    assert.equal(result.summary.includes('Session #1'), false);
    // sessionsIncorporated tracks how many digests have been merged
    assert.equal(result.sessionsIncorporated, 1);
  });

  it('uses digest.seq for accumulated sessions', () => {
    // Existing memory from session #3, now sealing session #5 (seq=4)
    const existing = {
      v: 1,
      summary: 'Session #3 (10:00-10:05, 5min): Edit. Files: a.ts.',
      sessionsIncorporated: 1,
      updatedAt: 1000,
    };
    const digest5 = { ...baseDigest, seq: 4, sessionId: 's5' };
    const result = buildThreadMemory(existing, digest5, 1500);
    assert.ok(result.summary.includes('Session #5'), `Expected "Session #5" but got: ${result.summary}`);
    assert.equal(result.sessionsIncorporated, 2); // 2 digests merged
  });
});
