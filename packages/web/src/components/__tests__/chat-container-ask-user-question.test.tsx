/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';

const mockAddMessage = vi.fn();
const mockSubmitAnswer = vi.fn();

const mockState = {
  messages: [],
  isLoading: false,
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
  uiThinkingExpandedByDefault: false,
  splitPaneThreadIds: [],
  setSplitPaneThreadIds: vi.fn(),
  setSplitPaneTarget: vi.fn(),
  threads: [{ id: 'thread-1', title: 'Thread 1' }],
  setCurrentProject: vi.fn(),
  showVoteModal: false,
  setShowVoteModal: vi.fn(),
  addMessage: mockAddMessage,
  consumePendingNewThreadSend: vi.fn(() => null),
};

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: typeof mockState) => unknown) => (selector ? selector(mockState) : mockState),
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ clearTasks: vi.fn(), addTask: vi.fn(), updateTask: vi.fn() }),
}));
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ cancelInvocation: vi.fn(), syncRooms: vi.fn() }),
}));
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
vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({ handleSend: vi.fn(), uploadStatus: null, uploadError: null }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ pending: [], respond: vi.fn(), handleAuthRequest: vi.fn(), handleAuthResponse: vi.fn() }),
}));
vi.mock('@/hooks/useAskUserQuestion', () => ({
  useAskUserQuestion: () => ({
    pendingQuestion: {
      requestId: 'req-1',
      source: 'ask_tool',
      createdAt: 1,
      questions: [
        {
          header: 'Q1',
          question: '问题一',
          options: [{ label: '选项 A' }, { label: '选项 B' }],
        },
        {
          header: 'Q2',
          question: '问题二',
          options: [{ label: '选项 C' }, { label: '选项 D' }],
        },
      ],
    },
    submitAnswer: mockSubmitAnswer,
    handleQuestionRequest: vi.fn(),
    handleQuestionResponse: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [{ id: 'codex', displayName: 'Codex', roster: { available: true } }],
    getAgentById: () => ({ id: 'codex', displayName: 'Codex', avatar: '/avatars/codex.png', color: { primary: '#000', secondary: '#fff' } }),
  }),
}));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/utils/userId', () => ({ getUserId: () => 'test-user' }));

vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/AgentsPanel', () => ({ AgentsPanel: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));
vi.mock('@/components/OfficeClawHub', () => ({ OfficeClawHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({
  ChatContainerHeader: () => React.createElement('div'),
}));
vi.mock('@/components/chat-input/ChatInput', () => ({
  ChatInput: () => React.createElement('div'),
}));
vi.mock('@/components/MessageActions', () => ({
  MessageActions: () => React.createElement('div'),
}));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/VoteModal', () => ({ VoteModal: () => null }));

describe('ChatContainer ask_user_question bubble', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockAddMessage.mockReset();
    mockSubmitAnswer.mockReset();
    mockSubmitAnswer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('does not add a user bubble with selected options after confirming answers', async () => {
    await act(async () => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    const optionA = container.querySelector('[data-testid="ask-user-question-card-option-选项 A"]') as HTMLButtonElement | null;
    const optionC = container.querySelector('[data-testid="ask-user-question-card-option-选项 C"]') as HTMLButtonElement | null;
    const primaryButton = container.querySelector('button.ui-button-primary') as HTMLButtonElement | null;

    await act(async () => {
      optionA?.click();
      primaryButton?.click();
    });

    await act(async () => {
      optionC?.click();
      primaryButton?.click();
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(mockSubmitAnswer).toHaveBeenCalledTimes(1);
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it('does not add a user bubble with skip text when skipping without selections', async () => {
    await act(async () => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    const skipButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '跳过',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      skipButton?.click();
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(mockSubmitAnswer).toHaveBeenCalledTimes(1);
    expect(mockAddMessage).not.toHaveBeenCalled();
  });
});
