/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '@/components/thread-sidebar/ThreadSidebar';
import { useChatStore } from '@/stores/chatStore';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3004',
  apiFetch: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('@/components/UserProfile', () => ({
  UserProfile: () => React.createElement('div', { 'data-testid': 'user-profile-stub' }),
}));

vi.mock('@/components/AppModal', () => ({
  AppModal: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/ThreadSidebar/DirectoryPickerModal', () => ({
  DirectoryPickerModal: () => null,
}));

vi.mock('@/components/ThreadSidebar/SectionGroup', () => ({
  SectionGroup: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('@/components/ThreadSidebar/ThreadItem', () => ({
  ThreadItem: () => null,
}));

vi.mock('@/components/ThreadSidebar/use-collapse-state', () => ({
  useCollapseState: () => ({
    isCollapsed: () => false,
    toggleGroup: vi.fn(),
  }),
}));

vi.mock('@/components/ThreadSidebar/use-project-pins', () => ({
  useProjectPins: () => ({
    pinnedProjects: new Set<string>(),
    toggleProjectPin: vi.fn(),
  }),
}));

describe('ThreadSidebar menu visibility', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalInnerWidth = window.innerWidth;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useChatStore.setState({
      threads: [],
      currentThreadId: 'default',
      isLoadingThreads: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('shows the scheduled tasks menu entry with a right tooltip when collapsed', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
      writable: true,
    });

    await act(async () => {
      root.render(React.createElement(ThreadSidebar));
    });

    const scheduledTasksButton = container.querySelector(
      '[data-testid="sidebar-menu-scheduled-tasks"]',
    ) as HTMLButtonElement | null;

    expect(scheduledTasksButton).not.toBeNull();
    expect(scheduledTasksButton?.hidden).toBe(false);
    expect(scheduledTasksButton?.getAttribute('title')).toBeNull();

    await act(async () => {
      scheduledTasksButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.dataset.placement).toBe('right');
    expect(tooltip?.textContent).toContain('定时任务');
  });
});
