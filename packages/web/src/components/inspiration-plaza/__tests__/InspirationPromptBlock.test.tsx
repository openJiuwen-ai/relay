/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InspirationPromptBlock } from '../components/InspirationPromptBlock';

describe('InspirationPromptBlock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders prompt text without placeholders', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationPromptBlock, { prompt: '这是一个普通提示词' }));
    });

    expect(container.textContent).toContain('这是一个普通提示词');
  });

  it('renders prompt text with single placeholder', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationPromptBlock, { prompt: '请写一篇关于{{topic}}的文章' }));
    });

    expect(container.textContent).toContain('请写一篇关于');
    expect(container.textContent).toContain('topic');
    expect(container.textContent).toContain('的文章');
  });

  it('renders prompt text with multiple placeholders', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationPromptBlock, { prompt: '{{role}}对{{audience}}说{{message}}' }));
    });

    expect(container.textContent).toContain('role');
    expect(container.textContent).toContain('audience');
    expect(container.textContent).toContain('message');
  });

  it('renders placeholder with special styling', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationPromptBlock, { prompt: '主题：{{subject}}' }));
    });

    const placeholder = container.querySelector('.bg-\\[var\\(--surface-muted\\)\\] span');
    expect(placeholder).not.toBeNull();
  });

  it('renders prompt with text before and after placeholder', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationPromptBlock, { prompt: '前缀{{slot}}后缀' }));
    });

    const content = container.textContent || '';
    expect(content).toContain('前缀');
    expect(content).toContain('slot');
    expect(content).toContain('后缀');
  });
});