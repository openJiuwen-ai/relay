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

const now = Date.now();
const recentThread = {
  id: 'recent-thread',
  title: '近一月会话',
  projectPath: '/workspace/a',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: now - 10 * 24 * 60 * 60 * 1000,
  createdAt: now - 12 * 24 * 60 * 60 * 1000,
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};
const threeMonthThread = {
  id: 'three-month-thread',
  title: '近三月会话',
  projectPath: '/workspace/b',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: now - 60 * 24 * 60 * 60 * 1000,
  createdAt: now - 61 * 24 * 60 * 60 * 1000,
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};
const sixMonthThread = {
  id: 'six-month-thread',
  title: '近六月会话',
  projectPath: '/workspace/c',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: now - 150 * 24 * 60 * 60 * 1000,
  createdAt: now - 151 * 24 * 60 * 60 * 1000,
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};
const oldThread = {
  id: 'old-thread',
  title: '超半年会话',
  projectPath: '/workspace/d',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: now - 220 * 24 * 60 * 60 * 1000,
  createdAt: now - 221 * 24 * 60 * 60 * 1000,
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};

let storeThreads = [recentThread, threeMonthThread, sixMonthThread, oldThread];
const mockStore: Record<string, unknown> = {
  get threads() {
    return storeThreads;
  },
  currentThreadId: 'default',
  setThreads: vi.fn((threads: typeof storeThreads) => {
    storeThreads = threads;
  }),
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

describe('ThreadSidebar time filter', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    storeThreads = [recentThread, threeMonthThread, sixMonthThread, oldThread];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: storeThreads });
      return jsonOk({});
    });
    const storage: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
      writable: true,
      configurable: true,
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

  function expectTitles(visible: string[], hidden: string[] = []) {
    for (const title of visible) {
      expect(container.textContent).toContain(title);
    }
    for (const title of hidden) {
      expect(container.textContent).not.toContain(title);
    }
  }

  async function openFilter() {
    const toggle = container.querySelector('[data-testid="thread-filter-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    act(() => {
      toggle?.click();
    });
    await flush();
  }

  async function selectFilter(label: string) {
    const option = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === label) as
      | HTMLButtonElement
      | undefined;
    expect(option).toBeTruthy();
    act(() => {
      option?.click();
    });
    await flush();
  }

  it('applies each time filter immediately and closes the dropdown', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    expectTitles(['近一月会话', '近三月会话', '近六月会话', '超半年会话']);

    await openFilter();
    expect(container.textContent).toContain('会话时间');
    expect(container.textContent).not.toContain('重置');
    expect(container.textContent).not.toContain('确定');

    await selectFilter('近1个月');
    expect(container.textContent).not.toContain('会话时间');
    expect(container.textContent).toContain('近1个月');
    expectTitles(['近一月会话'], ['近三月会话', '近六月会话', '超半年会话']);

    await openFilter();
    await selectFilter('近3个月');
    expect(container.textContent).toContain('近3个月');
    expectTitles(['近一月会话', '近三月会话'], ['近六月会话', '超半年会话']);

    await openFilter();
    await selectFilter('近6个月');
    expect(container.textContent).toContain('近6个月');
    expectTitles(['近一月会话', '近三月会话', '近六月会话'], ['超半年会话']);

    await openFilter();
    await selectFilter('全部');
    expect(container.textContent).toContain('全部');
    expectTitles(['近一月会话', '近三月会话', '近六月会话', '超半年会话']);
  });
});
