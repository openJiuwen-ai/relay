/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';

const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const thread = {
  id: 'thread-1',
  title: '天气会话',
  projectPath: '/workspace/a',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: Date.now(),
  createdAt: Date.now(),
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};

const mockStore: Record<string, unknown> = {
  threads: [thread],
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
};

vi.mock('@/stores/chatStore', () => {
  const hook = Object.assign(
    (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
    { getState: () => mockStore },
  );
  return { useChatStore: hook };
});

vi.mock('../UserProfile', () => ({ UserProfile: () => null }));
vi.mock('../DirectoryPickerModal', () => ({
  DirectoryPickerModal: () => null,
}));

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}

describe('ThreadSidebar search empty state', () => {
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
    mockApiFetch.mockReset();
    mockStore.threads = [thread];
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: [thread] });
      return jsonOk({});
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function typeInto(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('clears no-results search state when clicking new chat in empty state', async () => {
    const onNewChatClick = vi.fn();

    act(() => {
      root.render(React.createElement(ThreadSidebar, { onNewChatClick }));
    });
    await flush();

    const searchToggle = container.querySelector('[data-testid="thread-search-toggle"]') as HTMLButtonElement | null;
    expect(searchToggle).toBeTruthy();
    act(() => {
      searchToggle?.click();
    });
    await flush();

    const searchInput = container.querySelector('input[placeholder="搜索会话"]') as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();
    act(() => {
      typeInto(searchInput!, '不存在的会话');
    });
    await flush();

    expect(container.textContent).toContain('没有结果');

    const newChatButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '新建会话',
    ) as HTMLButtonElement | undefined;
    expect(newChatButton).toBeTruthy();

    act(() => {
      newChatButton?.click();
    });
    await flush();

    expect(onNewChatClick).toHaveBeenCalled();
    expect(container.textContent).not.toContain('没有结果');
    expect(container.querySelector('input[placeholder="搜索会话"]')).toBeNull();
    expect(container.textContent).toContain('天气会话');
  });
});
