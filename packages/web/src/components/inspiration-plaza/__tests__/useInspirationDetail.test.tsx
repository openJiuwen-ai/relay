/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInspirationDetail } from '../hooks/useInspirationDetail';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('useInspirationDetail', () => {
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

  function TestComponent({ templateId }: { templateId: string | null }) {
    const { template, isLoading, error } = useInspirationDetail(templateId);
    return React.createElement(
      'div',
      { 'data-testid': 'result' },
      React.createElement('span', { 'data-testid': 'loading' }, isLoading ? 'loading' : 'done'),
      React.createElement('span', { 'data-testid': 'template-name' }, template?.name || 'no-template'),
      React.createElement('span', { 'data-testid': 'product-path' }, template?.productPath ?? 'no-product-path'),
      React.createElement('span', { 'data-testid': 'skill-names' }, template?.skills.map((skill) => skill.name).join('|') ?? ''),
      React.createElement('span', { 'data-testid': 'agent-names' }, template?.agents.map((agent) => agent.name).join('|') ?? ''),
      React.createElement('span', { 'data-testid': 'agent-icons' }, template?.agents.map((agent) => agent.icon ?? '').join('|') ?? ''),
      React.createElement('span', { 'data-testid': 'error' }, error || 'no-error')
    );
  }

  it('initial state is null template and not loading when templateId is null', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: null }));
    });

    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('done');
    expect(container.querySelector('[data-testid="template-name"]')?.textContent).toBe('no-template');

    await act(async () => {
      root.unmount();
    });
  });

  it('initial state is loading when templateId is provided', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-001' }));
    });

    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('loading');

    await act(async () => {
      root.unmount();
    });
  });

  it('fetches template successfully', async () => {
    const mockTemplate = {
      id: 'tpl-001',
      name: '测试模板',
      imagePath: '/images/test.png',
      description: '这是一个测试模板描述',
      prompt: '这是测试提示词',
      skills: [],
      agents: [],
      tags: ['定时任务', 'HTML'],
      productPath: '/files/result.html',
      product: { id: 'prod-1', name: 'HTML产物', type: 'html', path: '/files/result.html' },
    };

    mockFetch.mockResolvedValue(createMockResponse({ data: mockTemplate }));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-001' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('done');
    expect(container.querySelector('[data-testid="template-name"]')?.textContent).toBe('测试模板');
    expect(container.querySelector('[data-testid="product-path"]')?.textContent).toBe('/files/result.html');

    await act(async () => {
      root.unmount();
    });
  });

  it('sets error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-001' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe('Network error');

    await act(async () => {
      root.unmount();
    });
  });

  it('sets error when response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-001' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="error"]')?.textContent).toContain('Failed to fetch template');

    await act(async () => {
      root.unmount();
    });
  });

  it('clears template when templateId changes to null', async () => {
    const mockTemplate = {
      id: 'tpl-001',
      name: '测试模板',
      imagePath: '/images/test.png',
      description: '描述',
      prompt: '提示词',
      skills: [],
      agents: [],
      tags: ['定时任务'],
      productPath: null,
      product: null,
    };

    mockFetch.mockResolvedValue(createMockResponse({ data: mockTemplate }));

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-001' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector('[data-testid="template-name"]')?.textContent).toBe('测试模板');

    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: null }));
    });

    expect(container.querySelector('[data-testid="template-name"]')?.textContent).toBe('no-template');

    await act(async () => {
      root.unmount();
    });
  });

  it('enriches preset skills and agents from detail lookup while preserving missing preset refs', async () => {
    const mockTemplate = {
      id: 'tpl-lookup',
      name: '预置数据模板',
      imagePath: '/images/test.png',
      description: '描述',
      prompt: '提示词',
      skills: [
        { id: 'lidan-writing-framework', name: '旧李诞技能名' },
        { id: 'skill-not-ready', name: '待预置技能' },
      ],
      agents: [
        { id: 'office', name: '旧通用助手', catId: 'office' },
        { id: 'future-agent', name: '待预置智能体', catId: 'future-agent' },
      ],
      tags: ['精选'],
      productPath: null,
      product: null,
    };

    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/inspiration/templates/tpl-lookup')) {
        return Promise.resolve(createMockResponse({ data: mockTemplate }));
      }
      if (url.includes('/api/skills/detail?name=lidan-writing-framework')) {
        return Promise.resolve(createMockResponse({
          id: 'lidan-writing-framework',
          name: 'lidan-writing-framework',
          category: '自媒体',
        }));
      }
      if (url.includes('/api/skills/detail?name=skill-not-ready')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
      }
      if (url.includes('/api/agents')) {
        return Promise.resolve(createMockResponse({
          agents: [
            {
              id: 'office',
              displayName: '通用助手',
              avatar: '/avatars/office.svg',
            },
          ],
        }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(TestComponent, { templateId: 'tpl-lookup' }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const fetchedUrls = mockFetch.mock.calls.map(([url]) => String(url));
    expect(fetchedUrls.some((url) => url.includes('/api/skills/detail?name=lidan-writing-framework'))).toBe(true);
    expect(fetchedUrls.some((url) => url.includes('/api/agents'))).toBe(true);
    expect(container.querySelector('[data-testid="skill-names"]')?.textContent).toBe(
      'lidan-writing-framework|待预置技能',
    );
    expect(container.querySelector('[data-testid="agent-names"]')?.textContent).toBe('通用助手|待预置智能体');
    expect(container.querySelector('[data-testid="agent-icons"]')?.textContent).toBe('/avatars/office.svg|');

    await act(async () => {
      root.unmount();
    });
  });
});
