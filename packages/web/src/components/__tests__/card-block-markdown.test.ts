/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardBlock } from '@/components/rich/CardBlock';

Object.assign(globalThis as Record<string, unknown>, { React });

function render(block: Parameters<typeof CardBlock>[0]['block']): string {
  return renderToStaticMarkup(React.createElement(CardBlock, { block }));
}

describe('CardBlock Markdown rendering (#85 T8)', () => {
  it('renders **bold** in bodyMarkdown as <strong>', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'Test',
      bodyMarkdown: '**bold text**',
    });
    expect(html).toContain('<strong');
    expect(html).toContain('bold text');
  });

  it('renders *italic* in bodyMarkdown as <em>', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'Test',
      bodyMarkdown: '*italic text*',
    });
    expect(html).toContain('<em');
    expect(html).toContain('italic text');
  });

  it('renders inline `code` in bodyMarkdown', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'Test',
      bodyMarkdown: 'use `normalizeRichBlock` here',
    });
    expect(html).toContain('<code');
    expect(html).toContain('normalizeRichBlock');
  });

  it('still renders title as plain text', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'Summary Card',
      bodyMarkdown: 'body',
    });
    expect(html).toContain('Summary Card');
  });

  // P1 regression: bodyMarkdown starting with / must NOT be truncated (砚砚 R1)
  it('does not strip slash-prefix from bodyMarkdown (disableCommandPrefix)', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'Path Card',
      bodyMarkdown: '/home/user/projects is the path',
    });
    // The full path must be present — not truncated by command-prefix logic
    expect(html).toContain('/home/user/projects');
    // The "/home" prefix specifically must NOT be stripped
    expect(html).toContain('/home');
  });

  it('does not strip /api prefix from bodyMarkdown', () => {
    const html = render({
      id: 'b1',
      kind: 'card',
      v: 1,
      title: 'API Card',
      bodyMarkdown: '/api/callbacks/create-rich-block is the endpoint',
    });
    expect(html).toContain('/api/callbacks/create-rich-block');
  });
});
