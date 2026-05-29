/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RightContentHeaderOverrideProvider,
  useCurrentRightContentHeaderOverride,
} from '@/components/RightContentHeaderOverrideContext';
import { InspirationDetail } from '../components/InspirationDetail';
import type { InspirationTemplateDetail } from '../types';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetPendingChatInsert = vi.hoisted(() => vi.fn());
const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector) =>
    selector({
      currentThreadId: 'thread-1',
      messages: [],
      threadStates: {},
      setPendingChatInsert: mockSetPendingChatInsert,
    }),
  ),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: vi.fn(() => ({ getAgentById: vi.fn(() => null) })),
}));

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3002',
  apiFetch: mockApiFetch,
}));

const mockTemplate: InspirationTemplateDetail = {
  id: 'tpl-001',
  name: '测试模板',
  imagePath: '/images/test.png',
  description: '这是一个测试模板描述',
  prompt: '这是测试提示词',
  skills: [{ id: 'skill-1', name: '技能1', icon: '/icons/skill1.png' }],
  agents: [{ id: 'agent-1', name: '智能体1', catId: 'office', icon: '/icons/agent1.png' }],
  tags: ['定时任务'],
  productPath: null,
  product: null,
};

const mockTemplateWithProducts: InspirationTemplateDetail = {
  id: 'tpl-002',
  name: '带产品的模板',
  imagePath: '/images/test.png',
  description: '带产品预览的模板',
  prompt: '提示词内容',
  skills: [],
  agents: [],
  tags: ['精选', 'HTML'],
  productPath: 'http://example.com/product.html',
  product: {
    id: 'prod-1',
    name: '产品1',
    type: 'html',
    path: 'http://example.com/product.html',
    previewContent: '<html><body>Preview Content</body></html>',
  },
};

function HeaderProbe() {
  const override = useCurrentRightContentHeaderOverride();
  const panelToggle = override?.panelToggle;
  const toggleLabel = panelToggle ? (panelToggle.isOpen ? panelToggle.closeLabel : panelToggle.openLabel) : undefined;

  return (
    <div data-testid="right-content-header-probe">
      {override?.leftContent}
      {panelToggle && (
        <button type="button" aria-label={toggleLabel} onClick={panelToggle.onToggle}>
          toggle
        </button>
      )}
    </div>
  );
}

function DetailHarness({ template, onBack }: { template: InspirationTemplateDetail; onBack: () => void }) {
  return (
    <RightContentHeaderOverrideProvider>
      <HeaderProbe />
      <InspirationDetail template={template} onBack={onBack} />
    </RightContentHeaderOverrideProvider>
  );
}

describe('InspirationDetail', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockNavigate.mockClear();
    mockSetPendingChatInsert.mockClear();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ threads: [] }),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderDetail(template: InspirationTemplateDetail, onBack = vi.fn()) {
    await act(async () => {
      root.render(React.createElement(DetailHarness, { template, onBack }));
    });
    return { onBack };
  }

  it('renders template name in header', async () => {
    await renderDetail(mockTemplate);

    const header = container.querySelector('[data-testid="right-content-header-probe"]');
    expect(header?.textContent).toContain('测试模板');
    expect(header?.querySelector('[data-testid="inspiration-detail-header"]')?.className).toContain('gap-2');
  });

  it('renders back button', async () => {
    const { onBack } = await renderDetail(mockTemplate);

    const backButton = container.querySelector(
      '[data-testid="right-content-header-probe"] button[aria-label="返回灵感广场"]',
    );
    expect(backButton).not.toBeNull();

    act(() => {
      backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders product preview section when template has products', async () => {
    await renderDetail(mockTemplateWithProducts);

    const productSection = container.querySelector('[data-testid="inspiration-preview-pane"]');
    expect(productSection).not.toBeNull();
    expect(container.textContent).toContain('产品1');
  });

  it('keeps a centered preview pane even when template has no products', async () => {
    await renderDetail(mockTemplate);

    const productSection = container.querySelector('[data-testid="inspiration-preview-pane"]');
    expect(productSection).not.toBeNull();
    expect(container.textContent).toContain('暂无产物');
  });

  it('renders description info without the old prompt block', async () => {
    await renderDetail(mockTemplate);

    expect(container.textContent).toContain('这是一个测试模板描述');
    expect(container.textContent).toContain('详细介绍');
    expect(container.textContent).not.toContain('提示词模版');
  });

  it('toggles the info panel from the header control', async () => {
    await renderDetail(mockTemplateWithProducts);

    expect(container.querySelector('[data-testid="inspiration-info-panel"]')).not.toBeNull();

    act(() => {
      container
        .querySelector('[data-testid="right-content-header-probe"]')
        ?.querySelector('button[aria-label="收起信息面板"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="inspiration-info-panel"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="right-content-header-probe"] button[aria-label="展开信息面板"]'),
    ).not.toBeNull();
  });

  it('uses requested split line and content padding only while the info panel is open', async () => {
    await renderDetail(mockTemplateWithProducts);

    const previewPane = container.querySelector('[data-testid="inspiration-preview-pane"]');
    const infoScroll = container.querySelector('[data-testid="inspiration-info-panel"] > div > div');
    expect(previewPane?.className).toContain('p-4');
    expect(previewPane?.className).toContain('border-r');
    expect(previewPane?.className).toContain('border-[#f0f0f0]');
    expect(infoScroll?.className).toContain('px-4');
    expect(infoScroll?.className).toContain('py-6');

    act(() => {
      container
        .querySelector('[data-testid="right-content-header-probe"]')
        ?.querySelector('button[aria-label="收起信息面板"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="inspiration-info-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="inspiration-preview-pane"]')?.className).not.toContain('border-r');
  });

  it('uses inspiration background for scheduled image products', async () => {
    const imageTemplate: InspirationTemplateDetail = {
      ...mockTemplate,
      productPath: '/images/result.png',
      product: { id: 'prod-image', name: '图片产物', type: 'image', path: '/images/result.png' },
    };

    await renderDetail(imageTemplate);

    expect(container.querySelector('[data-testid="inspiration-preview-surface"]')?.className).toContain(
      'bg-[url(/images/inspiration-bg.png)]',
    );
  });
});
