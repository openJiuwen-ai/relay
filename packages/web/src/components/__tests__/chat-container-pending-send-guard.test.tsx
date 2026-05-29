/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';

const mockHandleSend = vi.fn();
const mockAwaitThreadRoom = vi.fn();
const mockConsumePendingNewThreadSend = vi.fn();

type MockStoreState = {
  messages: unknown[];
  hasActiveInvocation: boolean;
  intentMode: null;
  targetAgents: string[];
  agentStatuses: Record<string, string>;
  agentInvocations: Record<string, unknown>;
  setCurrentThread: ReturnType<typeof vi.fn>;
  viewMode: 'single';
  setViewMode: ReturnType<typeof vi.fn>;
  clearUnread: ReturnType<typeof vi.fn>;
  confirmUnreadAck: ReturnType<typeof vi.fn>;
  armUnreadSuppression: ReturnType<typeof vi.fn>;
  consumePendingNewThreadSend: ReturnType<typeof vi.fn>;
  setPendingChatInsert: ReturnType<typeof vi.fn>;
  uiThinkingExpandedByDefault: boolean;
  threads: Array<{ id: string; title?: string }>;
  setCurrentProject: ReturnType<typeof vi.fn>;
  showVoteModal: boolean;
  setShowVoteModal: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
  splitPaneThreadIds: string[];
  setSplitPaneThreadIds: ReturnType<typeof vi.fn>;
  setSplitPaneTarget: ReturnType<typeof vi.fn>;
};

const createMockStoreState = (): MockStoreState => ({
  messages: [],
  hasActiveInvocation: false,
  intentMode: null,
  targetAgents: [],
  agentStatuses: {},
  agentInvocations: {},
  setCurrentThread: vi.fn(),
  viewMode: 'single',
  setViewMode: vi.fn(),
  clearUnread: vi.fn(),
  confirmUnreadAck: vi.fn(),
  armUnreadSuppression: vi.fn(),
  consumePendingNewThreadSend: mockConsumePendingNewThreadSend,
  setPendingChatInsert: vi.fn(),
  uiThinkingExpandedByDefault: false,
  threads: [{ id: 'thread-1', title: 'Thread 1' }],
  setCurrentProject: vi.fn(),
  showVoteModal: false,
  setShowVoteModal: vi.fn(),
  addMessage: vi.fn(),
  splitPaneThreadIds: [],
  setSplitPaneThreadIds: vi.fn(),
  setSplitPaneTarget: vi.fn(),
});

let mockState = createMockStoreState();

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: MockStoreState) => unknown) => (selector ? selector(mockState) : mockState),
}));

vi.mock('@/stores/taskStore', () => ({ useTaskStore: () => ({ clearTasks: vi.fn() }) }));
vi.mock('@/hooks/useAgentMessages', () => ({
  useAgentMessages: () => ({
    handleAgentMessage: vi.fn(),
    handleStop: vi.fn(),
    resetRefs: vi.fn(),
    resetRefsForThreadSwitch: vi.fn(),
    resetTimeout: vi.fn(),
    clearDoneTimeout: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ pending: [], respond: vi.fn(), handleAuthRequest: vi.fn(), handleAuthResponse: vi.fn() }),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({ agents: [], getAgentById: vi.fn() }),
}));
vi.mock('@/hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    handleScroll: vi.fn(),
    scrollContainerRef: { current: null },
    messagesEndRef: { current: null },
    scrollToBottom: vi.fn(),
    followLayoutChangeIfPinned: vi.fn(),
    isLoadingHistory: false,
    hasMore: false,
  }),
}));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({ handleSend: mockHandleSend, uploadStatus: null, uploadError: null }),
}));
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    cancelInvocation: vi.fn(),
    awaitThreadRoom: mockAwaitThreadRoom,
  }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ islogin: true }) })),
}));
vi.mock('@/utils/userId', () => ({
  clearAuthIdentity: vi.fn(),
  getUserId: () => 'test-user',
  setIsSkipAuth: vi.fn(),
}));

vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/agent-management/AgentManagement', () => ({ AgentManagement: () => null }));
vi.mock('@/components/OfficeClawHub', () => ({ OfficeClawHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({ ChatContainerHeader: () => null }));
vi.mock('@/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
vi.mock('@/components/chat-input/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/chat-message', () => ({ ChatMessage: () => null }));
vi.mock('@/components/HubListModal', () => ({ HubListModal: () => null }));
vi.mock('@/components/MessageActions', () => ({ MessageActions: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/RightContentHeader', () => ({ RightContentHeader: () => null }));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/ScheduledTasksPanel', () => ({ ScheduledTasksPanel: () => null }));
vi.mock('@/components/SecurityManagementModal', () => ({ default: () => null }));
vi.mock('@/components/skills-panel/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/LoadingPointStyle', () => ({ LoadingPointStyle: () => null }));
vi.mock('@/components/workspace/ResizeHandle', () => ({ ResizeHandle: () => null }));

describe('ChatContainer pending first-send guard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockState = createMockStoreState();
    mockHandleSend.mockReset();
    mockAwaitThreadRoom.mockReset();
    mockConsumePendingNewThreadSend.mockReset();
    // Strict Mode can run the pending-send effect twice; real store allows only one consume.
    mockConsumePendingNewThreadSend
      .mockImplementationOnce((_tid: string) => ({
        requestId: 'req-1',
        targetThreadId: 'thread-1',
        content: 'hello world',
        images: [],
        whisper: undefined,
        deliveryMode: undefined,
        sendOptions: undefined,
      }))
      .mockImplementation((_tid: string) => null);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('waits for thread-room confirmation before auto-sending the first pending message', async () => {
    let releaseJoin: (() => void) | null = null;
    mockAwaitThreadRoom.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseJoin = resolve;
      }),
    );

    await act(async () => {
      root.render(React.createElement(ChatContainer, { mode: 'thread', threadId: 'thread-1' }));
    });

    expect(mockAwaitThreadRoom).toHaveBeenCalledWith('thread-1');
    expect(mockHandleSend).not.toHaveBeenCalled();

    await act(async () => {
      releaseJoin?.();
      await Promise.resolve();
    });

    expect(mockHandleSend).toHaveBeenCalledTimes(1);
    expect(mockHandleSend).toHaveBeenCalledWith('hello world', [], undefined, undefined, undefined, undefined);
  });

  it('falls back to best-effort send when room confirmation fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockAwaitThreadRoom.mockRejectedValue(new Error('join failed'));

    await act(async () => {
      root.render(React.createElement(ChatContainer, { mode: 'thread', threadId: 'thread-1' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockHandleSend).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[chat] awaitThreadRoom failed, continuing with best-effort send',
      expect.objectContaining({ threadId: 'thread-1' }),
    );
  });
});
