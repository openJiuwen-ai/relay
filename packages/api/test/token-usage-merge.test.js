/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F8 P2-2 regression: mergeTokenUsage should accumulate, not overwrite.
 * When the same agentId appears twice in an A2A chain (opus→codex→opus),
 * the second opus usage must add to the first, not replace it.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { mergeTokenUsage } = await import('../dist/domains/agents/services/types.js');

describe('F8: mergeTokenUsage', () => {
  it('returns incoming usage when existing is undefined', () => {
    const result = mergeTokenUsage(undefined, { inputTokens: 1000, outputTokens: 500 });
    assert.deepStrictEqual(result, { inputTokens: 1000, outputTokens: 500 });
  });

  it('accumulates numeric fields from two usage objects', () => {
    const first = { inputTokens: 10000, outputTokens: 3000, costUsd: 0.1 };
    const second = { inputTokens: 8000, outputTokens: 2000, costUsd: 0.08 };
    const result = mergeTokenUsage(first, second);

    assert.equal(result.inputTokens, 18000);
    assert.equal(result.outputTokens, 5000);
    assert.equal(result.costUsd, 0.18);
  });

  it('handles partial fields — only accumulates fields present in incoming', () => {
    const first = { inputTokens: 5000, outputTokens: 1000, cacheReadTokens: 4000 };
    const second = { inputTokens: 3000, outputTokens: 500 };
    const result = mergeTokenUsage(first, second);

    assert.equal(result.inputTokens, 8000);
    assert.equal(result.outputTokens, 1500);
    // cacheReadTokens preserved from first (not in second)
    assert.equal(result.cacheReadTokens, 4000);
  });

  it('handles totalTokens accumulation for Gemini', () => {
    const first = { totalTokens: 1000 };
    const second = { totalTokens: 2000 };
    const result = mergeTokenUsage(first, second);

    assert.equal(result.totalTokens, 3000);
  });

  it('overwrites latest context snapshot fields instead of accumulating them', () => {
    const first = {
      contextWindowSize: 200000,
      lastTurnInputTokens: 44000,
      contextUsedTokens: 186749,
      contextResetsAtMs: 1771482198000,
    };
    const second = {
      contextWindowSize: 258400,
      lastTurnInputTokens: 51234,
      contextUsedTokens: 190000,
      contextResetsAtMs: 1771723048000,
    };
    const result = mergeTokenUsage(first, second);

    assert.equal(result.contextWindowSize, 258400);
    assert.equal(result.lastTurnInputTokens, 51234);
    assert.equal(result.contextUsedTokens, 190000);
    assert.equal(result.contextResetsAtMs, 1771723048000);
  });
});
