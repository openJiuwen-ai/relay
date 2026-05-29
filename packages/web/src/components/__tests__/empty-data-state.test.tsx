/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmptyDataState } from '@/components/shared/EmptyDataState';

describe('EmptyDataState', () => {
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

  it('renders the shared empty-data illustration and title only', async () => {
    await act(async () => {
      root.render(React.createElement(EmptyDataState));
    });

    const wrapper = container.querySelector('[data-testid="empty-data-state"]') as HTMLDivElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('items-center');
    expect(wrapper?.className).toContain('text-center');

    const image = container.querySelector('[data-testid="empty-data-image"]') as HTMLImageElement | null;
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('/images/no-data.svg');
    expect(image?.className).toContain('h-[60px]');
    expect(image?.className).toContain('w-[60px]');
    expect(image?.className).toContain('mb-[18px]');

    const title = container.querySelector('[data-testid="empty-data-title"]') as HTMLParagraphElement | null;
    expect(title).not.toBeNull();
    expect(title?.textContent).toContain('暂无数据');
    expect(title?.className).toContain('text-sm');
    expect(title?.className).toContain('font-medium');

    expect(container.querySelector('button')).toBeNull();
  });

  it('renders a custom title when provided', async () => {
    await act(async () => {
      root.render(React.createElement(EmptyDataState, { title: '暂无模型' }));
    });

    const title = container.querySelector('[data-testid="empty-data-title"]') as HTMLParagraphElement | null;
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe('暂无模型');
  });
});
