/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';
import { vitestRouter } from '@/vitest-router-mock';
const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    getAgentById: () => undefined,
  }),
}));

const mockStore: Record<string, unknown> = {
  threads: [],
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

describe('ThreadSidebar mobile auto-close', () => {
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
    window.sessionStorage.removeItem('office-claw:sidebar-scroll:v1');
    mockApiFetch.mockReset();
    mockStore.threads = [];
    mockStore.currentThreadId = 'thread-1';
    mockStore.setCurrentThread = vi.fn();
    mockStore.setCurrentProject = vi.fn();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: [] });
      return jsonOk({});
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
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

  function mockScrollable(el: HTMLDivElement, scrollHeight: number, clientHeight: number) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  }

  it('calls onClose after pressing new chat on mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

    const onClose = vi.fn();
    act(() => {
      root.render(React.createElement(ThreadSidebar, { onClose }));
    });
    await flush();

    const newBtn = container.querySelector('[data-testid="sidebar-new-chat"]');
    expect(newBtn).toBeTruthy();
    act(() => {
      (newBtn as HTMLButtonElement).click();
    });
    await flush();

    expect(vitestRouter.navigate).toHaveBeenCalledWith('/', { preventScrollReset: true });
    expect(mockStore.setCurrentThread).toHaveBeenCalledWith('default');
    expect(mockStore.setCurrentProject).toHaveBeenCalledWith('default');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose after pressing new chat on desktop viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

    const onClose = vi.fn();
    act(() => {
      root.render(React.createElement(ThreadSidebar, { onClose }));
    });
    await flush();

    const newBtn = container.querySelector('[data-testid="sidebar-new-chat"]');
    expect(newBtn).toBeTruthy();
    act(() => {
      (newBtn as HTMLButtonElement).click();
    });
    await flush();

    expect(vitestRouter.navigate).toHaveBeenCalledWith('/', { preventScrollReset: true });
    expect(mockStore.setCurrentThread).toHaveBeenCalledWith('default');
    expect(mockStore.setCurrentProject).toHaveBeenCalledWith('default');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses shared menu item classes for active and inactive sidebar actions', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    mockStore.currentThreadId = 'default';

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const newChatButton = container.querySelector('[data-testid="sidebar-new-chat"]');
    const modelsButton = container.querySelector('[data-testid="sidebar-menu-models"]');
    const agentsButton = container.querySelector('[data-testid="sidebar-menu-agents"]');

    expect(newChatButton).toBeTruthy();
    expect(newChatButton?.className).toContain('ui-menu-item');
    expect(newChatButton?.className).toContain('ui-menu-item-active');
    expect(modelsButton).toBeTruthy();
    expect(modelsButton?.className).toContain('ui-menu-item');
    expect(modelsButton?.className).toContain('ui-menu-item-inactive');
    expect(agentsButton).toBeTruthy();
    expect(agentsButton?.className).toContain('ui-menu-item');
    expect(agentsButton?.className).toContain('ui-menu-item-inactive');
  });

  it('restores sidebar scroll position after remounting on thread navigation', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const firstScrollRegion = container.querySelector(
      '[data-testid="thread-sidebar-scroll-region"]',
    ) as HTMLDivElement | null;
    expect(firstScrollRegion).toBeTruthy();
    mockScrollable(firstScrollRegion!, 1000, 300);

    firstScrollRegion!.scrollTop = 180;
    act(() => {
      firstScrollRegion!.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      root.unmount();
    });

    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    const secondScrollRegion = container.querySelector(
      '[data-testid="thread-sidebar-scroll-region"]',
    ) as HTMLDivElement | null;
    expect(secondScrollRegion).toBeTruthy();
    mockScrollable(secondScrollRegion!, 1000, 300);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(secondScrollRegion!.scrollTop).toBe(180);
  });

  it('navigates between threads without Next default scroll reset', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    mockStore.currentThreadId = 'thread-1';
    mockStore.threads = [
      {
        id: 'thread-1',
        title: 'Thread 1',
        projectPath: 'default',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 100,
        createdAt: 100,
      },
      {
        id: 'thread-2',
        title: 'Thread 2',
        projectPath: 'project-a',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 200,
        createdAt: 200,
      },
    ];

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const threadItems = container.querySelectorAll('.ui-thread-item');
    expect(threadItems).toHaveLength(2);

    act(() => {
      (threadItems[0] as HTMLDivElement).click();
    });
    await flush();

    expect(mockStore.setCurrentProject).toHaveBeenCalledWith('project-a');
    expect(vitestRouter.navigate).toHaveBeenCalledWith('/thread/thread-2', { preventScrollReset: true });
  });

  it('keeps sidebar scroll position after clicking a thread away from the top', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    mockStore.currentThreadId = 'thread-1';
    mockStore.threads = [
      {
        id: 'thread-1',
        title: 'Thread 1',
        projectPath: 'default',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 100,
        createdAt: 100,
      },
      {
        id: 'thread-2',
        title: 'Thread 2',
        projectPath: 'project-a',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 200,
        createdAt: 200,
      },
      {
        id: 'thread-3',
        title: 'Thread 3',
        projectPath: 'project-b',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 300,
        createdAt: 300,
      },
    ];

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const firstScrollRegion = container.querySelector(
      '[data-testid="thread-sidebar-scroll-region"]',
    ) as HTMLDivElement | null;
    expect(firstScrollRegion).toBeTruthy();
    mockScrollable(firstScrollRegion!, 1200, 300);

    firstScrollRegion!.scrollTop = 180;
    act(() => {
      firstScrollRegion!.dispatchEvent(new Event('scroll'));
    });

    const threadItems = container.querySelectorAll('.ui-thread-item');
    expect(threadItems.length).toBeGreaterThan(1);

    act(() => {
      (threadItems[1] as HTMLDivElement).click();
    });
    await flush();

    firstScrollRegion!.scrollTop = 0;

    act(() => {
      root.unmount();
    });

    root = createRoot(container);
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    const secondScrollRegion = container.querySelector(
      '[data-testid="thread-sidebar-scroll-region"]',
    ) as HTMLDivElement | null;
    expect(secondScrollRegion).toBeTruthy();
    mockScrollable(secondScrollRegion!, 1200, 300);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(secondScrollRegion!.scrollTop).toBe(180);
  });

  it('restores sidebar scroll position synchronously when layout metrics are ready', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    mockStore.currentThreadId = 'thread-1';
    mockStore.threads = [
      {
        id: 'thread-1',
        title: 'Thread 1',
        projectPath: 'default',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 100,
        createdAt: 100,
      },
      {
        id: 'thread-2',
        title: 'Thread 2',
        projectPath: 'project-a',
        createdBy: 'user-1',
        participants: [],
        lastActiveAt: 200,
        createdAt: 200,
      },
    ];

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const firstScrollRegion = container.querySelector(
      '[data-testid="thread-sidebar-scroll-region"]',
    ) as HTMLDivElement | null;
    expect(firstScrollRegion).toBeTruthy();
    mockScrollable(firstScrollRegion!, 1000, 300);

    firstScrollRegion!.scrollTop = 180;
    act(() => {
      firstScrollRegion!.dispatchEvent(new Event('scroll'));
    });

    act(() => {
      root.unmount();
    });

    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'scrollHeight');
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, 'clientHeight');

    Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'thread-sidebar-scroll-region' ? 1000 : 0;
      },
    });
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'thread-sidebar-scroll-region' ? 300 : 0;
      },
    });

    try {
      root = createRoot(container);
      act(() => {
        root.render(React.createElement(ThreadSidebar));
      });

      const secondScrollRegion = container.querySelector(
        '[data-testid="thread-sidebar-scroll-region"]',
      ) as HTMLDivElement | null;
      expect(secondScrollRegion).toBeTruthy();
      expect(secondScrollRegion!.scrollTop).toBe(180);
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', originalScrollHeight);
      }
      if (originalClientHeight) {
        Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', originalClientHeight);
      }
    }
  });

});
