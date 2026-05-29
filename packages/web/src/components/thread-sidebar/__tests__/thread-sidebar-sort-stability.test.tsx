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
  API_URL: 'http://localhost:3102',
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockStore: Record<string, unknown> = {
  threads: [],
  currentThreadId: 'thread-1',
  setThreads: vi.fn(),
  setCurrentThread: vi.fn(),
  setCurrentProject: vi.fn(),
  isLoadingThreads: false,
  setLoadingThreads: vi.fn(),
  updateThreadTitle: vi.fn(),
  getThreadState: (threadId: string) => (mockStore.threadStates as Record<string, unknown>)[threadId] ?? {},
  updateThreadPin: vi.fn(),
  updateThreadFavorite: vi.fn(),
  threadStates: {},
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

describe('ThreadSidebar sort stability', () => {
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
    mockStore.currentThreadId = 'thread-1';
    mockStore.threads = [
      {
        id: 'thread-1',
        title: 'Older Thread',
        projectPath: 'default',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 100,
        createdAt: 100,
      },
      {
        id: 'thread-2',
        title: 'Newer Thread',
        projectPath: 'default',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 200,
        createdAt: 200,
      },
    ];
    mockStore.threadStates = {};
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: mockStore.threads });
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
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  function getThreadTexts() {
    return Array.from(container.querySelectorAll('.ui-thread-item')).map((item) => item.textContent ?? '');
  }

  it('keeps sidebar order stable when threadStates changes during rapid thread switching', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await flush();

    const initialOrder = getThreadTexts();
    expect(initialOrder[0]).toContain('Newer Thread');
    expect(initialOrder[1]).toContain('Older Thread');

    mockStore.threadStates = {
      'thread-1': {
        messages: [{ id: 'm1', timestamp: 999999, type: 'user', content: 'temp', threadId: 'thread-1' }],
      },
      'thread-2': {
        messages: [{ id: 'm2', timestamp: 1, type: 'user', content: 'temp', threadId: 'thread-2' }],
      },
    };

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await flush();

    const nextOrder = getThreadTexts();
    expect(nextOrder[0]).toContain('Newer Thread');
    expect(nextOrder[1]).toContain('Older Thread');
  });
});
