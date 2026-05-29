/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityTab } from '@/components/skills-panel/components/CapabilityTab';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/utils/skill-options-cache', () => ({ notifySkillOptionsChanged: vi.fn() }));
const mockConfirm = vi.fn(() => Promise.resolve(true));
vi.mock('@/components/useConfirm', () => ({
  useConfirm: () => mockConfirm,
}));
vi.mock('@/components/useProviderProfilesState', () => ({
  useProviderProfilesState: () => ({ providerCreateSectionProps: {} }),
}));
vi.mock('@/components/hub-provider-profiles.sections', () => ({
  CreateApiKeyProfileSection: () => React.createElement('div', { 'data-testid': 'provider-create-section' }),
}));
vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: { threads: Array<{ projectPath?: string }> }) => unknown) => {
    const state = { threads: [{ projectPath: 'project-a' }, { projectPath: 'project-b' }] };
    return selector ? selector(state) : state;
  },
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockNotifySkillOptionsChanged = vi.mocked(notifySkillOptionsChanged);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.trim() === text);
  expect(button).not.toBeUndefined();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('business theme hub shell', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useToastStore.setState({ toasts: [] });
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            agentFamilies: [{ id: 'ops', name: 'Ops', agentIds: ['office'] }],
            items: [
              {
                id: 'ops-skill',
                type: 'skill',
                source: 'builtin',
                enabled: true,
                agents: { office: true },
                description: 'automation helper',
                triggers: ['ops'],
                category: 'Automation',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
              {
                id: 'doc-skill',
                type: 'skill',
                source: 'external',
                enabled: true,
                agents: { office: true },
                description: 'document helper',
                triggers: ['doc'],
                category: 'Knowledge',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
            ],
            skillHealth: {
              allMounted: true,
              registrationConsistent: true,
              unregistered: [],
              phantom: [],
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
    mockNotifySkillOptionsChanged.mockReset();
    mockConfirm.mockReset();
    mockConfirm.mockResolvedValue(true);
    useToastStore.setState({ toasts: [] });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders CapabilityTab capability cards without project selector', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    expect(container.querySelector('select[aria-label="项目"]')).toBeNull();
    expect(container.querySelector('select[aria-label="筛选分类"]')).not.toBeNull();
    expect(container.textContent).not.toContain('项目:');
    expect(container.querySelector('[data-testid="capability-card-skill-ops-skill"]')?.className).toContain('ui-card');
    expect(container.querySelector('[data-testid="capability-card-skill-ops-skill"]')?.className).toContain('ui-card-hover');
    expect(container.textContent).toContain('来源：内置技能');
  });

  it('shows a centered loading icon instead of loading text while installed skills are loading', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(CapabilityTab));
      await Promise.resolve();
    });

    const loadingState = container.querySelector('[data-testid="skills-loading-state"]');
    expect(loadingState).not.toBeNull();
    expect(loadingState?.className).toContain('items-center');
    expect(loadingState?.className).toContain('justify-center');
    expect(loadingState?.querySelector('img')).not.toBeNull();
    expect(container.textContent).not.toContain('加载中...');
  });

  it('uses the shared empty-data state when installed skills are empty', async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            agentFamilies: [],
            items: [],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const emptyState = container.querySelector('[data-testid="empty-data-state"]') as HTMLDivElement | null;
    expect(emptyState).not.toBeNull();
    expect(emptyState?.querySelector('[data-testid="empty-data-image"]')).not.toBeNull();
    expect(emptyState?.textContent).toContain('暂无数据');
    expect(container.querySelector('[data-testid="hub-capability-scroll-region"]')).toBeNull();
    const emptyShell = emptyState?.parentElement as HTMLDivElement | null;
    expect(emptyShell?.className).toContain('flex-1');
    expect(emptyShell?.className).toContain('items-center');
    expect(emptyShell?.className).toContain('justify-center');
    expect(container.querySelector('[data-testid="no-search-results-state"]')).toBeNull();
  });

  it('renders search input under title and filters installed skills', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('ops-skill');
    expect(container.textContent).toContain('doc-skill');

    await changeInputValue(searchInput!, 'doc');

    expect(container.textContent).toContain('doc-skill');
    expect(container.textContent).not.toContain('ops-skill');
  });

  it('updates installed skills title count to match visible search results', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('全部 (2)');

    await changeInputValue(searchInput!, 'no-such-skill');

    expect(container.textContent).toContain('全部 (0)');
    expect(container.textContent).not.toContain('全部 (2)');
  });

  it('clears the installed skills search input when switching source tabs', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'doc');
    expect(searchInput?.value).toBe('doc');

    await clickButtonByText(container, '我添加的');

    expect(searchInput?.value).toBe('');
    expect(container.textContent).toContain('doc-skill');
  });

  it('renders optional import action beside installed skills search', async () => {
    const onImport = vi.fn();
    await act(async () => {
      root.render(React.createElement(CapabilityTab, { onImport }));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('导入'));
    expect(searchInput).not.toBeNull();
    expect(importButton?.className).toContain('uiButtonMajor');
    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('keeps filter controls visible and shows empty state when search has no matches', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'no-such-skill');

    expect(container.querySelector('select[aria-label="筛选分类"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="搜索我的技能"]')).not.toBeNull();
    expect(container.textContent).toContain('暂未匹配到数据');
    expect(container.textContent).toContain('没有匹配到符合条件的数据');
    expect(container.querySelector('[data-testid="no-search-results-clear"]')).not.toBeNull();
    expect(container.textContent).not.toContain('ops-skill');
    expect(container.textContent).not.toContain('doc-skill');
  });

  it('clearing empty search state resets category within the current source tab', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const categorySelect = container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null;
    expect(categorySelect).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(categorySelect, 'Automation');
      categorySelect?.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'no-such-skill');

    const clearButton = container.querySelector('[data-testid="no-search-results-clear"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();

    await act(async () => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect((container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null)?.value).toBe('');
    expect((container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null)?.value).toBe('全部');
    expect(container.textContent).toContain('全部 (2)');
    expect(container.textContent).toContain('ops-skill');
    expect(container.textContent).toContain('doc-skill');
  });

  it('keeps search controls outside the card region', async () => {
    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    const fixedHeader = container.querySelector('[data-testid="hub-capability-fixed-header"]') as HTMLDivElement | null;
    const scrollRegion = container.querySelector('[data-testid="hub-capability-scroll-region"]') as HTMLDivElement | null;
    const searchInput = container.querySelector('input[aria-label="搜索我的技能"]') as HTMLInputElement | null;

    expect(fixedHeader).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.className).toContain('overflow-y-auto');
    expect(scrollRegion?.contains(searchInput)).toBe(false);
    expect(scrollRegion?.querySelector('[data-testid="capability-card-skill-ops-skill"]')).not.toBeNull();
  });

  it('passes skill avatar selection context when opening detail from a skill card', async () => {
    const onSelectSkill = vi.fn();

    await act(async () => {
      root.render(React.createElement(CapabilityTab, { onSelectSkill }));
    });
    await flushEffects();

    const card = container.querySelector('[data-testid="capability-card-skill-ops-skill"]') as HTMLDivElement | null;
    expect(card).not.toBeNull();

    await act(async () => {
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSelectSkill).toHaveBeenCalledWith({
      skillName: 'ops-skill',
      avatarUrl: null,
    });
  });

  it('uses default confirm styling for uninstalling external skills', async () => {
    mockConfirm.mockResolvedValue(false);

    await act(async () => {
      root.render(React.createElement(CapabilityTab));
    });
    await flushEffects();

    await clickButtonByText(container, '我添加的');

    const uninstallButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '卸载',
    );
    expect(uninstallButton).not.toBeUndefined();

    await act(async () => {
      uninstallButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith({
      title: '卸载技能',
      message: '确定要卸载 “doc-skill” 吗？此操作不可恢复。',
      confirmLabel: '卸载',
      cancelLabel: '取消',
      variant: 'default',
    });
  });

  it('shows a global success toast after uninstalling a user-added skill', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            agentFamilies: [{ id: 'ops', name: 'Ops', agentIds: ['office'] }],
            items: [
              {
                id: 'ops-skill',
                type: 'skill',
                source: 'builtin',
                enabled: true,
                agents: { office: true },
                description: 'automation helper',
                triggers: ['ops'],
                category: 'Automation',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
              {
                id: 'doc-skill',
                type: 'skill',
                source: 'external',
                enabled: true,
                agents: { office: true },
                description: 'document helper',
                triggers: ['doc'],
                category: 'Knowledge',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
            ],
            skillHealth: {
              allMounted: true,
              registrationConsistent: true,
              unregistered: [],
              phantom: [],
            },
          }),
        );
      }
      if (url === '/api/skills/uninstall' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(CapabilityTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    await clickButtonByText(container, '我添加的');

    const uninstallButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '卸载',
    );
    expect(uninstallButton).not.toBeUndefined();

    await act(async () => {
      uninstallButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const toasts = useToastStore.getState().toasts;
    expect(
      toasts.some((toast) => toast.type === 'success' && toast.title === '卸载成功' && toast.message.includes('doc-skill')),
    ).toBe(true);
    expect(mockNotifySkillOptionsChanged).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.fixed')?.textContent).toContain('卸载成功');
  });

  it('shows a global error toast when uninstalling a user-added skill fails', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/capabilities?')) {
        return Promise.resolve(
          jsonResponse({
            projectPath: 'project-a',
            agentFamilies: [{ id: 'ops', name: 'Ops', agentIds: ['office'] }],
            items: [
              {
                id: 'doc-skill',
                type: 'skill',
                source: 'external',
                enabled: true,
                agents: { office: true },
                description: 'document helper',
                triggers: ['doc'],
                category: 'Knowledge',
                mounts: { codex: true },
                connectionStatus: 'connected',
              },
            ],
            skillHealth: {
              allMounted: true,
              registrationConsistent: true,
              unregistered: [],
              phantom: [],
            },
          }),
        );
      }
      if (url === '/api/skills/uninstall' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ error: '权限不足' }, 500));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(CapabilityTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();

    await clickButtonByText(container, '我添加的');

    const uninstallButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '卸载',
    );
    expect(uninstallButton).not.toBeUndefined();

    await act(async () => {
      uninstallButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const toasts = useToastStore.getState().toasts;
    expect(
      toasts.some((toast) => toast.type === 'error' && toast.title === '卸载失败' && toast.message.includes('权限不足')),
    ).toBe(true);
    expect(mockNotifySkillOptionsChanged).not.toHaveBeenCalled();
    expect(document.body.querySelector('.fixed')?.textContent).toContain('卸载失败');
  });

  describe('skill source tabs and category dropdown', () => {
    it('shows fixed source tabs and category options for the active tab', async () => {
      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      expect(container.textContent).toContain('平台精选');
      expect(container.textContent).toContain('我添加的');
      expect(container.textContent).toContain('全部');

      const categorySelect = container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null;
      expect(categorySelect).not.toBeNull();
      expect(Array.from(categorySelect?.options ?? []).map((opt) => opt.value)).toEqual(['全部', 'Automation', 'Knowledge']);
    });

    it('switches to user-added skills from the source tab', async () => {
      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      expect(container.textContent).toContain('ops-skill');
      expect(container.textContent).toContain('doc-skill');

      await clickButtonByText(container, '我添加的');

      expect(container.textContent).not.toContain('ops-skill');
      expect(container.textContent).toContain('doc-skill');
      expect(container.textContent).toContain('我添加的 (1)');
      const categorySelect = container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null;
      expect(Array.from(categorySelect?.options ?? []).map((opt) => opt.value)).toEqual(['全部', 'Automation', 'Knowledge']);
    });

    it('shows platform tab even when only builtin skills exist', async () => {
      mockApiFetch.mockImplementationOnce((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/capabilities?')) {
          return Promise.resolve(
            jsonResponse({
              projectPath: 'project-a',
              agentFamilies: [{ id: 'ops', name: 'Ops', agentIds: ['office'] }],
              items: [
                {
                  id: 'builtin-only-skill',
                  type: 'skill',
                  source: 'builtin',
                  enabled: true,
                  agents: { office: true },
                  description: 'builtin skill only',
                  category: 'Automation',
                },
              ],
              skillHealth: {
                allMounted: true,
                registrationConsistent: true,
                unregistered: [],
                phantom: [],
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      });

      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      expect(container.textContent).toContain('全部 (1)');
      await clickButtonByText(container, '平台精选');
      expect(container.textContent).toContain('平台精选 (1)');
      expect(container.textContent).toContain('builtin-only-skill');
    });

    it('shows user-added tab even when only external skills exist', async () => {
      mockApiFetch.mockImplementationOnce((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/capabilities?')) {
          return Promise.resolve(
            jsonResponse({
              projectPath: 'project-a',
              agentFamilies: [{ id: 'ops', name: 'Ops', agentIds: ['office'] }],
              items: [
                {
                  id: 'external-only-skill',
                  type: 'skill',
                  source: 'external',
                  enabled: true,
                  agents: { office: true },
                  description: 'external skill only',
                  category: 'Knowledge',
                },
              ],
              skillHealth: {
                allMounted: true,
                registrationConsistent: true,
                unregistered: [],
                phantom: [],
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({}));
      });

      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      expect(container.textContent).toContain('全部 (1)');
      await clickButtonByText(container, '平台精选');
      expect(container.textContent).toContain('平台精选 (0)');
      await clickButtonByText(container, '我添加的');
      expect(container.textContent).toContain('我添加的 (1)');
      expect(container.textContent).toContain('external-only-skill');
    });

    it('displays correct labels for category options in dropdown menu', async () => {
      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      const dropdownButton = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement | null;
      expect(dropdownButton).not.toBeNull();

      await act(async () => {
        dropdownButton?.click();
        await Promise.resolve();
      });

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();

      const optionButtons = Array.from(listbox?.querySelectorAll('button[role="option"]') ?? []);
      const labels = optionButtons.map((btn) => btn.textContent?.trim());

      expect(labels).toContain('全部');
      expect(labels).toContain('Automation');
      expect(labels).toContain('Knowledge');
    });

    it('filters platform skills by category', async () => {
      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      expect(container.textContent).toContain('ops-skill');
      expect(container.textContent).toContain('doc-skill');

      const categorySelect = container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null;

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(categorySelect, 'Automation');
        categorySelect?.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });

      expect(container.textContent).toContain('ops-skill');
      expect(container.textContent).not.toContain('doc-skill');
    });

    it('filters user-added skills by category', async () => {
      await act(async () => {
        root.render(React.createElement(CapabilityTab));
      });
      await flushEffects();

      await clickButtonByText(container, '我添加的');
      const categorySelect = container.querySelector('select[aria-label="筛选分类"]') as HTMLSelectElement | null;

      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(categorySelect, 'Knowledge');
        categorySelect?.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
      });

      expect(container.textContent).not.toContain('ops-skill');
      expect(container.textContent).toContain('doc-skill');
    });
  });
});
