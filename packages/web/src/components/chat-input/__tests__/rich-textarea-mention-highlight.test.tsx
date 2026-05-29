/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { refreshThreadExpertMentionData, resetMentionDataForTest } from '@/lib/mention-highlight';
import { RichTextarea } from '../components/RichTextarea';

describe('RichTextarea expert mention highlighting', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    resetMentionDataForTest();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    resetMentionDataForTest();
  });

  it('recomputes highlight when invited expert mention data arrives after insertion', () => {
    act(() => {
      root.render(
        React.createElement(RichTextarea, {
          value: '@古诗词创作专家 ',
          mentionDataVersion: 0,
          onValueChange: () => {},
        }),
      );
    });

    expect(container.querySelector('[data-token-type="mention"]')).toBeNull();

    refreshThreadExpertMentionData([
      {
        expertId: 'expert-poetry',
        displayName: '古诗词创作专家',
        mentionPatterns: ['@古诗词创作专家', '@诗词专家', '@小诗', '@expert-poetry', '@诗词'],
        category: 'content',
      },
    ]);

    act(() => {
      root.render(
        React.createElement(RichTextarea, {
          value: '@古诗词创作专家 ',
          mentionDataVersion: 1,
          onValueChange: () => {},
        }),
      );
    });

    const mention = container.querySelector('[data-token-type="mention"]');
    expect(mention).not.toBeNull();
    expect(mention?.textContent).toBe('@古诗词创作专家');
  });
});
