/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspirationInfo } from '../components/InspirationInfo';
import type { InspirationTemplateDetail } from '../types';

// Use vi.hoisted to ensure mock functions are available during hoisting
const mockSetPendingChatInsert = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
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

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}));

// Mock chatStore
vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector) => {
    const state = {
      setPendingChatInsert: mockSetPendingChatInsert,
      pendingChatInsert: null,
    };
    return selector(state);
  }),
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

const mockTemplate: InspirationTemplateDetail = {
  id: 'tpl-001',
  name: '测试模板',
  imagePath: '/images/test.png',
  description: '这是一个测试模板描述',
  prompt: '这是测试提示词内容',
  skills: [
    { id: 'skill-1', name: '技能1' },
    { id: 'skill-2', name: '技能2' },
  ],
  agents: [
    { id: 'agent-1', name: '智能体1', catId: 'office' },
    { id: 'agent-2', name: '智能体2', catId: 'dare' },
  ],
  tags: ['定时任务'],
  productPath: null,
  product: null,
};

const mockTemplateNoSkillsAgents: InspirationTemplateDetail = {
  id: 'tpl-002',
  name: '无技能智能体模板',
  imagePath: '/images/test.png',
  description: '描述',
  prompt: '提示词',
  skills: [],
  agents: [],
  tags: ['精选'],
  productPath: null,
  product: null,
};

describe('InspirationInfo', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    mockSetPendingChatInsert.mockClear();
    mockNavigate.mockClear();
    mockApiFetch.mockReset();
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

  it('renders template name', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).toContain('测试模板');
  });

  it('renders "创建同款" button', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).toContain('创建同款');
  });

  it('does not render the old prompt template block in the detail panel', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).not.toContain('提示词模版');
    expect(container.textContent).not.toContain('这是测试提示词内容');
  });

  it('renders skills section when template has skills', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).toContain('使用的技能');
    expect(container.textContent).toContain('技能1');
    expect(container.textContent).toContain('技能2');
  });

  it('does not render skills section when template has no skills', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplateNoSkillsAgents }));
    });

    expect(container.textContent).not.toContain('使用的技能');
  });

  it('renders agents section when template has agents', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).toContain('使用的智能体');
    expect(container.textContent).toContain('智能体1');
    expect(container.textContent).toContain('智能体2');
  });

  it('does not render agents section when template has no agents', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplateNoSkillsAgents }));
    });

    expect(container.textContent).not.toContain('使用的智能体');
  });

  it('renders skill and agent cards in a single column with the requested detail-panel surface', async () => {
    const templateWithIcons: InspirationTemplateDetail = {
      ...mockTemplate,
      skills: [
        { id: 'lidan-writing-framework', name: '李诞七步写作框架' },
        { id: 'minimax-xlsx', name: 'Excel 专业处理' },
      ],
      agents: [
        { id: 'office', name: '通用助手', catId: 'office', icon: '/avatars/office.svg' },
        { id: 'assistant', name: '逻辑大师', catId: 'assistant', icon: '/avatars/assistant.svg' },
      ],
    };

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: templateWithIcons }));
    });

    const skillList = container.querySelector('[data-testid="inspiration-skill-card-list"]');
    const agentList = container.querySelector('[data-testid="inspiration-agent-card-list"]');
    const skillCard = container.querySelector('[data-testid="inspiration-skill-card-lidan-writing-framework"]');
    const agentCard = container.querySelector('[data-testid="inspiration-agent-card-office"]');
    const agentIcon = container.querySelector('[data-testid="inspiration-agent-card-office-icon"] img');

    expect(skillList?.className).toContain('flex-col');
    expect(agentList?.className).toContain('flex-col');
    expect(skillCard?.className).toContain('w-full');
    expect(skillCard?.className).toContain('rounded-[8px]');
    expect(skillCard?.className).toContain('px-4');
    expect(skillCard?.className).toContain('py-3');
    expect(skillCard).toHaveProperty('style.backgroundColor', 'rgb(250, 250, 250)');
    expect(agentCard?.className).toContain('w-full');
    expect(agentCard?.className).toContain('rounded-[8px]');
    expect(agentCard).toHaveProperty('style.backgroundColor', 'rgb(250, 250, 250)');
    expect(agentIcon?.getAttribute('src')).toBe('/avatars/office.svg');
    expect(agentIcon?.className).toContain('rounded-full');
  });

  it('renders description section', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    expect(container.textContent).toContain('详细介绍');
    expect(container.textContent).toContain('这是一个测试模板描述');
  });

  it('opens the session picker and fills a new session after confirmation', async () => {
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    const buttons = container.querySelectorAll('button');
    const doSameButton = Array.from(buttons).find((b) => b.textContent?.includes('创建同款'));

    await act(async () => {
      doSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('选择会话');
    expect(mockSetPendingChatInsert).not.toHaveBeenCalled();

    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '新建会话')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSetPendingChatInsert).toHaveBeenCalledWith({
      threadId: '__new__',
      text: '[[quick_action:定时任务]]\n这是测试提示词内容',
      inspirationData: {
        prompt: '这是测试提示词内容',
        skills: mockTemplate.skills,
        agents: mockTemplate.agents,
        templateId: 'tpl-001',
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('fills a new session with matching inspiration skill tokens and agent mentions', async () => {
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
    const templateWithResources: InspirationTemplateDetail = {
      ...mockTemplate,
      prompt: '请生成一份知识讲解',
      skills: [
        { id: 'lidan-writing-framework', name: '李诞七步写作框架' },
        { id: 'future-skill', name: '待预置技能' },
      ],
      agents: [
        { id: 'office', name: '通用助手', catId: 'office' },
        { id: 'future-agent', name: '待预置智能体', catId: 'future-agent' },
      ],
    };

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: templateWithResources }));
    });

    const doSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );
    await act(async () => {
      doSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
      text: '[[quick_action:定时任务]] @office [[skill:lidan-writing-framework]]\n请生成一份知识讲解',
      suppressMentionMenu: true,
      mentionRefs: [{ catId: 'office', mention: '@office' }],
      inspirationData: {
        prompt: '请生成一份知识讲解',
        skills: templateWithResources.skills,
        agents: templateWithResources.agents,
        templateId: 'tpl-001',
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('fills an existing selected session with inspiration data', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        threads: [
          {
            id: 'thread-existing',
            title: '已有会话',
            lastActiveAt: Date.now(),
            participants: [],
          },
        ],
      }),
    });

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: mockTemplate }));
    });

    const doSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );

    await act(async () => {
      doSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    act(() => {
      document.body
        .querySelector('[data-testid="session-option-thread-existing"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '确定')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSetPendingChatInsert).toHaveBeenCalledWith({
      threadId: 'thread-existing',
      text: '[[quick_action:定时任务]]\n这是测试提示词内容',
      inspirationData: {
        prompt: '这是测试提示词内容',
        skills: mockTemplate.skills,
        agents: mockTemplate.agents,
        templateId: 'tpl-001',
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/thread/thread-existing');
  });

  it('fills an existing selected session with matching inspiration skill tokens and agent mentions', async () => {
    mockFetchSkillOptionsWithCache.mockResolvedValue([{ name: 'minimax-xlsx' }]);
    mockAgentRows.value = [
      {
        id: 'assistant',
        displayName: '逻辑大师',
        mentionPatterns: ['@assistant', '@逻辑大师'],
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        avatar: '',
        roleDescription: '逻辑大师',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ];
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        threads: [
          {
            id: 'thread-existing',
            title: '已有会话',
            lastActiveAt: Date.now(),
            participants: [],
          },
        ],
      }),
    });
    const templateWithResources: InspirationTemplateDetail = {
      ...mockTemplate,
      prompt: '请分析这个 Excel',
      skills: [{ id: 'minimax-xlsx', name: 'Excel 专业处理' }],
      agents: [{ id: 'assistant', name: '逻辑大师', catId: 'assistant' }],
    };

    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InspirationInfo, { template: templateWithResources }));
    });

    const doSameButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('创建同款'),
    );
    await act(async () => {
      doSameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    act(() => {
      document.body
        .querySelector('[data-testid="session-option-thread-existing"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '确定')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockSetPendingChatInsert).toHaveBeenCalledWith({
      threadId: 'thread-existing',
      text: '[[quick_action:定时任务]] @assistant [[skill:minimax-xlsx]]\n请分析这个 Excel',
      suppressMentionMenu: true,
      mentionRefs: [{ catId: 'assistant', mention: '@assistant' }],
      inspirationData: {
        prompt: '请分析这个 Excel',
        skills: templateWithResources.skills,
        agents: templateWithResources.agents,
        templateId: 'tpl-001',
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/thread/thread-existing');
  });
});
