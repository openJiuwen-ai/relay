/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInspirationTemplates } from '../hooks/useInspirationTemplates';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('useInspirationTemplates', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    mockFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
  });

  function TestComponent({ category = '全部', keyword = '' }: { category?: string; keyword?: string }) {
    const { templates, isLoading, error } = useInspirationTemplates({
      category: category as any,
      keyword,
    });
    return React.createElement(
      'div',
      { 'data-testid': 'result' },
      React.createElement('span', { 'data-testid': 'loading' }, isLoading ? 'loading' : 'done'),
      React.createElement('span', { 'data-testid': 'count' }, templates.length),
      React.createElement('span', { 'data-testid': 'first-image' }, templates[0]?.imagePath ?? 'no-image'),
      React.createElement('span', { 'data-testid': 'first-tags' }, templates[0]?.tags.join(',') ?? 'no-tags'),
      React.createElement('span', { 'data-testid': 'first-product-path' }, 'productPath' in (templates[0] ?? {}) ? 'has-product-path' : 'no-product-path'),
      React.createElement('span', { 'data-testid': 'error' }, error || 'no-error')
    );
  }

  it('initial state is loading', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent));
    });

    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('loading');

    await act(async () => {
      root.unmount();
    });
  });

  it('fetches templates successfully', async () => {
    const mockData = {
      code: 0,
      message: 'success',
      data: {
        templates: [
          {
            id: 'tpl-001',
            name: '模板1',
            imagePath: '/images/test.png',
            description: '描述1',
            skills: [],
            agents: [],
            tags: ['定时任务'],
          },
        ],
        total: 1,
      },
    };

    mockFetch.mockResolvedValue(createMockResponse(mockData));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('done');
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="first-image"]')?.textContent).toBe('/images/test.png');
    expect(container.querySelector('[data-testid="first-tags"]')?.textContent).toBe('定时任务');
    expect(container.querySelector('[data-testid="first-product-path"]')?.textContent).toBe('no-product-path');

    await act(async () => {
      root.unmount();
    });
  });

  it('sets error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe('Network error');

    await act(async () => {
      root.unmount();
    });
  });

  it('filters by category', async () => {
    const mockData = {
      code: 0,
      message: 'success',
      data: { templates: [], total: 0 },
    };

    mockFetch.mockResolvedValue(createMockResponse(mockData));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { category: '定时任务' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockFetch.mock.calls[0][0]).toMatch(/category=[^&]+/);

    await act(async () => {
      root.unmount();
    });
  });

  it('filters by keyword', async () => {
    const mockData = {
      code: 0,
      message: 'success',
      data: { templates: [], total: 0 },
    };

    mockFetch.mockResolvedValue(createMockResponse(mockData));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { keyword: '测试' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockFetch.mock.calls[0][0]).toMatch(/keyword=[^&]+/);

    await act(async () => {
      root.unmount();
    });
  });

  it('combines category and keyword filters', async () => {
    const mockData = {
      code: 0,
      message: 'success',
      data: { templates: [], total: 0 },
    };

    mockFetch.mockResolvedValue(createMockResponse(mockData));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { category: '精选', keyword: '测试' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/category=[^&]+/);
    expect(calledUrl).toMatch(/keyword=[^&]+/);

    await act(async () => {
      root.unmount();
    });
  });

  it('does not include category param when category is "全部"', async () => {
    const mockData = {
      code: 0,
      message: 'success',
      data: { templates: [], total: 0 },
    };

    mockFetch.mockResolvedValue(createMockResponse(mockData));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { category: '全部' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).not.toContain('category=');

    await act(async () => {
      root.unmount();
    });
  });
});
