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
const mockReplaceMessageId = vi.fn();
const mockPatchMessage = vi.fn();
const mockRemoveMessage = vi.fn();
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
const mockAddToast = vi.fn();
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

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
  appendRichBlock: mockAppendRichBlock,
  replaceMessageId: mockReplaceMessageId,
  patchMessage: mockPatchMessage,
  removeMessage: mockRemoveMessage,
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
  currentThreadId: 'thread-1',
  activeInvocations: {},
  agentInvocations: {},
  getThreadState: vi.fn(() => ({ messages: [], activeInvocations: {}, agentInvocations: {} })),
};

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

let captured: ReturnType<typeof useAgentMessages> | undefined;

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages error toast fallback', () => {
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
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockAddMessage.mockClear();
    mockAddToast.mockClear();
    mockSetAgentStatus.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleWarnSpy.mockRestore();
  });

  it('pushes a sensitive-input toast for active-thread error events', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'codex',
        errorCode: 'ModelArts.81011',
        error: 'Input text May contain sensitive information, please try again.',
        isFinal: true,
      });
    });

    expect(mockSetAgentStatus).toHaveBeenCalledWith('codex', 'error');
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: '检测到敏感词',
      message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
      threadId: 'thread-1',
      duration: 8000,
    });
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('pushes a fixed system bubble for temporary rate-limit error events', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'codex',
        errorCode: 'ModelArts.81101',
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests, the rate limit is 2000000 tokens per minute.', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests, the rate limit is 2000000 tokens per minute.'}",
        isFinal: true,
      });
    });

    expect(mockSetAgentStatus).toHaveBeenCalledWith('codex', 'error');
    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system',
        variant: 'error',
        content: '当前请求较多，模型暂时限流，请稍后重试。',
      }),
    );
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('pushes a fixed system bubble for daily quota exhaustion error events', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'codex',
        errorCode: 'APIG.0308',
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
        isFinal: true,
      });
    });

    expect(mockSetAgentStatus).toHaveBeenCalledWith('codex', 'error');
    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system',
        variant: 'error',
        content: `您好，截至目前您今日的免费模型使用额度已用尽。
如需继续使用服务，可选择[购买](https://console.huaweicloud.com/modelarts/?region=cn-southwest-2#/model-studio/deployment)华为云MaaS模型服务进行接入；或于次日再次访问，系统将为您重置免费额度。`,
      }),
    );
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('uses toast instead of assistant bubble for generic agent failures', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        agentId: 'codex',
        error: 'request timed out before completion',
        isFinal: true,
      });
    });

    expect(mockSetAgentStatus).toHaveBeenCalledWith('codex', 'error');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
        threadId: 'thread-1',
        duration: 8000,
      }),
    );
    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});
