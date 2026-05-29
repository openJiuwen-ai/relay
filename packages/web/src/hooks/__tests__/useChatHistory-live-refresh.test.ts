/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { requestThreadLiveRefresh } from '../thread-live-refresh';
import { useChatHistory } from '../useChatHistory';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

function HookHost({ threadId }: { threadId: string }) {
  useChatHistory(threadId);
  return null;
}

function buildCachedThreadState() {
  const now = Date.now();
  return {
    messages: [
      {
        id: 'cached-1',
        type: 'assistant' as const,
        agentId: 'opus',
        content: 'cached message',
        timestamp: now,
      },
    ],
    isLoading: false,
    isLoadingHistory: false,
    hasMore: true,
    hasActiveInvocation: false,
    activeInvocations: {},
    intentMode: null,
    targetAgents: [],
    agentStatuses: {},
    agentInvocations: {},
    currentGame: null,
    unreadCount: 0,
    hasUserMention: false,
    lastActivity: now,
    queue: [],
    queuePaused: false,
    queuePauseReason: undefined,
    queueFull: false,
    queueFullSource: undefined,
  };
}

describe('useChatHistory live refresh', () => {
  let container: HTMLDivElement;
  let root: Root;
  const apiFetchMock = vi.mocked(apiFetch);

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useChatStore.setState({
      messages: [],
      isLoading: false,
      isLoadingHistory: false,
      hasMore: true,
      hasActiveInvocation: false,
      intentMode: null,
      targetAgents: [],
      agentStatuses: {},
      agentInvocations: {},
      currentGame: null,
      threadStates: {
        'thread-live': buildCachedThreadState(),
      },
      currentThreadId: 'thread-live',
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentProjectPath: 'default',
      threads: [],
      isLoadingThreads: false,
    });

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/messages?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ messages: [], hasMore: false }),
        } as Response);
      }
      if (url.startsWith('/api/tasks?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [] }),
        } as Response);
      }
      if (url.endsWith('/task-progress')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ taskProgress: {} }),
        } as Response);
      }
      if (url.endsWith('/queue')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ queue: [], paused: false, activeInvocations: [] }),
        } as Response);
      }
      throw new Error(`unexpected url: ${url}`);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    apiFetchMock.mockReset();
    vi.useRealTimers();
  });

  it('re-fetches messages and panel data when the active thread requests a live refresh', async () => {
    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-live' }));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    apiFetchMock.mockClear();

    await act(async () => {
      requestThreadLiveRefresh('thread-live', 'all', 'test');
      vi.advanceTimersByTime(200);
      await Promise.resolve();
      await Promise.resolve();
    });

    const calledUrls = apiFetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((url) => url.startsWith('/api/messages?'))).toBe(true);
    expect(calledUrls).toContain('/api/tasks?threadId=thread-live');
    expect(calledUrls).toContain('/api/threads/thread-live/task-progress');
    expect(calledUrls).toContain('/api/threads/thread-live/queue');
  });
});
