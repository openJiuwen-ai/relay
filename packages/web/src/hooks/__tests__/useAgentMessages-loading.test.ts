/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentMessages } from '@/hooks/useAgentMessages';

const mockAddMessage = vi.fn();
const mockAddToast = vi.fn();
const mockAppendToMessage = vi.fn();
const mockAppendToolEvent = vi.fn();
const mockSetStreaming = vi.fn();
const mockSetLoading = vi.fn();
const mockSetHasActiveInvocation = vi.fn();
const mockClearAllActiveInvocations = vi.fn(() => {
  mockSetHasActiveInvocation(false);
});
const mockRemoveActiveInvocation = vi.fn((invocationId: string) => {
  const { [invocationId]: _removed, ...rest } = storeState.activeInvocations;
  storeState.activeInvocations = rest;
  if (Object.keys(rest).length === 0) {
    mockSetHasActiveInvocation(false);
  }
});
const mockSetIntentMode = vi.fn();
const mockSetAgentStatus = vi.fn();
const mockClearAgentStatuses = vi.fn();
const mockSetCatInvocation = vi.fn();
const mockSetMessageUsage = vi.fn();
const mockRequestStreamCatchUp = vi.fn();

const mockAddMessageToThread = vi.fn();
const mockClearThreadActiveInvocation = vi.fn();
const mockResetThreadInvocationState = vi.fn();
const mockSetThreadMessageStreaming = vi.fn();
const mockGetThreadState: ReturnType<
  typeof vi.fn<
    (tid?: string) => {
      messages: Array<{
        id: string;
        type: string;
        agentId?: string;
        content: string;
        isStreaming?: boolean;
        timestamp: number;
      }>;
    }
  >
> = vi.fn(() => ({
  messages: [] as Array<{
    id: string;
    type: string;
    agentId?: string;
    content: string;
    isStreaming?: boolean;
    timestamp: number;
  }>,
}));

const storeState = {
  messages: [] as Array<{
    id: string;
    type: string;
    agentId?: string;
    content: string;
    isStreaming?: boolean;
    timestamp: number;
  }>,
  addMessage: mockAddMessage,
  appendToMessage: mockAppendToMessage,
  appendToolEvent: mockAppendToolEvent,
  setStreaming: mockSetStreaming,
  setLoading: mockSetLoading,
  setHasActiveInvocation: mockSetHasActiveInvocation,
  removeActiveInvocation: mockRemoveActiveInvocation,
  clearAllActiveInvocations: mockClearAllActiveInvocations,
  setIntentMode: mockSetIntentMode,
  setAgentStatus: mockSetAgentStatus,
  clearAgentStatuses: mockClearAgentStatuses,
  setAgentInvocation: mockSetCatInvocation,
  setMessageUsage: mockSetMessageUsage,
  requestStreamCatchUp: mockRequestStreamCatchUp,
  activeInvocations: {} as Record<string, { agentId: string; mode: string }>,

  addMessageToThread: mockAddMessageToThread,
  clearThreadActiveInvocation: mockClearThreadActiveInvocation,
  resetThreadInvocationState: mockResetThreadInvocationState,
  setThreadMessageStreaming: mockSetThreadMessageStreaming,
  getThreadState: mockGetThreadState,
  currentThreadId: 'thread-1',
};

let captured: ReturnType<typeof useAgentMessages> | undefined;

vi.mock('@/stores/chatStore', () => {
  const useChatStoreMock = Object.assign(() => storeState, { getState: () => storeState });
  return {
    useChatStore: useChatStoreMock,
  };
});

vi.mock('@/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mockAddToast,
    }),
  },
}));

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages loading lifecycle', () => {
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
    captured = undefined;
    storeState.messages = [];
    mockAddMessage.mockClear();
    mockAddToast.mockClear();
    mockAppendToMessage.mockClear();
    mockAppendToolEvent.mockClear();
    mockSetStreaming.mockClear();
    mockSetLoading.mockClear();
    mockSetHasActiveInvocation.mockClear();
    mockRemoveActiveInvocation.mockClear();
    mockClearAllActiveInvocations.mockClear();
    mockSetIntentMode.mockClear();
    mockSetAgentStatus.mockClear();
    mockClearAgentStatuses.mockClear();
    mockSetCatInvocation.mockClear();
    mockSetMessageUsage.mockClear();

    mockAddMessageToThread.mockClear();
    mockClearThreadActiveInvocation.mockClear();
    mockResetThreadInvocationState.mockClear();
    mockSetThreadMessageStreaming.mockClear();
    mockGetThreadState.mockClear();
    mockGetThreadState.mockImplementation(() => ({ messages: [] }));
    storeState.activeInvocations = {};
    storeState.currentThreadId = 'thread-1';
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('clears loading when final done is received', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(captured).toBeTruthy();
    act(() => {
      captured?.handleAgentMessage({
        type: 'done',
        agentId: 'codex',
        isFinal: true,
      });
    });

    expect(mockSetLoading).toHaveBeenCalledWith(false);
    expect(mockSetHasActiveInvocation).toHaveBeenCalledWith(false);
    expect(mockSetIntentMode).toHaveBeenCalledWith(null);
    expect(mockClearAgentStatuses).toHaveBeenCalled();
  });

  it('clears hasActiveInvocation on error with isFinal', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'opus',
        error: 'something broke',
        isFinal: true,
      });
    });

    expect(mockSetLoading).toHaveBeenCalledWith(false);
    expect(mockSetHasActiveInvocation).toHaveBeenCalledWith(false);
    expect(mockSetIntentMode).toHaveBeenCalledWith(null);
    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'opus 出错',
      message: '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('closes existing streaming bubble on done even when activeRefs are empty', () => {
    storeState.messages = [
      {
        id: 'bg-msg-1',
        type: 'assistant',
        agentId: 'codex',
        content: 'partial',
        isStreaming: true,
        timestamp: Date.now(),
      },
    ];

    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'done',
        agentId: 'codex',
      });
    });

    expect(mockSetStreaming).toHaveBeenCalledWith('bg-msg-1', false);
  });

  it('ignores agent messages from a different thread', () => {
    storeState.currentThreadId = 'thread-B';

    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        agentId: 'codex',
        threadId: 'thread-A',
        content: 'should be ignored',
      });
    });

    expect(mockSetAgentStatus).not.toHaveBeenCalled();
    expect(mockAppendToMessage).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('keeps handleAgentMessage stable when only messages change', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    const firstHandler = captured?.handleAgentMessage;
    expect(firstHandler).toBeTruthy();

    storeState.messages = [
      {
        id: 'msg-new',
        type: 'assistant',
        agentId: 'codex',
        content: 'delta',
        isStreaming: true,
        timestamp: Date.now(),
      },
    ];

    act(() => {
      root.render(React.createElement(Harness));
    });

    expect(captured?.handleAgentMessage).toBe(firstHandler);
  });

  it('routes timeout to original thread after switching active thread', () => {
    vi.useFakeTimers();
    try {
      act(() => {
        root.render(React.createElement(Harness));
      });

      act(() => {
        captured?.handleAgentMessage({
          type: 'text',
          agentId: 'codex',
          content: 'partial',
        });
      });

      // Simulate user switching from thread-1 to thread-2 while old invocation is still active.
      storeState.currentThreadId = 'thread-2';

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(mockAddMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          content: '⏱ Response timed out. The operation may still be running in the background.',
        }),
      );
      expect(mockAddMessageToThread).toHaveBeenCalledWith(
        'thread-1',
        expect.objectContaining({
          type: 'system',
          variant: 'info',
          content: '⏱ Response timed out. The operation may still be running in the background.',
        }),
      );
      expect(mockResetThreadInvocationState).toHaveBeenCalledWith('thread-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stopping a background thread does not clear active thread invocation state', () => {
    const cancelInvocation = vi.fn();
    mockGetThreadState.mockImplementation((tid?: string) => {
      if (tid === 'thread-2') {
        return {
          messages: [
            {
              id: 'bg-stream-1',
              type: 'assistant',
              agentId: 'opus',
              content: 'running',
              isStreaming: true,
              timestamp: Date.now(),
            },
          ],
        };
      }
      return { messages: [] };
    });

    act(() => {
      root.render(React.createElement(Harness));
    });

    // Seed activeRefs with an active-thread stream.
    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        agentId: 'codex',
        content: 'active stream chunk',
      });
    });

    act(() => {
      captured?.handleStop(cancelInvocation, 'thread-2');
    });

    expect(cancelInvocation).toHaveBeenCalledWith('thread-2');
    expect(mockResetThreadInvocationState).toHaveBeenCalledWith('thread-2');
    expect(mockSetThreadMessageStreaming).toHaveBeenCalledWith('thread-2', 'bg-stream-1', false);

    // Active thread state must remain untouched.
    expect(mockSetLoading).not.toHaveBeenCalledWith(false);
    expect(mockSetHasActiveInvocation).not.toHaveBeenCalledWith(false);
    expect(mockSetIntentMode).not.toHaveBeenCalledWith(null);
    expect(mockClearAgentStatuses).not.toHaveBeenCalled();
    expect(mockSetStreaming).not.toHaveBeenCalled();
  });

  it('stopping a background thread clears its pending timeout guard', () => {
    vi.useFakeTimers();
    try {
      const cancelInvocation = vi.fn();

      act(() => {
        root.render(React.createElement(Harness));
      });

      // Arm timeout for thread-1.
      act(() => {
        captured?.handleAgentMessage({
          type: 'text',
          agentId: 'codex',
          content: 'partial',
        });
      });

      // Switch active thread, then stop the old thread from split-pane context.
      storeState.currentThreadId = 'thread-2';
      act(() => {
        captured?.handleStop(cancelInvocation, 'thread-1');
      });

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(mockAddMessageToThread).not.toHaveBeenCalledWith(
        'thread-1',
        expect.objectContaining({
          content: '⏱ Response timed out. The operation may still be running in the background.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stopping another thread does not clear active thread timeout guard', () => {
    vi.useFakeTimers();
    try {
      const cancelInvocation = vi.fn();

      act(() => {
        root.render(React.createElement(Harness));
      });

      // Arm timeout for thread-1.
      act(() => {
        captured?.handleAgentMessage({
          type: 'text',
          agentId: 'codex',
          content: 'thread-1 partial',
        });
      });

      // Switch to thread-2 and arm its timeout.
      storeState.currentThreadId = 'thread-2';
      act(() => {
        captured?.handleAgentMessage({
          type: 'text',
          agentId: 'codex',
          content: 'thread-2 partial',
        });
      });

      // Stop old thread-1 from split-pane context.
      act(() => {
        captured?.handleStop(cancelInvocation, 'thread-1');
      });

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '⏱ Response timed out. The operation may still be running in the background.',
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops late non-done events from cancelled invocations after stop, while still allowing done cleanup', () => {
    const cancelInvocation = vi.fn();
    storeState.activeInvocations = {
      'inv-old-1': { agentId: 'codex', mode: 'chat' },
      'inv-old-2': { agentId: 'opus', mode: 'chat' },
    };

    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleStop(cancelInvocation, 'thread-1');
    });

    expect(cancelInvocation).toHaveBeenCalledWith('thread-1');
    expect(mockSetCatInvocation).toHaveBeenCalledWith('codex', { invocationId: undefined });
    expect(mockSetCatInvocation).toHaveBeenCalledWith('opus', { invocationId: undefined });
    storeState.activeInvocations = {};

    mockSetAgentStatus.mockClear();
    mockAddMessage.mockClear();
    mockAppendToMessage.mockClear();

    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        agentId: 'codex',
        content: 'late stale chunk',
        invocationId: 'inv-old-1',
      });
    });

    expect(mockSetAgentStatus).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAppendToMessage).not.toHaveBeenCalled();

    mockSetAgentStatus.mockClear();
    mockSetLoading.mockClear();
    mockSetIntentMode.mockClear();
    mockClearAgentStatuses.mockClear();
    mockSetHasActiveInvocation.mockClear();

    act(() => {
      captured?.handleAgentMessage({
        type: 'done',
        agentId: 'codex',
        invocationId: 'inv-old-1',
        isFinal: true,
      });
    });

    expect(mockSetAgentStatus).toHaveBeenCalledWith('codex', 'done');
    expect(mockSetLoading).toHaveBeenCalledWith(false);
    expect(mockSetIntentMode).toHaveBeenCalledWith(null);
    expect(mockClearAgentStatuses).toHaveBeenCalled();
  });

  it('cleans timeout guard on unmount to prevent stale timeout side effects', () => {
    vi.useFakeTimers();
    try {
      act(() => {
        root.render(React.createElement(Harness));
      });

      // Arm the done-timeout guard.
      act(() => {
        captured?.handleAgentMessage({
          type: 'text',
          agentId: 'codex',
          content: 'partial',
        });
      });

      // Unmount hook instance (e.g. HMR / remount path).
      act(() => {
        root.render(null);
      });

      mockAddMessage.mockClear();
      mockAddMessageToThread.mockClear();
      mockSetLoading.mockClear();
      mockSetHasActiveInvocation.mockClear();
      mockSetIntentMode.mockClear();
      mockClearAgentStatuses.mockClear();

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      expect(mockAddMessage).not.toHaveBeenCalled();
      expect(mockAddMessageToThread).not.toHaveBeenCalled();
      expect(mockSetLoading).not.toHaveBeenCalled();
      expect(mockSetHasActiveInvocation).not.toHaveBeenCalled();
      expect(mockSetIntentMode).not.toHaveBeenCalled();
      expect(mockClearAgentStatuses).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes existing streaming bubble on error even when activeRefs are empty', () => {
    storeState.messages = [
      {
        id: 'bg-msg-err',
        type: 'assistant',
        agentId: 'opus',
        content: 'partial',
        isStreaming: true,
        timestamp: Date.now(),
      },
    ];

    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'opus',
        error: 'failed',
      });
    });

    expect(mockSetStreaming).toHaveBeenCalledWith('bg-msg-err', false);
  });

  it('rewrites dare cli timeout to a toast fallback', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'dare',
        content: JSON.stringify({
          type: 'timeout_diagnostics',
          silenceDurationMs: 1800000,
          processAlive: true,
          lastEventType: 'tool.invoke',
        }),
      });
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'dare',
        error: 'DARE CLI 响应超时 (1800s)',
        metadata: { provider: 'dare', model: 'test/model' },
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'dare 出错',
      message: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('rewrites dare cli exit to a user-friendly toast fallback', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'dare',
        error: 'DARE CLI: CLI 异常退出 (code: 1, signal: none)',
        metadata: { provider: 'dare', model: 'test/model' },
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'dare 出错',
      message: '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('rewrites jiuwen timeout to a user-friendly toast fallback', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'jiuwenclaw',
        error: 'jiuwen request timed out before completion',
        metadata: { provider: 'relayclaw', model: 'test/model' },
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'jiuwenclaw 出错',
      message: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('rewrites jiuwen connection failure to a user-friendly toast fallback', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'jiuwenclaw',
        error: 'jiuwen connection failed: sidecar exited during startup',
        metadata: { provider: 'relayclaw', model: 'test/model' },
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'jiuwenclaw 出错',
      message: '当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：jiuwen connection failed: sidecar exited during startup',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('rewrites unknown errors to a generic toast fallback instead of raw error text', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'opus',
        error: 'unrecognized low-level failure details',
        metadata: { provider: 'claude', model: 'test/model' },
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: 'opus 出错',
      message: '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。',
      threadId: 'thread-1',
      duration: 8000,
    });
  });

  it('system_info context_health without parsed agentId falls back to msg.agentId', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    const payload = JSON.stringify({
      type: 'context_health',
      health: {
        usedTokens: 10,
        windowTokens: 200000,
        fillRatio: 0.00005,
        source: 'exact',
        measuredAt: Date.now(),
      },
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'opus',
        content: payload,
      });
    });

    expect(mockSetCatInvocation).toHaveBeenCalledWith(
      'opus',
      expect.objectContaining({
        contextHealth: expect.objectContaining({ usedTokens: 10, windowTokens: 200000 }),
      }),
    );
    expect(mockSetCatInvocation).not.toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('consumes system_info rate_limit silently (no raw JSON system bubble)', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    const payload = JSON.stringify({
      type: 'rate_limit',
      agentId: 'opus',
      utilization: 0.87,
      resetsAt: '2026-02-28T12:00:00Z',
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'opus',
        content: payload,
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockSetCatInvocation).toHaveBeenCalledWith(
      'opus',
      expect.objectContaining({
        rateLimit: expect.objectContaining({ utilization: 0.87, resetsAt: '2026-02-28T12:00:00Z' }),
      }),
    );
  });

  it('consumes system_info compact_boundary silently (no raw JSON system bubble)', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    const payload = JSON.stringify({
      type: 'compact_boundary',
      agentId: 'opus',
      preTokens: 42000,
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'opus',
        content: payload,
      });
    });

    expect(mockAddMessage).not.toHaveBeenCalled();
    expect(mockSetCatInvocation).toHaveBeenCalledWith(
      'opus',
      expect.objectContaining({
        compactBoundary: expect.objectContaining({ preTokens: 42000 }),
      }),
    );
  });
});
