/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';


vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost',
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ threads: [] }) })),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    getAgentById: () => undefined,
  }),
}));

const mockThreads = [
  {
    id: 'thread-1',
    title: 'Thread One',
    projectPath: 'default',
    createdBy: 'user-1',
    participants: [],
    lastActiveAt: 200,
    createdAt: 100,
  },
];

const mockStore: Record<string, unknown> = {
  threads: mockThreads,
  currentThreadId: 'default',
  setThreads: vi.fn(),
  setCurrentThread: vi.fn(),
  setCurrentProject: vi.fn(),
  isLoadingThreads: false,
  setLoadingThreads: vi.fn(),
  updateThreadTitle: vi.fn(),
  getThreadState: () => ({ agentStatuses: {}, unreadCount: 0 }),
  updateThreadPin: vi.fn(),
  updateThreadFavorite: vi.fn(),
  updateThreadPreferredAgents: vi.fn(),
  threadStates: {},
  clearAllUnread: vi.fn(),
  initThreadUnread: vi.fn(),
  rightPanelMode: 'status',
};

vi.mock('@/stores/chatStore', () => {
  const hook = Object.assign(
    (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
    { getState: () => mockStore },
  );
  return { useChatStore: hook };
});

vi.mock('../UserProfile', () => ({
  UserProfile: ({ collapsed }: { collapsed?: boolean }) =>
    React.createElement('div', { 'data-testid': 'user-profile-stub', 'data-collapsed': collapsed ? 'true' : 'false' }),
}));

vi.mock('../DirectoryPickerModal', () => ({
  DirectoryPickerModal: () => null,
}));



vi.mock('../ThreadItem', () => ({
  ThreadItem: ({ title, iconOnly }: { title: string | null; iconOnly?: boolean }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'thread-item-stub',
        'data-icon-only': iconOnly ? 'true' : 'false',
      },
      iconOnly ? 'thread-icon' : title,
    ),
}));

describe('ThreadSidebar responsive collapse', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalInnerWidth: number;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalInnerWidth = window.innerWidth;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockStore.rightPanelMode = 'status';
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderAt(width: number) {
    Object.defineProperty(window, 'innerWidth', { value: width, writable: true });
    await act(async () => {
      root.render(React.createElement(ThreadSidebar));
    });
  }

  it('defaults collapsed at 1280px and expanded above 1280px', async () => {
    await renderAt(1280);

    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('w-12');
    expect(container.textContent).not.toContain('OfficeClaw');
    expect(container.querySelector('img[alt="OfficeClaw"]')).toBeNull();
    expect(container.querySelector('[aria-label="展开侧边栏"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="wechat-group-invite"]')).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    await renderAt(1281);

    expect(container.querySelector('aside')?.className).toContain('w-[256px]');
    expect(container.textContent).toContain('OfficeClaw');
    expect(container.querySelector('[aria-label="收起侧边栏"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="wechat-group-invite"]')).not.toBeNull();
  });

  it('defaults collapsed at 1920px when PPT preview is active', async () => {
    mockStore.rightPanelMode = 'pptStudio';
    await renderAt(1920);

    expect(container.querySelector('aside')?.className).toContain('w-12');

    act(() => root.unmount());
    root = createRoot(container);
    await renderAt(1921);

    expect(container.querySelector('aside')?.className).toContain('w-[256px]');
  });

  it('keeps the manual toggle state when crossing the breakpoint', async () => {
    await renderAt(1281);

    act(() => {
      (container.querySelector('[aria-label="收起侧边栏"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('aside')?.className).toContain('w-12');

    Object.defineProperty(window, 'innerWidth', { value: 1400, writable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(container.querySelector('aside')?.className).toContain('w-12');

    act(() => {
      (container.querySelector('[aria-label="展开侧边栏"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('aside')?.className).toContain('w-[256px]');

    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(container.querySelector('aside')?.className).toContain('w-[256px]');

    Object.defineProperty(window, 'innerWidth', { value: 1281, writable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(container.querySelector('aside')?.className).toContain('w-[256px]');
  });

  it('renders icon-only menu and right tooltips while collapsed', async () => {
    vi.useFakeTimers();
    await renderAt(1280);

    const newChatButton = container.querySelector('[data-testid="sidebar-new-chat"]') as HTMLButtonElement | null;
    const expandButton = container.querySelector('[aria-label="展开侧边栏"]') as HTMLButtonElement | null;
    const threadItem = container.querySelector('[data-testid="thread-item-stub"]') as HTMLButtonElement | null;

    expect(newChatButton?.className).toContain('justify-center');
    expect(newChatButton?.querySelector('span')?.className).toContain('sr-only');
    expect(newChatButton?.getAttribute('title')).toBeNull();
    expect(expandButton?.getAttribute('title')).toBeNull();
    expect(container.textContent).not.toContain('会话消息');
    expect(threadItem?.getAttribute('data-icon-only')).toBe('true');

    await act(async () => {
      newChatButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.dataset.placement).toBe('right');
    expect(tooltip?.textContent).toContain('新建会话');
    vi.useRealTimers();
  });

  it('uses final expanded layout immediately and fades labels in shortly after expanding', async () => {
    vi.useFakeTimers();
    await renderAt(1280);

    act(() => {
      (container.querySelector('[aria-label="展开侧边栏"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('aside')?.className).toContain('w-[256px]');
    expect(container.querySelector('[data-testid="sidebar-new-chat"]')?.className).toContain('w-full');
    expect(container.querySelector('[data-testid="sidebar-new-chat"] span')?.className).toContain('opacity-0');

    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(container.textContent).toContain('OfficeClaw');
    expect(container.querySelector('[data-testid="sidebar-new-chat"] span')?.className).not.toContain('sr-only');
  });
});
