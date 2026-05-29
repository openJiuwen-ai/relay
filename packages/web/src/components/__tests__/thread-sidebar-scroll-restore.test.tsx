/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, type MutableRefObject, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { SIDEBAR_SCROLL_STORAGE_KEY } from '../thread-sidebar/thread-sidebar-constants';
import { useThreadSidebarData } from '../thread-sidebar/useThreadSidebarData';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3004',
  apiFetch: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'test-user',
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root;
let captured: ReturnType<typeof useThreadSidebarData> | null = null;
const originalInnerWidth = window.innerWidth;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

function Host() {
  const result = useThreadSidebarData({
    searchQuery: '',
    filterOption: 'all',
  });
  captured = result;

  const setScrollRegion = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        Object.defineProperty(element, 'clientHeight', {
          configurable: true,
          value: 100,
        });
        Object.defineProperty(element, 'scrollHeight', {
          configurable: true,
          value: 400,
        });
        Object.defineProperty(element, 'scrollTop', {
          configurable: true,
          value: 0,
          writable: true,
        });
      }
      (result.scrollRegionRef as MutableRefObject<HTMLDivElement | null>).current = element;
    },
    [result.scrollRegionRef],
  );

  return React.createElement('div', { ref: setScrollRegion });
}

const apiFetchMock = vi.mocked(apiFetch);

describe('ThreadSidebar scroll restore', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = () => {};
  });

  afterAll(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, '150');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    captured = null;
    useAuthorizationPendingStore.setState({ pendingByThread: {}, threadByRequest: {} });
    useChatStore.setState({
      threads: [],
      currentThreadId: 'default',
      isLoadingThreads: false,
    });
    apiFetchMock.mockImplementation(() => Promise.resolve({ ok: false } as Response));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.sessionStorage.removeItem(SIDEBAR_SCROLL_STORAGE_KEY);
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('restores the scroll position from session storage', async () => {
    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(Host)));
    });

    expect(captured).not.toBeNull();
    expect(captured?.scrollRegionRef.current?.scrollTop).toBe(150);
  });

  it('hydrates pending approval markers for multiple threads on initial sidebar load', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/threads') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ threads: [] }),
        } as Response);
      }
      if (url === '/api/authorization/pending') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            pending: [
              { threadId: 'thread-a', requestId: 'req-1' },
              { threadId: 'thread-b', requestId: 'req-2' },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(Host)));
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-a')).toBe(true);
    expect(useAuthorizationPendingStore.getState().hasPending('thread-b')).toBe(true);
  });

  it('clears stale pending approval markers from the server snapshot', async () => {
    useAuthorizationPendingStore.getState().registerPending('thread-stale', 'req-stale');
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/threads') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ threads: [] }),
        } as Response);
      }
      if (url === '/api/authorization/pending') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            pending: [{ threadId: 'thread-live', requestId: 'req-live' }],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    await act(async () => {
      root.render(React.createElement(MemoryRouter, null, React.createElement(Host)));
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-stale')).toBe(false);
    expect(useAuthorizationPendingStore.getState().hasPending('thread-live')).toBe(true);
  });
});
