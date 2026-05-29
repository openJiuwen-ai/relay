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

describe('ThreadSidebar search', () => {
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
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
    vi.clearAllMocks();
  });

  it('keeps the search input open after clearing the current query', async () => {
    await act(async () => {
      root.render(React.createElement(ThreadSidebar));
    });

    const searchToggle = container.querySelector('[data-testid="thread-search-toggle"]') as HTMLButtonElement | null;
    expect(searchToggle).not.toBeNull();

    await act(async () => {
      searchToggle?.click();
    });

    const input = container.querySelector('input[aria-label="搜索会话"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'abc');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const clearButton = container.querySelector('[data-testid="search-input-clear-button"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();

    await act(async () => {
      clearButton?.click();
    });

    const nextInput = container.querySelector('input[aria-label="搜索会话"]') as HTMLInputElement | null;
    expect(nextInput).not.toBeNull();
    expect(nextInput?.value).toBe('');
  });
});
