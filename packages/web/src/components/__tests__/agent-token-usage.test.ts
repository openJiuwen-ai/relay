/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F8: AgentTokenUsage component tests (dynamic redesign).
 * Verifies per-cat token usage display with brand colors, cache bar, animations.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentTokenUsage } from '../AgentTokenUsage';

function render(agentId: string, usage: Parameters<typeof AgentTokenUsage>[0]['usage']): string {
  return renderToStaticMarkup(React.createElement(AgentTokenUsage, { agentId, usage }));
}

describe('F8: AgentTokenUsage (dynamic redesign)', () => {
  it('renders nothing when usage has no token fields', () => {
    const html = render('opus', {});
    expect(html).toBe('');
  });

  it('renders token counts with arrows for opus-style usage', () => {
    const html = render('opus', {
      inputTokens: 39270,
      outputTokens: 9938,
      cacheReadTokens: 33000,
      costUsd: 0.17,
    });

    // Input/output with arrows
    expect(html).toContain('39.3k');
    expect(html).toContain('↓');
    expect(html).toContain('9.9k');
    expect(html).toContain('↑');
    // Cache bar present: 33000 / 39270 = 84% (inputTokens = total after normalization)
    expect(html).toContain('缓存命中');
    expect(html).toContain('84%');
    expect(html).toContain('cache-bar-opus');
    // Cost in amber
    expect(html).toContain('$0.17');
    // Brand color class
    expect(html).toContain('text-opus-dark');
  });

  it('renders codex-style usage with brand color', () => {
    const html = render('codex', {
      inputTokens: 2000,
      outputTokens: 800,
      cacheReadTokens: 1500,
    });

    expect(html).toContain('2.0k');
    expect(html).toContain('800');
    // 1500 / 2000 = 75% (inputTokens = total after normalization)
    expect(html).toContain('75%');
    expect(html).toContain('text-codex-dark');
    // No cost field
    expect(html).not.toContain('$');
  });

  it('renders gemini-style usage with totalTokens only', () => {
    const html = render('gemini', { totalTokens: 1500 });

    expect(html).toContain('1.5k');
    expect(html).toContain('tok');
    expect(html).toContain('text-gemini-dark');
    // No arrows for totalTokens-only
    expect(html).not.toContain('↓');
  });

  it('shows turns only when > 1', () => {
    const html1 = render('opus', { inputTokens: 1000, numTurns: 1 });
    expect(html1).not.toContain('turns');

    const html2 = render('codex', { inputTokens: 1000, numTurns: 3 });
    expect(html2).toContain('3 turns');
  });

  it('shows API duration', () => {
    const html = render('opus', {
      inputTokens: 1000,
      durationApiMs: 3900,
    });

    expect(html).toContain('API 3.9s');
  });

  it('has correct data-testid attribute', () => {
    const html = render('opus', { inputTokens: 500 });
    expect(html).toContain('data-testid="token-usage-opus"');
  });

  it('does not show cache bar when cache percent is 0', () => {
    const html = render('opus', { inputTokens: 1000, outputTokens: 500 });
    expect(html).not.toContain('cache-bar');
  });

  it('shows context bar label when context health is present', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentTokenUsage, {
        agentId: 'gemini',
        usage: { inputTokens: 1200, outputTokens: 300 },
        contextHealth: {
          usedTokens: 1200,
          windowTokens: 1000000,
          fillRatio: 0.0012,
          source: 'approx',
          measuredAt: Date.now(),
        },
      }),
    );

    expect(html).toContain('上下文占用');
    expect(html).toContain('context-health-gemini');
  });

  it('shows exact context left summary and reset date when usage provides context telemetry', () => {
    const html = render('codex', {
      inputTokens: 529593,
      outputTokens: 10298,
      contextUsedTokens: 186749,
      contextWindowSize: 258400,
      contextResetsAtMs: new Date(2026, 1, 18, 12, 0, 0).getTime(),
    });

    expect(html).toContain('Context: 28% left (186,749 used / 258K)');
    expect(html).toContain('(resets 2月18日)');
  });
});
