/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspirationCard } from '../components/InspirationCard';
import type { InspirationTemplateListItem } from '../types';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetPendingChatInsert = vi.hoisted(() => vi.fn());
const mockApiFetch = vi.hoisted(() => vi.fn());
const mockFetchSkillOptionsWithCache = vi.hoisted(() => vi.fn());
interface MockAgentRow {
  id: string;
  displayName: string;
  mentionPatterns: string[];
  color: { primary: string; secondary: string };
  avatar: string;
  roleDescription: string;
  provider: string;
  defaultModel: string;
  source: string;
  roster: null;
}

const mockAgentRows = vi.hoisted(() => ({ value: [] as MockAgentRow[] }));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector) => selector({ setPendingChatInsert: mockSetPendingChatInsert })),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: vi.fn(() => ({
    agents: mockAgentRows.value,
    getAgentById: vi.fn((id: string) => mockAgentRows.value.find((agent) => agent.id === id) ?? null),
  })),
}));

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3002',
  apiFetch: mockApiFetch,
}));

vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: mockFetchSkillOptionsWithCache,
}));

const mockTemplate: InspirationTemplateListItem = {
  id: 'tpl-001',
  name: '测试模板',
  imagePath: '/images/test.png',
  description: '这是一个测试用的模板描述',
  skills: [{ id: 'skill-1', name: '测试技能' }],
  agents: [{ id: 'agent-1', name: '测试智能体', catId: 'office' }],
  tags: ['定时任务', '健康管理'],
};

describe('InspirationCard', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClick = vi.fn();

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onClick.mockClear();
    mockNavigate.mockClear();
    mockSetPendingChatInsert.mockClear();
    mockFetchSkillOptionsWithCache.mockReset();
    mockFetchSkillOptionsWithCache.mockResolvedValue([]);
    mockAgentRows.value = [];
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

  it('renders template name, description, and tags in the card info area', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    expect(container.textContent).toContain('测试模板');
    expect(container.textContent).toContain('这是一个测试用的模板描述');
    expect(container.textContent).toContain('定时任务');
    expect(container.textContent).toContain('健康管理');
    expect(container.textContent).not.toContain('这是一个测试模板的标题');
  });

  it('calls onClick when card is clicked', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const card = container.querySelector('.cursor-pointer');
    act(() => {
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClick).toHaveBeenCalledWith(mockTemplate);
  });

  it('uses the refactored card structure and spacing tokens', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const card = container.querySelector('[data-testid="inspiration-card"]');
    expect(card?.className).toContain('w-full');
    expect(card?.className).toContain('max-w-[490px]');
    expect(card?.className).toContain('rounded-2xl');
    expect(card?.className).toContain('border-[#E6E6E6]');
    expect(card?.className).toContain('hover:shadow-');
    expect(card?.className).not.toContain('ui-card');
    expect(card?.className).not.toContain('translate');
    expect(card?.className).not.toContain('p-');

    const preview = container.querySelector('[data-testid="inspiration-card-preview"]');
    expect(preview?.className).toContain('h-[136px]');
    const previewImage = preview?.querySelector('img');
    expect(previewImage?.getAttribute('src')).toBe(mockTemplate.imagePath);
    expect(previewImage?.className).toContain('w-full');

    const content = container.querySelector('[data-testid="inspiration-card-content"]');
    expect(content?.className).toContain('p-4');
    expect(content?.className).not.toContain('gap-4');

    const title = container.querySelector('[data-testid="inspiration-card-title"]');
    expect(title?.className).toContain('mb-1');

    const description = container.querySelector('[data-testid="inspiration-card-description"]');
    expect(description?.className).toContain('mb-3');
    expect(description?.className).toContain('line-clamp-2');

    expect(container.querySelector('[data-testid="inspiration-card-text-preview"]')).toBeNull();
  });

  it('renders template tags with the shared compact tag style', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const tag = container.querySelector('[data-testid="inspiration-card-tag"]');
    expect(tag?.textContent).toContain('定时任务');
    expect(tag?.className).toContain('rounded-[2px]');
    expect(tag?.className).toContain('px-1');
  });

  it('uses a componentized 14px create-same text button on hover', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const createSameButton = container.querySelector('[data-testid="inspiration-create-same-button"]');
    expect(createSameButton?.textContent).toContain('创建同款');
    expect(createSameButton?.className).toContain('text-sm');
    expect(createSameButton?.className).toContain('text-[#1476FF]');
  });

  it('opens create-same dialog without entering detail when create-same is clicked', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const createSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );

    await act(async () => {
      createSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onClick).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('选择会话');
  });

  it('fetches detail data before creating the same flow from a list item', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/inspiration/templates/tpl-001')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 0,
            message: 'success',
            data: {
              ...mockTemplate,
              prompt: '这是一条测试提示词',
              productPath: null,
              product: null,
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ threads: [] }),
      });
    });

    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const createSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );

    await act(async () => {
      createSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '新建会话')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/inspiration/templates/tpl-001');
    expect(mockSetPendingChatInsert).toHaveBeenCalledWith({
      threadId: '__new__',
      text: '[[quick_action:定时任务]]\n这是一条测试提示词',
      inspirationData: {
        prompt: '这是一条测试提示词',
        skills: mockTemplate.skills,
        agents: mockTemplate.agents,
        templateId: 'tpl-001',
      },
    });
  });

  it('adds matching skill tokens and agent mentions when creating same from a list card', async () => {
    mockFetchSkillOptionsWithCache.mockResolvedValue([{ name: 'lidan-writing-framework' }]);
    mockAgentRows.value = [
      {
        id: 'office',
        displayName: '通用助手',
        mentionPatterns: ['@office'],
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        avatar: '',
        roleDescription: '通用助手',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    const detailSkills = [
      { id: 'lidan-writing-framework', name: '李诞七步写作框架' },
      { id: 'future-skill', name: '待预置技能' },
    ];
    const detailAgents = [
      { id: 'office', name: '通用助手', catId: 'office' },
      { id: 'future-agent', name: '待预置智能体', catId: 'future-agent' },
    ];

    mockApiFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/inspiration/templates/tpl-001')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            code: 0,
            message: 'success',
            data: {
              ...mockTemplate,
              prompt: '这是一条测试提示词',
              skills: detailSkills,
              agents: detailAgents,
              productPath: null,
              product: null,
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ threads: [] }),
      });
    });

    await act(async () => {
      root.render(React.createElement(InspirationCard, { template: mockTemplate, onClick }));
    });

    const createSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );
    await act(async () => {
      createSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '新建会话')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSetPendingChatInsert).toHaveBeenCalledWith({
      threadId: '__new__',
      text: '[[quick_action:定时任务]] @office [[skill:lidan-writing-framework]]\n这是一条测试提示词',
      suppressMentionMenu: true,
      mentionRefs: [{ catId: 'office', mention: '@office' }],
      inspirationData: {
        prompt: '这是一条测试提示词',
        skills: detailSkills,
        agents: detailAgents,
        templateId: 'tpl-001',
      },
    });
  });
});
