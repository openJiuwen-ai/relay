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
const mockUpsertPptStudioSlides = vi.fn();
const mockSetPptStudioStatus = vi.fn();

const storeState = {
  messages: [] as Array<{
    id: string;
    type: string;
    agentId?: string;
    content: string;
    origin?: 'stream' | 'callback';
    isStreaming?: boolean;
    timestamp: number;
  }>,
  agentInvocations: {} as Record<string, unknown>,
  addMessage: mockAddMessage,
  removeMessage: vi.fn(),
  appendToMessage: mockAppendToMessage,
  appendToolEvent: mockAppendToolEvent,
  appendRichBlock: mockAppendRichBlock,
  replaceMessageId: vi.fn(),
  patchMessage: vi.fn(),
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
  upsertPptStudioSlides: mockUpsertPptStudioSlides,
  setPptStudioStatus: mockSetPptStudioStatus,
  currentThreadId: 'thread-1',
  getThreadState: vi.fn(() => ({ messages: [], agentStatuses: {}, agentInvocations: {} })),
  addMessageToThread: vi.fn(),
  clearThreadActiveInvocation: vi.fn(),
  resetThreadInvocationState: vi.fn(),
  setThreadMessageStreaming: vi.fn(),
};

let captured: ReturnType<typeof useAgentMessages> | undefined;

vi.mock('@/stores/chatStore', () => {
  const useChatStoreMock = Object.assign(() => storeState, { getState: () => storeState });
  return {
    useChatStore: useChatStoreMock,
  };
});

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages ppt studio system_info', () => {
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
    mockAppendToMessage.mockClear();
    mockUpsertPptStudioSlides.mockClear();
    mockSetPptStudioStatus.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('consumes ppt_studio_page updates without creating a visible system bubble', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'codex',
        content: JSON.stringify({
          type: 'ppt_studio_page',
          session: {
            pagesDir: 'output/demo/pages',
            deckTitle: 'Demo deck',
            slides: [{ slideId: 'slide-1', pageNumber: 1, htmlPath: 'output/demo/pages/page-1.pptx.html' }],
          },
        }),
      });
    });

    expect(mockUpsertPptStudioSlides).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        pagesDir: 'output/demo/pages',
        deckTitle: 'Demo deck',
        slides: [{ slideId: 'slide-1', pageNumber: 1, htmlPath: 'output/demo/pages/page-1.pptx.html' }],
      }),
    );
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('does not append a ppt preview marker to the active stream on the first generated html page', () => {
    storeState.messages = [
      {
        id: 'msg-stream-codex',
        type: 'assistant',
        agentId: 'codex',
        content: '正在生成 PPT',
        origin: 'stream',
        isStreaming: true,
        timestamp: Date.now(),
      },
    ];

    act(() => {
      root.render(React.createElement(Harness));
    });

    const firstPagePayload = {
      type: 'ppt_studio_page',
      pagesDir: 'output/demo/pages',
      deckTitle: 'Demo deck',
      slideId: 'slide-1',
      pageNumber: 1,
      htmlPath: 'output/demo/pages/page-1.pptx.html',
    };

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'codex',
        content: JSON.stringify(firstPagePayload),
      });
    });

    expect(mockUpsertPptStudioSlides).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        pagesDir: 'output/demo/pages',
        slides: [expect.objectContaining({ slideId: 'slide-1', pageNumber: 1 })],
      }),
    );
    expect(mockAppendToMessage).not.toHaveBeenCalled();

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'codex',
        content: JSON.stringify({
          ...firstPagePayload,
          slideId: 'slide-2',
          pageNumber: 2,
          htmlPath: 'output/demo/pages/page-2.pptx.html',
        }),
      });
    });

    expect(mockAppendToMessage).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('consumes ppt_studio_export updates without creating a visible system bubble', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        agentId: 'codex',
        content: JSON.stringify({
          type: 'ppt_studio_export',
          status: 'exporting',
        }),
      });
    });

    expect(mockSetPptStudioStatus).toHaveBeenCalledWith('thread-1', 'exporting');
    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});
