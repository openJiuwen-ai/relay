/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F8: ParallelStatusBar aggregateUsage tests.
 * Verifies cross-cat token usage aggregation.
 */
import { describe, expect, it } from 'vitest';
import { aggregateUsage } from '../ParallelStatusBar';

describe('F8: aggregateUsage', () => {
  it('returns null when no invocations have usage', () => {
    expect(aggregateUsage({})).toBeNull();
    expect(aggregateUsage({ opus: { sessionId: 'x' } })).toBeNull();
  });

  it('aggregates input/output/cost across multiple cats', () => {
    const result = aggregateUsage({
      opus: { usage: { inputTokens: 30000, outputTokens: 8000, costUsd: 0.15 } },
      codex: { usage: { inputTokens: 5000, outputTokens: 2000 } },
      gemini: { usage: { totalTokens: 3000 } },
    });

    expect(result).not.toBeNull();
    // opus 30k + codex 5k + gemini 3k (totalTokens falls back to input)
    expect(result?.inputTokens).toBe(38000);
    // opus 8k + codex 2k
    expect(result?.outputTokens).toBe(10000);
    // only opus has cost
    expect(result?.costUsd).toBe(0.15);
  });

  it('handles single cat with detailed usage', () => {
    const result = aggregateUsage({
      opus: { usage: { inputTokens: 10000, outputTokens: 3000, costUsd: 0.05 } },
    });

    expect(result?.inputTokens).toBe(10000);
    expect(result?.outputTokens).toBe(3000);
    expect(result?.costUsd).toBe(0.05);
  });

  it('omits zero-value fields from result', () => {
    const result = aggregateUsage({
      gemini: { usage: { totalTokens: 500 } },
    });

    expect(result?.inputTokens).toBe(500);
    // outputTokens not set (0 → omitted)
    expect(result?.outputTokens).toBeUndefined();
    // no cost
    expect(result?.costUsd).toBeUndefined();
  });

  // P2-1 regression: stale cats should be excluded when filterAgentIds is provided
  it('filters to only targetAgents when filterAgentIds is provided', () => {
    const result = aggregateUsage(
      {
        opus: { usage: { inputTokens: 30000, outputTokens: 8000, costUsd: 0.15 } },
        codex: { usage: { inputTokens: 5000, outputTokens: 2000 } },
        gemini: { usage: { totalTokens: 3000 } },
      },
      ['opus', 'codex'],
    );

    expect(result).not.toBeNull();
    // Only opus + codex, NOT gemini
    expect(result?.inputTokens).toBe(35000);
    expect(result?.outputTokens).toBe(10000);
    expect(result?.costUsd).toBe(0.15);
  });

  it('returns null when filterAgentIds has no matching usage', () => {
    const result = aggregateUsage(
      {
        opus: { usage: { inputTokens: 30000 } },
      },
      ['gemini'],
    );
    expect(result).toBeNull();
  });
});
