/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis as Record<string, unknown>, { React });

afterEach(() => {
  vi.doUnmock('@openjiuwen/relay-shared');
  vi.resetModules();
});

describe('MarkdownContent alias source', () => {
  it('follows OFFICE_CLAW_CONFIGS mentionPatterns dynamically', async () => {
    let expectedDisplayName = '';

    vi.doMock('@openjiuwen/relay-shared', async () => {
      const actual = await vi.importActual<typeof import('@openjiuwen/relay-shared')>('@openjiuwen/relay-shared');
      expectedDisplayName = actual.OFFICE_CLAW_CONFIGS.opus.displayName;
      const opusPatterns = [...actual.OFFICE_CLAW_CONFIGS.opus.mentionPatterns, '@测试布偶别名'];
      return {
        ...actual,
        OFFICE_CLAW_CONFIGS: {
          ...actual.OFFICE_CLAW_CONFIGS,
          opus: {
            ...actual.OFFICE_CLAW_CONFIGS.opus,
            mentionPatterns: opusPatterns,
          },
        },
      };
    });

    // Must also re-import mention-highlight (which reads OFFICE_CLAW_CONFIGS at module init)
    await import('@/lib/mention-highlight');
    const { MarkdownContent } = await import('@/components/MarkdownContent');
    const html = renderToStaticMarkup(React.createElement(MarkdownContent, { content: '@测试布偶别名 你先看下' }));
    expect(html).toContain('user-question-mention');
    expect(html).toContain(`@${expectedDisplayName}`);
  });
});
