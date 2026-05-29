/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspirationPlaza } from '../InspirationPlaza';
import type { InspirationTemplateDetail, InspirationTemplateListItem } from '../types';

const mockTemplates: InspirationTemplateListItem[] = [
  {
    id: 'tpl-001',
    name: '测试模板',
    imagePath: '/images/test.png',
    description: '测试描述',
    skills: [],
    agents: [],
    tags: ['定时任务', 'HTML'],
  },
  {
    id: 'tpl-002',
    name: '文档模板',
    imagePath: '/images/doc.png',
    description: '文档描述',
    skills: [],
    agents: [],
    tags: ['文档处理', '文档'],
  },
];

const mockTemplateDetail: InspirationTemplateDetail = {
  ...mockTemplates[0],
  prompt: '测试提示词',
  productPath: '/products/html.html',
  product: { id: 'prod-html', name: 'HTML产物', type: 'html', path: '/products/html.html' },
};

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

function createMockResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function getTemplateFetchUrls() {
  return mockFetch.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/api/inspiration/templates'));
}

describe('InspirationPlaza', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderPlaza() {
    await act(async () => {
      root.render(React.createElement(InspirationPlaza));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it('removes the legacy page title and renders the total heading when total is positive', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    expect(container.querySelector('.ui-page-title')).toBeNull();
    expect(container.textContent).not.toContain('灵感广场');
    expect(container.querySelector('[data-testid="inspiration-total-heading"]')?.textContent).toBe('全部（2）');
  });

  it('keeps the total heading visible with zero when total is less than 1', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: [], total: 0 },
    }));

    await renderPlaza();

    expect(container.querySelector('[data-testid="inspiration-total-heading"]')?.textContent).toBe('全部（0）');
  });

  it('caps the plaza content at 1920px and centers it on wide screens', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    expect(container.firstElementChild?.className).toContain('max-w-[1920px]');
    expect(container.firstElementChild?.className).toContain('mx-auto');
    expect(container.firstElementChild?.className).toContain('w-full');
  });

  it('renders tabs, type filter, search input, and bordered refresh button with 24px sections', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    const totalHeading = container.querySelector('[data-testid="inspiration-total-heading"]');
    const searchSection = container.querySelector('[data-testid="inspiration-search-section"]');
    const cardSection = container.querySelector('[data-testid="inspiration-card-section"]');
    const typeFilter = container.querySelector('[role="combobox"][aria-label="类型筛选"]') as HTMLButtonElement | null;
    const refreshButton = container.querySelector('[data-testid="inspiration-refresh-button"]') as HTMLButtonElement | null;

    expect(container.querySelector('[data-testid="inspiration-tabs-section"]')).not.toBeNull();
    expect(totalHeading?.className).toContain('mt-6');
    expect(searchSection?.className).toContain('mt-6');
    expect(cardSection?.className).toContain('mt-6');
    expect(container.querySelector('select[aria-label="类型筛选"]')).toBeNull();
    expect(typeFilter?.textContent).toContain('全部类型');
    expect(container.innerHTML).toContain('搜索灵感');
    expect(refreshButton).not.toBeNull();
    expect(refreshButton?.style.borderWidth).toBe('1px');
    expect(refreshButton?.querySelector('img')?.getAttribute('src')).toBe('/icons/icon-refresh.svg');

    await act(async () => {
      typeFilter?.click();
    });

    expect(Array.from(document.body.querySelectorAll('[role="option"]')).map((option) => option.textContent)).toEqual([
      '全部类型',
      'HTML',
      '文档',
      '表格',
      'Markdown',
      '图片',
    ]);
  });

  it('refetches templates when the refresh button is clicked', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    const initialTemplateFetchCount = getTemplateFetchUrls().length;
    const refreshButton = container.querySelector('[data-testid="inspiration-refresh-button"]') as HTMLButtonElement;
    await act(async () => {
      refreshButton.click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getTemplateFetchUrls()).toHaveLength(initialTemplateFetchCount + 1);
  });

  it('requests the selected product type when the type filter changes', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    const typeFilter = container.querySelector('[role="combobox"][aria-label="类型筛选"]') as HTMLButtonElement;
    await act(async () => {
      typeFilter.click();
    });

    const wordOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (option) => option.textContent === '文档',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      wordOption?.click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const templateFetchUrls = getTemplateFetchUrls();
    expect(templateFetchUrls[templateFetchUrls.length - 1]).toContain('productType=word');
  });

  it('renders template cards when data is loaded', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      code: 0,
      message: 'success',
      data: { templates: mockTemplates, total: 2 },
    }));

    await renderPlaza();

    expect(container.textContent).toContain('测试模板');
    expect(container.textContent).toContain('文档模板');
  });

  it('fetches detail data with product path when a list card is opened', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/inspiration/templates/tpl-001')) {
        return Promise.resolve(createMockResponse({
          code: 0,
          message: 'success',
          data: mockTemplateDetail,
        }));
      }
      return Promise.resolve(createMockResponse({
        code: 0,
        message: 'success',
        data: { templates: mockTemplates, total: 2 },
      }));
    });

    await renderPlaza();

    await act(async () => {
      container.querySelector('[data-testid="inspiration-card"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(getTemplateFetchUrls().some((url) => url.includes('/api/inspiration/templates/tpl-001'))).toBe(true);
    expect(container.textContent).toContain('HTML产物');
  });
});
