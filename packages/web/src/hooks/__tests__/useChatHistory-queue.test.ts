/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F39 Bug 1: useChatHistory fetches queue state on mount/thread-switch
 * so that F5 refresh restores QueuePanel correctly.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { useChatHistory } from '../useChatHistory';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

function HookHost({ threadId }: { threadId: string }) {
  useChatHistory(threadId);
  return null;
}

describe('useChatHistory queue hydration (F39 Bug 1)', () => {
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

      threadStates: {},
      currentThreadId: 'thread-q',
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentProjectPath: 'default',
      threads: [],
      isLoadingThreads: false,
      queue: [],
      queuePaused: false,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    apiFetchMock.mockReset();
  });

  it('fetches GET /api/threads/:threadId/queue on mount', async () => {
    const queueEntries = [
      {
        id: 'q1',
        threadId: 'thread-q',
        userId: 'u1',
        content: 'queued msg',
        messageId: 'm1',
        mergedMessageIds: [],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
      },
    ];

    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(new Response(JSON.stringify({ queue: queueEntries, paused: false }), { status: 200 }));
      }
      // Other fetches (messages, tasks, task-progress) return empty
      return Promise.resolve(
        new Response(JSON.stringify({ messages: [], hasMore: false, tasks: [] }), { status: 200 }),
      );
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-q' }));
    });

    // Verify queue endpoint was called
    const queueCalls = apiFetchMock.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/queue'));
    expect(queueCalls.length).toBeGreaterThanOrEqual(1);
    expect(queueCalls[0][0]).toContain('/api/threads/thread-q/queue');

    // Verify store was updated
    const state = useChatStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].id).toBe('q1');
  });

  it('sets queuePaused when API reports paused=true', async () => {
    const queueEntries = [
      {
        id: 'q2',
        threadId: 'thread-q',
        userId: 'u1',
        content: 'paused msg',
        messageId: null,
        mergedMessageIds: [],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
      },
    ];

    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ queue: queueEntries, paused: true, pauseReason: 'failed' }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ messages: [], hasMore: false, tasks: [] }), { status: 200 }),
      );
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-q' }));
    });

    const state = useChatStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queuePaused).toBe(true);
    expect(state.queuePauseReason).toBe('failed');
  });

  it('clears stale queue+paused when server returns empty (Cloud R1 P1)', async () => {
    // Pre-populate store with stale queue data (simulates previous session)
    useChatStore.setState({
      queue: [
        {
          id: 'q-stale',
          threadId: 'thread-q',
          userId: 'u1',
          content: 'stale entry',
          messageId: null,
          mergedMessageIds: [],
          source: 'user' as const,
          targetAgents: ['opus'],
          intent: 'execute',
          status: 'queued' as const,
          createdAt: Date.now(),
        },
      ],
      queuePaused: true,
      queuePauseReason: 'failed',
    });

    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(new Response(JSON.stringify({ queue: [], paused: false }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ messages: [], hasMore: false, tasks: [] }), { status: 200 }),
      );
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-q' }));
    });

    const state = useChatStore.getState();
    // Stale data must be cleared
    expect(state.queue).toHaveLength(0);
    expect(state.queuePaused).toBe(false);
  });
});
