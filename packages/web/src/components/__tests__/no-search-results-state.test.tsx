/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoSearchResultsState } from '@/components/shared/NoSearchResultsState';

describe('NoSearchResultsState', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the empty search state artwork, copy, spacing, and clear action', async () => {
    const onClear = vi.fn();

    await act(async () => {
      root.render(React.createElement(NoSearchResultsState, { onClear }));
    });

    const wrapper = container.querySelector('[data-testid="no-search-results-state"]') as HTMLDivElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('items-center');
    expect(wrapper?.className).toContain('text-center');

    const image = container.querySelector('[data-testid="no-search-results-image"]') as HTMLImageElement | null;
    expect(image?.getAttribute('src')).toBe('/images/no-search-results.svg');
    expect(image?.className).toContain('h-[60px]');
    expect(image?.className).toContain('w-[60px]');
    expect(image?.className).toContain('mb-[18px]');

    const textBlock = container.querySelector('[data-testid="no-search-results-copy"]') as HTMLDivElement | null;
    expect(textBlock?.className).toContain('gap-1');
    expect(textBlock?.textContent).toContain('暂未匹配到数据');
    expect(textBlock?.textContent).toContain('没有匹配到符合条件的数据');

    const clearButton = container.querySelector('[data-testid="no-search-results-clear"]') as HTMLButtonElement | null;
    expect(clearButton?.textContent).toContain('清空筛选器');
    expect(clearButton?.className).toContain('ui-button-default');
    expect(clearButton?.className).toContain('mt-4');

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
