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
import { THREAD_LIVE_REFRESH_EVENT } from '../thread-live-refresh';
import { useChatHistory } from '../useChatHistory';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

function HookHost({ threadId }: { threadId: string }) {
  useChatHistory(threadId);
  return null;
}

describe('useChatHistory thread switch ordering', () => {
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
      messages: [{ id: 'a1', type: 'user', content: 'thread-a message', timestamp: Date.now() }],
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
      currentThreadId: 'thread-a',
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentProjectPath: 'default',
      threads: [],
      isLoadingThreads: false,
    });

    // Keep requests pending so this test only observes immediate switch side-effects.
    apiFetchMock.mockImplementation(() => new Promise<Response>(() => {}));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    apiFetchMock.mockReset();
  });

  it('does not clear previous thread messages before setCurrentThread runs', () => {
    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-b' }));
    });

    const state = useChatStore.getState();
    expect(state.currentThreadId).toBe('thread-a');
    expect(state.messages.map((m) => m.id)).toEqual(['a1']);
  });

  it('clears messages when thread is already synced with no cache', () => {
    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-a' }));
    });

    const state = useChatStore.getState();
    expect(state.currentThreadId).toBe('thread-a');
    expect(state.messages).toHaveLength(0);
  });

  it('filters scheduler placeholder messages from fetched history', async () => {
    const now = Date.now();
    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/messages')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [
                {
                  id: 'scheduler-placeholder-1',
                  type: 'text',
                  agentId: 'system',
                  content: '[调度上下文]\n这是定时任务触发信息',
                  origin: 'callback',
                  source: { connector: 'scheduler', label: '定时任务', icon: 'scheduler' },
                  timestamp: now,
                },
                {
                  id: 'scheduler-reply-1',
                  type: 'text',
                  agentId: 'opus',
                  content: '该休息一下啦！站起来活动活动，保护眼睛~',
                  origin: 'callback',
                  source: { connector: 'scheduler', label: '定时任务', icon: 'scheduler' },
                  timestamp: now + 1,
                },
              ],
              hasMore: false,
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-a' }));
      await Promise.resolve();
    });

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'scheduler-reply-1',
        agentId: 'opus',
        content: '该休息一下啦！站起来活动活动，保护眼睛~',
        origin: 'callback',
      }),
    ]);
  });

  it('F069-R4: thread with cached messages AND unreadCount > 0 triggers fetchHistory', () => {
    // Scenario: background thread accumulated synthetic messages via WebSocket.
    // Cache has messages but the last sortable ID is older than the server's latest.
    // Without force-refresh, ChatContainer acks with the stale ID → badge reappears.
    useChatStore.setState({
      currentThreadId: 'thread-c',
      threadStates: {
        'thread-c': {
          messages: [
            {
              id: '0000001710000000-000001-abcd1234',
              type: 'assistant',
              agentId: 'opus',
              content: 'old real msg',
              timestamp: Date.now() - 60_000,
            },
            { id: 'bg-sys-1710000060000-opus-1', type: 'system', content: 'background update', timestamp: Date.now() },
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

          unreadCount: 1,
          hasUserMention: false,
          lastActivity: Date.now(),
          queue: [],
          queuePaused: false,
          queueFull: false,
        },
      },
    });

    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-c' }));
    });

    expect(apiFetchMock).toHaveBeenCalled();
    const calls = apiFetchMock.mock.calls;
    const historyCall = calls.find(([url]) => typeof url === 'string' && url.includes('/api/messages'));
    expect(historyCall).toBeDefined();
  });

  it('cached thread with unreadCount === 0 does NOT trigger fetchHistory', () => {
    // When unread is 0, no need to force-refresh — cache is good enough.
    useChatStore.setState({
      currentThreadId: 'thread-d',
      threadStates: {
        'thread-d': {
          messages: [
            {
              id: '0000001710000000-000001-abcd1234',
              type: 'assistant',
              agentId: 'opus',
              content: 'cached msg',
              timestamp: Date.now(),
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
          lastActivity: Date.now(),
          queue: [],
          queuePaused: false,
          queueFull: false,
        },
      },
    });

    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-d' }));
    });

    // Should NOT call fetchHistory (no /api/messages call) — uses cache silently.
    // Secondary panel hydration (tasks, queue) still fires.
    const calls = apiFetchMock.mock.calls;
    const historyCall = calls.find(([url]) => typeof url === 'string' && url.includes('/api/messages'));
    expect(historyCall).toBeUndefined();
  });

  it('forces replace hydration when cached thread already contains duplicate same-invocation bubbles', () => {
    const now = Date.now();
    useChatStore.setState({
      currentThreadId: 'thread-e',
      threadStates: {
        'thread-e': {
          messages: [
            {
              id: 'stream-e-1',
              type: 'assistant',
              agentId: 'opus',
              content: 'partial stream bubble',
              origin: 'stream',
              timestamp: now - 2_000,
              extra: { stream: { invocationId: 'inv-e-1' } },
            },
            {
              id: 'callback-e-1',
              type: 'assistant',
              agentId: 'opus',
              content: 'final callback bubble',
              origin: 'callback',
              timestamp: now - 1_000,
              extra: { stream: { invocationId: 'inv-e-1' } },
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
          queueFull: false,
        },
      },
    });

    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-e' }));
    });

    const calls = apiFetchMock.mock.calls;
    const historyCall = calls.find(([url]) => typeof url === 'string' && url.includes('/api/messages'));
    expect(historyCall).toBeDefined();
  });

  it('#80 fix-A: thread with cached messages AND activeInvocation still triggers fetchHistory', () => {
    // Set up: thread-b has cached messages + activeInvocation (streaming in background)
    useChatStore.setState({
      currentThreadId: 'thread-b',
      threadStates: {
        'thread-b': {
          messages: [{ id: 'b1', type: 'assistant', agentId: 'opus', content: 'cached', timestamp: Date.now() }],
          isLoading: true,
          isLoadingHistory: false,
          hasMore: true,
          hasActiveInvocation: true,
          activeInvocations: {},
          intentMode: 'execute',
          targetAgents: ['opus'],
          agentStatuses: { opus: 'streaming' },
          agentInvocations: {},
          currentGame: null,

          unreadCount: 0,
          hasUserMention: false,
          lastActivity: Date.now(),
          queue: [],
          queuePaused: false,
          queueFull: false,
        },
      },
    });

    // Mount with thread-b — should fetch despite having cached messages
    act(() => {
      root.render(React.createElement(HookHost, { threadId: 'thread-b' }));
    });

    // apiFetch should have been called (fetchHistory triggered)
    expect(apiFetchMock).toHaveBeenCalled();
    const calls = apiFetchMock.mock.calls;
    const historyCall = calls.find(([url]) => typeof url === 'string' && url.includes('/api/messages'));
    expect(historyCall).toBeDefined();
  });

  it('preserves server-reported processing status when queue hydration beats setCurrentThread on thread switch', async () => {
    vi.useFakeTimers();
    let resolveMessages: ((value: Response) => void) | null = null;
    const messagesPromise = new Promise<Response>((resolve) => {
      resolveMessages = resolve;
    });

    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/messages')) {
        return messagesPromise;
      }
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ queue: [], paused: false, activeInvocations: ['opus'] }), { status: 200 }),
        );
      }
      if (typeof url === 'string' && url.includes('/task-progress')) {
        return Promise.resolve(new Response(JSON.stringify({ taskProgress: {} }), { status: 200 }));
      }
      if (typeof url === 'string' && url.includes('/api/tasks')) {
        return Promise.resolve(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const now = Date.now();
    useChatStore.setState({
      currentThreadId: 'thread-a',
      threadStates: {
        'thread-race': {
          messages: [
            {
              id: 'race-msg-1',
              type: 'assistant',
              agentId: 'opus',
              content: 'cached stale processing bubble',
              timestamp: now - 10_000,
            },
          ],
          isLoading: true,
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
          queueFull: false,
        },
      },
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-race' }));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    const backgroundStateAfterQueueHydration = useChatStore.getState().threadStates['thread-race'];
    expect(backgroundStateAfterQueueHydration?.hasActiveInvocation).toBe(true);
    expect(backgroundStateAfterQueueHydration?.targetAgents).toEqual(['opus']);
    expect(backgroundStateAfterQueueHydration?.agentStatuses).toEqual({ opus: 'streaming' });

    act(() => {
      useChatStore.getState().setCurrentThread('thread-race');
    });

    const stateAfterThreadSwitch = useChatStore.getState();
    expect(stateAfterThreadSwitch.currentThreadId).toBe('thread-race');
    expect(stateAfterThreadSwitch.hasActiveInvocation).toBe(true);
    expect(stateAfterThreadSwitch.targetAgents).toEqual(['opus']);
    expect(stateAfterThreadSwitch.agentStatuses).toEqual({ opus: 'streaming' });

    resolveMessages!(new Response(JSON.stringify({ messages: [], hasMore: false }), { status: 200 }));
    await act(async () => {
      await Promise.resolve();
    });

    vi.useRealTimers();
  });

  it('shows threadId hint when switching from a busy thread to a sparse thread', async () => {
    const now = Date.now();
    const buildHistory = (threadPrefix: string, count: number) =>
      Array.from({ length: count }).map((_, idx) => ({
        id: `${threadPrefix}-${idx + 1}`,
        type: 'text',
        agentId: idx % 2 === 0 ? 'opus' : '',
        content: `${threadPrefix} message ${idx + 1}`,
        timestamp: now + idx,
      }));

    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/messages?')) {
        if (url.includes('threadId=thread-a')) {
          return Promise.resolve(new Response(JSON.stringify({ messages: buildHistory('a', 20), hasMore: false })));
        }
        if (url.includes('threadId=thread-b')) {
          return Promise.resolve(new Response(JSON.stringify({ messages: buildHistory('b', 2), hasMore: false })));
        }
        return Promise.resolve(new Response(JSON.stringify({ messages: [], hasMore: false })));
      }
      if (typeof url === 'string' && url.includes('/api/tasks?')) {
        return Promise.resolve(new Response(JSON.stringify({ tasks: [] })));
      }
      if (typeof url === 'string' && url.includes('/task-progress')) {
        return Promise.resolve(new Response(JSON.stringify({ taskProgress: {} })));
      }
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ queue: [], paused: false, activeInvocations: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-a' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-b' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const bgThread = useChatStore.getState().threadStates['thread-b'];
    expect(bgThread).toBeDefined();
    const hint = bgThread?.messages.find(
      (m) => m.type === 'system' && m.content.includes('threadId=thread-b') && m.content.includes('threadId=thread-a'),
    );
    expect(hint).toBeDefined();
  });

  it('retries one more live refresh when reconnect hydration causes a dramatic same-thread drop', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const buildChatMessages = (prefix: string, count: number) =>
      Array.from({ length: count }).map((_, idx) => ({
        id: `${prefix}-${idx + 1}`,
        type: 'assistant' as const,
        agentId: 'opus',
        content: `${prefix} message ${idx + 1}`,
        origin: 'stream' as const,
        extra: { stream: { invocationId: 'inv-drop-1' } },
        timestamp: now + idx,
      }));
    const buildApiMessages = (prefix: string, count: number) =>
      Array.from({ length: count }).map((_, idx) => ({
        id: `${prefix}-${idx + 1}`,
        type: 'text',
        agentId: 'opus',
        content: `${prefix} message ${idx + 1}`,
        origin: 'callback',
        extra: { stream: { invocationId: 'inv-drop-1' } },
        timestamp: now + idx,
      }));

    let historyFetchCount = 0;
    apiFetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/messages?') && url.includes('threadId=thread-drop')) {
        historyFetchCount += 1;
        return Promise.resolve(new Response(JSON.stringify({ messages: buildApiMessages('server', 2), hasMore: false })));
      }
      if (typeof url === 'string' && url.includes('/api/tasks?')) {
        return Promise.resolve(new Response(JSON.stringify({ tasks: [] })));
      }
      if (typeof url === 'string' && url.includes('/task-progress')) {
        return Promise.resolve(new Response(JSON.stringify({ taskProgress: {} })));
      }
      if (typeof url === 'string' && url.includes('/queue')) {
        return Promise.resolve(
          new Response(JSON.stringify({ queue: [], paused: false, activeInvocations: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    const cachedMessages = buildChatMessages('cached', 20);
    useChatStore.setState({
      currentThreadId: 'thread-drop',
      messages: cachedMessages,
      threadStates: {
        'thread-drop': {
          messages: cachedMessages,
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
          queueFull: false,
        },
      },
    });

    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-drop' }));
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(THREAD_LIVE_REFRESH_EVENT, {
          detail: { threadId: 'thread-drop', scope: 'messages', reason: 'test-live-refresh' },
        }),
      );
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(historyFetchCount).toBeGreaterThanOrEqual(2);
    expect(historyFetchCount).toBeLessThan(5);
    const after = useChatStore.getState().threadStates['thread-drop'];
    expect(after?.messages.length).toBeGreaterThanOrEqual(20);
    vi.useRealTimers();
  });
});
