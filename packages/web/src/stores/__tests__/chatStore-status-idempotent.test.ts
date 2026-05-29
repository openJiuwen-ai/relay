/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THREAD_STATE } from '../chat-types';
import { useChatStore } from '../chatStore';

/**
 * Issue #84 — setAgentStatus high-frequency "stack explosion"
 *
 * Root cause: setAgentStatus creates a new agentStatuses object reference on every call,
 * even when the status hasn't changed. During SSE streaming, each text/tool_use/tool_result
 * chunk calls setAgentStatus(agentId, 'streaming'), producing hundreds of unnecessary
 * Zustand state updates → React re-renders.
 *
 * Fix: bail out (return unchanged state) when agentStatuses[agentId] === status already.
 */
describe('setAgentStatus idempotent guard (#84)', () => {
  beforeEach(() => {
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
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentThreadId: 'thread-1',
      activeInvocations: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the SAME agentStatuses reference when status is unchanged', () => {
    const { setAgentStatus } = useChatStore.getState();

    // First call — sets to 'streaming'
    setAgentStatus('opus', 'streaming');
    const ref1 = useChatStore.getState().agentStatuses;
    expect(ref1.opus).toBe('streaming');

    // Second call — same agentId + same status → should NOT create new object
    setAgentStatus('opus', 'streaming');
    const ref2 = useChatStore.getState().agentStatuses;

    expect(ref2.opus).toBe('streaming');
    // Key assertion: reference equality means Zustand subscribers won't re-render
    expect(ref2).toBe(ref1);
  });

  it('DOES create a new reference when status actually changes', () => {
    const { setAgentStatus } = useChatStore.getState();

    setAgentStatus('opus', 'streaming');
    const ref1 = useChatStore.getState().agentStatuses;

    setAgentStatus('opus', 'done');
    const ref2 = useChatStore.getState().agentStatuses;

    expect(ref2.opus).toBe('done');
    // Status changed, so new reference is expected
    expect(ref2).not.toBe(ref1);
  });

  it('DOES create a new reference when setting a different cat', () => {
    const { setAgentStatus } = useChatStore.getState();

    setAgentStatus('opus', 'streaming');
    const ref1 = useChatStore.getState().agentStatuses;

    setAgentStatus('codex', 'streaming');
    const ref2 = useChatStore.getState().agentStatuses;

    expect(ref2.codex).toBe('streaming');
    expect(ref2.opus).toBe('streaming');
    // Different cat, so new reference is expected
    expect(ref2).not.toBe(ref1);
  });

  it('does not trigger Zustand listeners on idempotent calls', () => {
    const { setAgentStatus } = useChatStore.getState();

    setAgentStatus('opus', 'streaming');

    const listener = vi.fn();
    const unsub = useChatStore.subscribe(listener);

    // 100 rapid-fire calls with same status — should trigger ZERO listener calls
    for (let i = 0; i < 100; i++) {
      setAgentStatus('opus', 'streaming');
    }

    expect(listener).not.toHaveBeenCalled();
    unsub();
  });
});

describe('updateThreadAgentStatus idempotent guard (#84)', () => {
  beforeEach(() => {
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
        'bg-thread': { ...DEFAULT_THREAD_STATE, lastActivity: Date.now() },
      },
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentThreadId: 'thread-1',
      activeInvocations: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns same threadStates reference for background thread when status unchanged', () => {
    const { updateThreadAgentStatus } = useChatStore.getState();

    updateThreadAgentStatus('bg-thread', 'opus', 'streaming');
    const ref1 = useChatStore.getState().threadStates;

    updateThreadAgentStatus('bg-thread', 'opus', 'streaming');
    const ref2 = useChatStore.getState().threadStates;

    expect(ref2['bg-thread']?.agentStatuses?.opus).toBe('streaming');
    expect(ref2).toBe(ref1);
  });

  it('returns same agentStatuses reference for active thread when status unchanged', () => {
    const { updateThreadAgentStatus } = useChatStore.getState();

    updateThreadAgentStatus('thread-1', 'opus', 'streaming');
    const ref1 = useChatStore.getState().agentStatuses;

    updateThreadAgentStatus('thread-1', 'opus', 'streaming');
    const ref2 = useChatStore.getState().agentStatuses;

    expect(ref2.opus).toBe('streaming');
    expect(ref2).toBe(ref1);
  });
});
