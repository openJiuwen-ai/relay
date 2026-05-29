/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * P1 regression test for cross-thread event leakage via useSocket.
 *
 * Tests the actual useSocket hook with a mock socket.io EventEmitter,
 * verifying that intent_mode and agent_message events from a non-active
 * thread are NOT forwarded to callbacks (preventing the "duplicate cat" bug).
 *
 * Red→Green: Before the fix, intent_mode had no threadIdRef guard in useSocket,
 * so events from thread A would leak into thread B's callback after a switch.
 */

import EventEmitter from 'node:events';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';

// ── Mock socket.io-client ──
// Create a controllable EventEmitter that acts as a socket.io client.
const mockSocket = new EventEmitter() as EventEmitter & {
  id: string;
  io: { engine: { transport: { name: string }; on: () => void } };
  emit: (...args: unknown[]) => boolean;
  disconnect: () => void;
  connected: boolean;
};
mockSocket.id = 'mock-socket-id';
mockSocket.io = { engine: { transport: { name: 'websocket' }, on: vi.fn() } };
mockSocket.connected = true;
// Override emit to no-op (prevent join_room etc. from triggering listeners during tests)
mockSocket.emit = vi.fn(() => true) as unknown as typeof mockSocket.emit;
mockSocket.disconnect = vi.fn();

vi.mock('socket.io-client', () => ({
  io: () => mockSocket,
}));

const { mockRequestThreadLiveRefresh } = vi.hoisted(() => ({
  mockRequestThreadLiveRefresh: vi.fn(),
}));

const { mockNotifyToolApprovalRequest, mockNotifyOnTaskComplete } = vi.hoisted(() => ({
  mockNotifyToolApprovalRequest: vi.fn(),
  mockNotifyOnTaskComplete: vi.fn(),
}));

// ── Mock stores ──
const mockAddMessageToThread = vi.fn();
const mockAppendToThreadMessage = vi.fn();
const mockAppendToolEventToThread = vi.fn();
const mockSetThreadAgentInvocation = vi.fn();
const mockSetThreadMessageMetadata = vi.fn();
const mockSetThreadMessageUsage = vi.fn();
const mockSetThreadMessageStreaming = vi.fn();
const mockSetThreadLoading = vi.fn();
const mockSetThreadHasActiveInvocation = vi.fn();
const mockAddThreadActiveInvocation = vi.fn();
const mockBatchStreamChunkUpdate = vi.fn();
const mockSetQueue = vi.fn();
const mockSetQueuePaused = vi.fn();
const mockSetQueueFull = vi.fn();
const mockSetThreadIntentMode = vi.fn();
const mockSetThreadTargetCats = vi.fn();
const mockUpdateThreadAgentStatus = vi.fn();
const mockClearThreadActiveInvocation = vi.fn();
const mockRequestStreamCatchUp = vi.fn();
const mockGetThreadState = vi.fn(() => ({
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

  unreadCount: 0,
  lastActivity: 0,
}));
let mockStoreCurrentThreadId = 'thread-B';

vi.mock('@/stores/chatStore', () => {
  const store = {
    getState: () => ({
      currentThreadId: mockStoreCurrentThreadId,
      addMessageToThread: mockAddMessageToThread,
      appendToThreadMessage: mockAppendToThreadMessage,
      appendToolEventToThread: mockAppendToolEventToThread,
      setThreadAgentInvocation: mockSetThreadAgentInvocation,
      setThreadMessageMetadata: mockSetThreadMessageMetadata,
      setThreadMessageUsage: mockSetThreadMessageUsage,
      setThreadMessageStreaming: mockSetThreadMessageStreaming,
      setThreadLoading: mockSetThreadLoading,
      setThreadHasActiveInvocation: mockSetThreadHasActiveInvocation,
      addThreadActiveInvocation: mockAddThreadActiveInvocation,
      batchStreamChunkUpdate: mockBatchStreamChunkUpdate,
      setQueue: mockSetQueue,
      setQueuePaused: mockSetQueuePaused,
      setQueueFull: mockSetQueueFull,
      setThreadIntentMode: mockSetThreadIntentMode,
      setThreadTargetAgents: mockSetThreadTargetCats,
      updateThreadAgentStatus: mockUpdateThreadAgentStatus,
      clearThreadActiveInvocation: mockClearThreadActiveInvocation,
      requestStreamCatchUp: mockRequestStreamCatchUp,
      getThreadState: mockGetThreadState,
    }),
  };
  return { useChatStore: store };
});

vi.mock('@/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

let mockUserId = 'test-user';
vi.mock('@/utils/userId', () => ({
  getUserId: () => mockUserId,
}));

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3100',
}));

vi.mock('@/utils/desktop-notification', () => ({
  notifyOnTaskComplete: mockNotifyOnTaskComplete,
  notifyToolApprovalRequest: mockNotifyToolApprovalRequest,
}));

vi.mock('../thread-live-refresh', () => ({
  THREAD_LIVE_REFRESH_EVENT: 'office-claw:thread-live-refresh',
  requestThreadLiveRefresh: mockRequestThreadLiveRefresh,
}));

import { configureDebug, invocationDebugConstants } from '@/debug/invocationEventDebug';
// ── Import useSocket after mocks ──
import { type SocketCallbacks, useSocket } from '../useSocket';

/**
 * Minimal wrapper component to mount the useSocket hook with controlled threadId.
 */
function HookWrapper({
  callbacks,
  threadId,
  watchedThreadIds,
}: {
  callbacks: SocketCallbacks;
  threadId: string;
  watchedThreadIds?: string[];
}) {
  useSocket(callbacks, threadId, watchedThreadIds);
  return null;
}

/**
 * Simulate a server-side socket event arriving at the client.
 * Uses the original EventEmitter.emit (not the mocked socket.emit).
 */
function simulateServerEvent(event: string, data: unknown) {
  // Get all listeners registered on the mock socket and call them
  const listeners = mockSocket.listeners(event);
  for (const listener of listeners) {
    (listener as (data: unknown) => void)(data);
  }
}

type WindowDebugApi = {
  dump: (options?: { rawThreadId?: boolean }) => string;
};

describe('useSocket thread guard (P1 regression: cross-thread event leakage)', () => {
  let container: HTMLDivElement;
  let root: Root;

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
    useAuthorizationPendingStore.setState({ pendingByThread: {}, threadByRequest: {} });
    window.sessionStorage.clear();
    window.sessionStorage.removeItem(invocationDebugConstants.STORAGE_KEY);
    configureDebug({ enabled: false });
    delete (window as typeof window & { __officeClawDebug?: unknown }).__officeClawDebug;
    mockUserId = 'test-user';
    mockStoreCurrentThreadId = 'thread-B';
    mockAddMessageToThread.mockClear();
    mockAppendToThreadMessage.mockClear();
    mockAppendToolEventToThread.mockClear();
    mockSetThreadAgentInvocation.mockClear();
    mockSetThreadMessageMetadata.mockClear();
    mockSetThreadMessageUsage.mockClear();
    mockSetThreadMessageStreaming.mockClear();
    mockSetThreadLoading.mockClear();
    mockSetThreadHasActiveInvocation.mockClear();
    mockAddThreadActiveInvocation.mockClear();
    mockBatchStreamChunkUpdate.mockClear();
    mockSetQueue.mockClear();
    mockSetQueuePaused.mockClear();
    mockSetQueueFull.mockClear();
    mockSetThreadIntentMode.mockClear();
    mockSetThreadTargetCats.mockClear();
    mockUpdateThreadAgentStatus.mockClear();
    mockClearThreadActiveInvocation.mockClear();
    mockRequestStreamCatchUp.mockClear();
    mockRequestThreadLiveRefresh.mockClear();
    mockNotifyOnTaskComplete.mockClear();
    mockNotifyToolApprovalRequest.mockClear();
    mockGetThreadState.mockClear();
    // Clear all socket listeners from previous tests
    mockSocket.removeAllListeners();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.sessionStorage.removeItem(invocationDebugConstants.STORAGE_KEY);
    configureDebug({ enabled: false });
    delete (window as typeof window & { __officeClawDebug?: unknown }).__officeClawDebug;
  });

  it('intent_mode from active thread is forwarded to callback', () => {
    // Dual-pointer guard: both route and store must agree
    mockStoreCurrentThreadId = 'thread-A';
    const onIntentMode = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-A' }));
    });

    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-A',
        mode: 'execute',
        targetAgents: ['opus'],
      });
    });

    expect(onIntentMode).toHaveBeenCalledTimes(1);
    expect(onIntentMode).toHaveBeenCalledWith({
      threadId: 'thread-A',
      mode: 'execute',
      targetAgents: ['opus'],
    });
  });

  it('intent_mode from OTHER thread routes to background path, not callback', () => {
    const onIntentMode = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode,
    };

    // Mount with thread-B as active
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    // Simulate intent_mode arriving for thread-A (cross-thread event)
    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-A',
        mode: 'execute',
        targetAgents: ['opus'],
      });
    });

    // MUST NOT be forwarded to callback — this is the core regression guard
    expect(onIntentMode).not.toHaveBeenCalled();

    // Background path: thread-scoped state is updated for the non-active thread
    expect(mockSetThreadLoading).toHaveBeenCalledWith('thread-A', true);
    expect(mockSetThreadHasActiveInvocation).toHaveBeenCalledWith('thread-A', true);
    expect(mockSetThreadIntentMode).toHaveBeenCalledWith('thread-A', 'execute');
    expect(mockSetThreadTargetCats).toHaveBeenCalledWith('thread-A', ['opus']);
  });

  it('intent_mode for switched-away thread routes to background after thread change', () => {
    const onIntentMode = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode,
    };

    // Start on thread-A (both route and store agree)
    mockStoreCurrentThreadId = 'thread-A';
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-A' }));
    });

    // Switch to thread-B (simulates user clicking another thread — store follows route)
    mockStoreCurrentThreadId = 'thread-B';
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    // Now thread-A's late intent_mode arrives — must NOT forward to callback
    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-A',
        mode: 'execute',
        targetAgents: ['opus'],
      });
    });

    expect(onIntentMode).not.toHaveBeenCalled();
    // But thread-A's state is updated via background path
    expect(mockSetThreadIntentMode).toHaveBeenCalledWith('thread-A', 'execute');

    // thread-B's intent_mode should still forward to callback
    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-B',
        mode: 'ideate',
        targetAgents: ['codex'],
      });
    });

    expect(onIntentMode).toHaveBeenCalledTimes(1);
    expect(onIntentMode).toHaveBeenCalledWith({
      threadId: 'thread-B',
      mode: 'ideate',
      targetAgents: ['codex'],
    });
  });

  it('tracks authorization pending state for non-active thread and clears on response', () => {
    const onAuthorizationRequest = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onAuthorizationRequest,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('authorization:request', {
        requestId: 'req-x',
        threadId: 'thread-A',
        agentId: 'opus',
        action: 'tool_exec',
        reason: 'Need approval',
        createdAt: Date.now(),
      });
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-A')).toBe(true);
    expect(mockNotifyToolApprovalRequest).toHaveBeenCalledTimes(1);
    expect(mockNotifyToolApprovalRequest).toHaveBeenCalledWith({
      requestId: 'req-x',
      threadId: 'thread-A',
      catId: 'opus',
      action: 'tool_exec',
      reason: 'Need approval',
    });
    expect(onAuthorizationRequest).not.toHaveBeenCalled();

    act(() => {
      simulateServerEvent('authorization:response', {
        requestId: 'req-x',
        status: 'granted',
      });
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-A')).toBe(false);
  });

  it('agent_message from other thread goes to background handler, not onMessage', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    // agent_message from thread-A (background)
    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        threadId: 'thread-A',
        content: 'hello from thread A',
        timestamp: Date.now(),
      });
    });

    // onMessage should NOT be called for background thread events
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('agent_message without threadId is dropped (never routed to active thread)', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        content: 'legacy payload without thread id',
        timestamp: Date.now(),
      });
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(mockAddMessageToThread).not.toHaveBeenCalled();
    expect(mockRequestStreamCatchUp).toHaveBeenCalledWith('thread-B');
  });

  it('agent_message without threadId is recovered by invocationId mapping (no drop catch-up)', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    // Seed invocationId -> thread-A mapping from a normal background event.
    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        threadId: 'thread-A',
        invocationId: 'inv-1',
        content: 'seed',
        timestamp: Date.now(),
      });
    });

    // Missing threadId, but recoverable by invocationId.
    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        invocationId: 'inv-1',
        content: 'continued stream chunk',
        timestamp: Date.now(),
      });
    });

    // Still background-routed to thread-A, no active-thread contamination and no drop recovery fetch.
    expect(onMessage).not.toHaveBeenCalled();
    expect(mockAddMessageToThread.mock.calls.some((call) => call?.[0] === 'thread-A')).toBe(true);
    expect(mockRequestStreamCatchUp).not.toHaveBeenCalled();
  });

  it('buffers missing-thread message and replays after intent_mode maps invocationId', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        invocationId: 'inv-buffer',
        content: 'chunk before thread mapping',
        timestamp: Date.now(),
      });
    });

    expect(mockRequestStreamCatchUp).not.toHaveBeenCalled();

    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-A',
        mode: 'execute',
        targetAgents: ['opus'],
        invocationId: 'inv-buffer',
      });
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(mockAddMessageToThread.mock.calls.some((call) => call?.[0] === 'thread-A')).toBe(true);
    expect(mockRequestStreamCatchUp).not.toHaveBeenCalled();
  });

  it('buffered missing-thread message triggers catch-up on timeout if never mapped', () => {
    vi.useFakeTimers();
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        invocationId: 'inv-timeout',
        content: 'orphan chunk',
        timestamp: Date.now(),
      });
    });

    expect(mockRequestStreamCatchUp).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(mockRequestStreamCatchUp).toHaveBeenCalledWith('thread-B');
    vi.useRealTimers();
  });

  it('route/store mismatch: message for route thread must go background until store switches', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    // Route has switched to thread-B, but store still points to old thread-A.
    mockStoreCurrentThreadId = 'thread-A';
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    // Message belongs to the new route thread (thread-B).
    act(() => {
      simulateServerEvent('agent_message', {
        type: 'text',
        agentId: 'opus',
        threadId: 'thread-B',
        content: 'from thread B during switch window',
        timestamp: Date.now(),
      });
    });

    // Must not mutate old active flat state via onMessage.
    expect(onMessage).not.toHaveBeenCalled();
    // Must be routed as background so it lands in thread-B state map.
    expect(mockAddMessageToThread).toHaveBeenCalledTimes(1);
    expect(mockAddMessageToThread.mock.calls[0]?.[0]).toBe('thread-B');
  });

  it('route/store mismatch: non-text tool_use event is preserved via background path', () => {
    const onMessage = vi.fn();
    const callbacks: SocketCallbacks = {
      onMessage,
    };

    mockStoreCurrentThreadId = 'thread-A';
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('agent_message', {
        type: 'tool_use',
        agentId: 'opus',
        threadId: 'thread-B',
        toolName: 'TodoWrite',
        toolInput: { tasks: ['A', 'B'] },
        timestamp: Date.now(),
      });
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(mockAddMessageToThread).toHaveBeenCalledTimes(1);
    expect(mockAddMessageToThread.mock.calls[0]?.[0]).toBe('thread-B');
    expect(mockAddMessageToThread.mock.calls[0]?.[1]).toMatchObject({ type: 'assistant', agentId: 'opus' });
    expect(mockAppendToolEventToThread).toHaveBeenCalledTimes(1);
    expect(mockAppendToolEventToThread.mock.calls[0]?.[0]).toBe('thread-B');
  });

  it('queue_updated processing marks thread as active invocation (P1 regression)', () => {
    mockStoreCurrentThreadId = 'thread-B';
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('queue_updated', {
        threadId: 'thread-B',
        queue: [
          {
            id: 'q1',
            status: 'processing',
          },
        ],
        action: 'processing',
      });
    });

    expect(mockSetQueue).toHaveBeenCalledWith('thread-B', expect.any(Array));
    expect(mockSetThreadHasActiveInvocation).toHaveBeenCalledWith('thread-B', true);
  });

  it('queue_updated completed triggers panel reconcile when queue has no processing entry', () => {
    mockStoreCurrentThreadId = 'thread-B';
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('queue_updated', {
        threadId: 'thread-B',
        queue: [{ id: 'q1', status: 'queued' }],
        action: 'completed',
      });
    });

    expect(mockRequestThreadLiveRefresh).toHaveBeenCalledWith('thread-B', 'panels', 'queue_completed');
  });

  it('debug API stays unmounted by default (P0: default disabled)', () => {
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    expect((window as typeof window & { __officeClawDebug?: unknown }).__officeClawDebug).toBeUndefined();
  });

  it('debug disabled: queue_updated does not read thread snapshot metadata', () => {
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('queue_updated', {
        threadId: 'thread-B',
        queue: [{ id: 'q1', status: 'processing' }],
        action: 'processing',
      });
    });

    expect(mockGetThreadState).not.toHaveBeenCalled();
  });

  it('debug disabled: queue_paused with malformed queue payload does not throw', () => {
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    expect(() => {
      act(() => {
        simulateServerEvent('queue_paused', {
          threadId: 'thread-B',
          reason: 'failed',
          queue: [null],
        });
      });
    }).not.toThrow();

    expect(mockSetQueue).toHaveBeenCalledWith('thread-B', [null]);
    expect(mockSetQueuePaused).toHaveBeenCalledWith('thread-B', true, 'failed');
  });

  it('debug enabled: non-array queue payload does not crash debug mapping', () => {
    window.sessionStorage.setItem(invocationDebugConstants.STORAGE_KEY, '1');
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    const debugApi = (window as typeof window & { __officeClawDebug?: WindowDebugApi }).__officeClawDebug;
    expect(debugApi).toBeDefined();

    expect(() => {
      act(() => {
        simulateServerEvent('queue_updated', {
          threadId: 'thread-B',
          queue: {} as unknown as unknown[],
          action: 'processing',
        });
      });
    }).not.toThrow();

    const dump = JSON.parse(debugApi!.dump({ rawThreadId: true })) as {
      events: Array<Record<string, unknown>>;
    };
    const event = dump.events.find((item) => item.event === 'queue_updated');
    expect(event?.queueLength).toBe(0);
    expect(event?.queueStatuses).toEqual([]);
  });

  it('debug dump masks threadId by default and strips blocked fields', () => {
    window.sessionStorage.setItem(invocationDebugConstants.STORAGE_KEY, '1');
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    const debugApi = (window as typeof window & { __officeClawDebug?: WindowDebugApi }).__officeClawDebug;
    expect(debugApi).toBeDefined();

    act(() => {
      simulateServerEvent('queue_updated', {
        threadId: 'thread-B',
        queue: [{ id: 'q1', status: 'processing', content: 'hidden' }],
        action: 'processing',
      });
    });

    const maskedDump = JSON.parse(debugApi!.dump()) as {
      meta: { marker: string; rawThreadId: boolean };
      events: Array<Record<string, unknown>>;
    };
    expect(maskedDump.meta.marker).toBe('MASKED');
    expect(maskedDump.meta.rawThreadId).toBe(false);
    const maskedEvent = maskedDump.events.find((event) => event.event === 'queue_updated');
    expect(maskedEvent?.threadId).not.toBe('thread-B');
    expect(maskedEvent?.content).toBeUndefined();
    expect(maskedEvent?.token).toBeUndefined();
    expect(maskedEvent?.headers).toBeUndefined();
    expect(maskedEvent?.userInput).toBeUndefined();

    const rawDump = JSON.parse(debugApi!.dump({ rawThreadId: true })) as {
      meta: { marker: string; rawThreadId: boolean };
      events: Array<Record<string, unknown>>;
    };
    expect(rawDump.meta.marker).toBe('RAW');
    expect(rawDump.meta.rawThreadId).toBe(true);
    const rawEvent = rawDump.events.find((event) => event.event === 'queue_updated');
    expect(rawEvent?.threadId).toBe('thread-B');
    expect(rawEvent?.hasActiveInvocation).toBe(true);
    expect(rawEvent?.queuePaused).toBe(false);
  });

  it('socket is NOT disconnected/reconnected when callbacks change (callbacksRef pattern)', () => {
    const callbacks1: SocketCallbacks = { onMessage: vi.fn() };
    const callbacks2: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks: callbacks1, threadId: 'thread-A' }));
    });

    const disconnectCallCount = (mockSocket.disconnect as ReturnType<typeof vi.fn>).mock.calls.length;

    // Re-render with different callbacks (simulates socketCallbacks useMemo rebuild)
    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks: callbacks2, threadId: 'thread-A' }));
    });

    // Socket should NOT have been disconnected
    expect((mockSocket.disconnect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(disconnectCallCount);
  });

  it('updated callbacks are used after re-render (ref stays fresh)', () => {
    mockStoreCurrentThreadId = 'thread-A';
    const onIntentMode1 = vi.fn();
    const onIntentMode2 = vi.fn();

    act(() => {
      root.render(
        React.createElement(HookWrapper, {
          callbacks: { onMessage: vi.fn(), onIntentMode: onIntentMode1 },
          threadId: 'thread-A',
        }),
      );
    });

    // Update callbacks (simulates thread switch causing useMemo rebuild)
    act(() => {
      root.render(
        React.createElement(HookWrapper, {
          callbacks: { onMessage: vi.fn(), onIntentMode: onIntentMode2 },
          threadId: 'thread-A',
        }),
      );
    });

    // Fire intent_mode — should use the LATEST callback (onIntentMode2)
    act(() => {
      simulateServerEvent('intent_mode', {
        threadId: 'thread-A',
        mode: 'execute',
        targetAgents: ['opus'],
      });
    });

    expect(onIntentMode1).not.toHaveBeenCalled();
    expect(onIntentMode2).toHaveBeenCalledTimes(1);
  });

  it('rejoins persisted thread rooms on connect after refresh', () => {
    window.sessionStorage.setItem(
      'office-claw:ws:joined-rooms:v1:test-user',
      JSON.stringify(['thread:thread-A', 'thread:thread-B']),
    );

    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    const emitMock = mockSocket.emit as unknown as ReturnType<typeof vi.fn>;
    emitMock.mockClear();

    act(() => {
      simulateServerEvent('connect', undefined);
    });

    const joinedRooms = emitMock.mock.calls.filter(([event]) => event === 'join_room').map(([, room]) => room);

    expect(new Set(joinedRooms)).toEqual(new Set(['thread:thread-A', 'thread:thread-B']));
  });

  it('requests active-thread message refresh on reconnect (draft rehydrate)', () => {
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('connect', undefined);
    });

    expect(mockRequestThreadLiveRefresh).toHaveBeenCalledWith('thread-B', 'messages', 'socket-reconnect');
  });

  it('rejoins watched background thread rooms on connect', () => {
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(
        React.createElement(HookWrapper, {
          callbacks,
          threadId: 'thread-B',
          watchedThreadIds: ['thread-A', 'thread-C', 'thread-B'],
        }),
      );
    });

    const emitMock = mockSocket.emit as unknown as ReturnType<typeof vi.fn>;
    emitMock.mockClear();

    act(() => {
      simulateServerEvent('connect', undefined);
    });

    const joinedRooms = emitMock.mock.calls.filter(([event]) => event === 'join_room').map(([, room]) => room);

    expect(new Set(joinedRooms)).toEqual(new Set(['thread:thread-A', 'thread:thread-B', 'thread:thread-C']));
  });


  it('does not restore rooms persisted by another user id', () => {
    window.sessionStorage.setItem('office-claw:ws:joined-rooms:v1:alice', JSON.stringify(['thread:alice-secret']));
    window.sessionStorage.setItem('office-claw:ws:joined-rooms:v1:bob', JSON.stringify(['thread:bob-work']));
    mockUserId = 'bob';

    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    const emitMock = mockSocket.emit as unknown as ReturnType<typeof vi.fn>;
    emitMock.mockClear();

    act(() => {
      simulateServerEvent('connect', undefined);
    });

    const joinedRooms = emitMock.mock.calls.filter(([event]) => event === 'join_room').map(([, room]) => room);

    expect(new Set(joinedRooms)).toEqual(new Set(['thread:bob-work', 'thread:thread-B']));
  });

  it('connector_message from active thread is appended immediately (no F5 needed)', () => {
    mockStoreCurrentThreadId = 'thread-B';
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('connector_message', {
        threadId: 'thread-B',
        message: {
          id: 'conn-1',
          type: 'connector',
          content: '**GitHub Review 通知**',
          source: { connector: 'github-review', label: 'GitHub Review', icon: '🔔' },
          timestamp: Date.now(),
        },
      });
    });

    expect(mockAddMessageToThread).toHaveBeenCalledTimes(1);
    expect(mockAddMessageToThread).toHaveBeenCalledWith(
      'thread-B',
      expect.objectContaining({ id: 'conn-1', type: 'connector' }),
    );
  });

  it('connector_message from background thread is added to that thread state', () => {
    mockStoreCurrentThreadId = 'thread-B';
    const callbacks: SocketCallbacks = { onMessage: vi.fn() };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-B' }));
    });

    act(() => {
      simulateServerEvent('connector_message', {
        threadId: 'thread-A',
        message: {
          id: 'conn-bg-1',
          type: 'connector',
          content: '**GitHub Review 通知**',
          source: { connector: 'github-review', label: 'GitHub Review', icon: '🔔' },
          timestamp: Date.now(),
        },
      });
    });

    expect(mockAddMessageToThread).toHaveBeenCalledTimes(1);
    expect(mockAddMessageToThread).toHaveBeenCalledWith(
      'thread-A',
      expect.objectContaining({ id: 'conn-bg-1', type: 'connector' }),
    );
  });

  it('connector_message from weixin is treated as a user bubble', () => {
    mockStoreCurrentThreadId = 'thread-A';
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode: vi.fn(),
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-A' }));
    });

    act(() => {
      simulateServerEvent('connector_message', {
        threadId: 'thread-A',
        message: {
          id: 'conn-1',
          type: 'connector',
          content: '来自微信的提问',
          source: { connector: 'weixin', label: '微信', icon: '/images/connectors/weixin.png' },
          timestamp: Date.now(),
        },
      });
    });

    expect(mockAddMessageToThread).toHaveBeenCalledWith(
      'thread-A',
      expect.objectContaining({
        id: 'conn-1',
        type: 'user',
        content: '来自微信的提问',
      }),
    );
  });

  it('connector_message from xiaoyi is treated as a user bubble', () => {
    mockStoreCurrentThreadId = 'thread-A';
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode: vi.fn(),
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-A' }));
    });

    act(() => {
      simulateServerEvent('connector_message', {
        threadId: 'thread-A',
        message: {
          id: 'conn-xiaoyi-1',
          type: 'connector',
          content: '来自小艺的提问',
          source: { connector: 'xiaoyi', label: '小艺', icon: '/images/connectors/xiaoyi.png' },
          timestamp: Date.now(),
        },
      });
    });

    expect(mockAddMessageToThread).toHaveBeenCalledWith(
      'thread-A',
      expect.objectContaining({
        id: 'conn-xiaoyi-1',
        type: 'user',
        content: '来自小艺的提问',
      }),
    );
  });

  it('connector_message from github-review remains a connector bubble', () => {
    mockStoreCurrentThreadId = 'thread-A';
    const callbacks: SocketCallbacks = {
      onMessage: vi.fn(),
      onIntentMode: vi.fn(),
    };

    act(() => {
      root.render(React.createElement(HookWrapper, { callbacks, threadId: 'thread-A' }));
    });

    act(() => {
      simulateServerEvent('connector_message', {
        threadId: 'thread-A',
        message: {
          id: 'conn-2',
          type: 'connector',
          content: 'PR review requested',
          source: { connector: 'github-review', label: 'GitHub Review', icon: 'github' },
          timestamp: Date.now(),
        },
      });
    });

    expect(mockAddMessageToThread).toHaveBeenCalledWith(
      'thread-A',
      expect.objectContaining({
        id: 'conn-2',
        type: 'connector',
        content: 'PR review requested',
      }),
    );
  });
});
