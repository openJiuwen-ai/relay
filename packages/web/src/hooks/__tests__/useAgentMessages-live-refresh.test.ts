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
const mockAppendToMessage = vi.fn();
const mockAppendToolEvent = vi.fn();
const mockAppendRichBlock = vi.fn();
const mockPatchMessage = vi.fn();
const mockReplaceMessageId = vi.fn();
const mockSetStreaming = vi.fn();
const mockSetLoading = vi.fn();
const mockSetHasActiveInvocation = vi.fn();
const mockRemoveActiveInvocation = vi.fn();
const mockClearAllActiveInvocations = vi.fn();
const mockSetIntentMode = vi.fn();
const mockSetAgentStatus = vi.fn();
const mockClearAgentStatuses = vi.fn();
const mockSetCatInvocation = vi.fn();
const mockSetMessageUsage = vi.fn();
const mockSetMessageMetadata = vi.fn();
const mockSetMessageThinking = vi.fn();
const mockSetMessageStreamInvocation = vi.fn();
const mockRequestStreamCatchUp = vi.fn();
const mockRemoveMessage = vi.fn();
const mockRequestThreadLiveRefresh = vi.fn();

const storeState = {
  messages: [] as Array<{
    id: string;
    type: string;
    agentId?: string;
    content: string;
    origin?: 'stream' | 'callback';
    isStreaming?: boolean;
    timestamp: number;
    extra?: { stream?: { invocationId?: string } };
  }>,
  activeInvocations: {} as Record<string, { agentId: string; mode: string }>,
  agentInvocations: {} as Record<string, { invocationId?: string; taskProgress?: { tasks: unknown[] } }>,
  currentThreadId: 'thread-live',
  addMessage: mockAddMessage,
  appendToMessage: mockAppendToMessage,
  appendToolEvent: mockAppendToolEvent,
  appendRichBlock: mockAppendRichBlock,
  patchMessage: mockPatchMessage,
  replaceMessageId: mockReplaceMessageId,
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
  setMessageMetadata: mockSetMessageMetadata,
  setMessageThinking: mockSetMessageThinking,
  setMessageStreamInvocation: mockSetMessageStreamInvocation,
  requestStreamCatchUp: mockRequestStreamCatchUp,
  removeMessage: mockRemoveMessage,
  getThreadState: vi.fn(() => ({
    messages: [],
    hasActiveInvocation: false,
  })),
  addMessageToThread: vi.fn(),
  clearThreadActiveInvocation: vi.fn(),
  resetThreadInvocationState: vi.fn(),
  setThreadMessageStreaming: vi.fn(),
};

let captured: ReturnType<typeof useAgentMessages> | undefined;

vi.mock('@/hooks/thread-live-refresh', () => ({
  requestThreadLiveRefresh: (...args: unknown[]) => mockRequestThreadLiveRefresh(...args),
}));

vi.mock('@/stores/chatStore', () => {
  const useChatStoreMock = Object.assign(() => storeState, {
    getState: () => storeState,
  });
  return { useChatStore: useChatStoreMock };
});

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages live refresh triggers', () => {
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
    storeState.activeInvocations = {};
    storeState.agentInvocations = {};
    storeState.currentThreadId = 'thread-live';
    mockAddMessage.mockReset();
    mockAddMessage.mockImplementation((message) => {
      storeState.messages = [...storeState.messages, message];
    });
    mockPatchMessage.mockReset();
    mockRequestThreadLiveRefresh.mockReset();
    mockSetAgentStatus.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('requests a message refresh after callback speech arrives', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        agentId: 'codex',
        origin: 'callback',
        content: 'callback reply',
        timestamp: Date.now(),
      });
    });

    expect(mockRequestThreadLiveRefresh).toHaveBeenCalledWith('thread-live', 'messages', 'callback_message');
  });

  it('requests a panel refresh after final done arrives', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'done',
        agentId: 'codex',
        isFinal: true,
        timestamp: Date.now(),
      });
    });

    expect(mockRequestThreadLiveRefresh).toHaveBeenCalledWith('thread-live', 'panels', 'done_final');
  });
});
