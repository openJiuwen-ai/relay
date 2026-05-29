/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextHealthBar } from '../ContextHealthBar';

Object.assign(globalThis as Record<string, unknown>, { React });

function render(agentId: string): string {
  return renderToStaticMarkup(
    React.createElement(ContextHealthBar, {
      agentId,
      health: {
        usedTokens: 60000,
        windowTokens: 150000,
        fillRatio: 0.4,
        source: 'exact',
        measuredAt: Date.now(),
      },
    }),
  );
}

describe('ContextHealthBar family variant colors', () => {
  it('uses maine-coon green shade for gpt52', () => {
    const html = render('gpt52');
    expect(html).toContain('background-color:#66BB6A');
  });

  it('uses ragdoll purple shade for sonnet', () => {
    const html = render('sonnet');
    expect(html).toContain('background-color:#B39DDB');
  });
});
