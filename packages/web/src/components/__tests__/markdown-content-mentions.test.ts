/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OFFICE_CLAW_CONFIGS } from '@openjiuwen/relay-shared';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '@/components/MarkdownContent';

Object.assign(globalThis as Record<string, unknown>, { React });

function render(content: string): string {
  return renderToStaticMarkup(React.createElement(MarkdownContent, { content }));
}

describe('MarkdownContent mention highlighting', () => {
  it('highlights nickname and english-alias mentions with cat colors', () => {
    const codexAlias = OFFICE_CLAW_CONFIGS.codex.mentionPatterns[0]!;
    const opusAlias = OFFICE_CLAW_CONFIGS.opus.mentionPatterns[0]!;
    const geminiAlias = OFFICE_CLAW_CONFIGS.gemini.mentionPatterns[0]!;
    const html = render(`${codexAlias} 请看下，${opusAlias} 也看下，${geminiAlias} 收尾`);

    expect(html).toContain('user-question-mention');
    expect(html).toContain('color:rgb(20, 118, 255)');
    expect(html).toContain(`@${OFFICE_CLAW_CONFIGS.codex.displayName}`);
    expect(html).toContain(`@${OFFICE_CLAW_CONFIGS.opus.displayName}`);
    expect(html).toContain(`@${OFFICE_CLAW_CONFIGS.gemini.displayName}`);
  });

  it('renders mention ids as display names', () => {
    const jiuwenAlias = OFFICE_CLAW_CONFIGS.jiuwenclaw.mentionPatterns[0]!;
    const codexAlias = OFFICE_CLAW_CONFIGS.codex.mentionPatterns[0]!;
    const html = render(`${jiuwenAlias} 帮我整理一下，并且 ${codexAlias} 看代码`);

    expect(html).toContain(`@${OFFICE_CLAW_CONFIGS.jiuwenclaw.displayName}`);
    expect(html).toContain(`@${OFFICE_CLAW_CONFIGS.codex.displayName}`);
    expect(html).not.toContain(jiuwenAlias);
    expect(html).not.toContain(codexAlias);
  });
});
