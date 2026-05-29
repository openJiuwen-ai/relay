/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const markdownRenderSpy = vi.fn(({ content }: { content: string }) => React.createElement('p', null, content));

vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: (props: { content: string }) => markdownRenderSpy(props),
}));

describe('ThinkingContent streaming render path', () => {
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    markdownRenderSpy.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders streaming thinking without invoking the markdown renderer', async () => {
    const { ThinkingContent } = await import('../components/ThinkingContent');

    act(() => {
      root.render(<ThinkingContent content="stream chunk" status="streaming" events={[]} />);
    });

    expect(container.textContent).toContain('stream chunk');
    expect(markdownRenderSpy).not.toHaveBeenCalled();
  });

  it('shows only the latest streaming thinking tail when content grows too large', async () => {
    const { ThinkingContent } = await import('../components/ThinkingContent');
    const content = `HEAD-${'x'.repeat(13000)}-TAIL`;

    act(() => {
      root.render(<ThinkingContent content={content} status="streaming" events={[]} />);
    });

    expect(container.textContent).toContain('仅展示最近');
    expect(container.textContent).toContain('-TAIL');
    expect(container.textContent).not.toContain('HEAD-');
    expect(markdownRenderSpy).not.toHaveBeenCalled();
  });
});
