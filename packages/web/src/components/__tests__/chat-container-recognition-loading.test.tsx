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
let mockMentionToAgentId: Record<string, string> = { codex: 'codex' };

type MockMessage = {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
  isStreaming?: boolean;
  variant?: string;
};

type MockStoreState = {
  messages: MockMessage[];
  isLoading: boolean;
  hasActiveInvocation: boolean;
  intentMode: 'execute' | 'ideate' | null;
  targetAgents: string[];
  agentStatuses: Record<string, string>;
  agentInvocations: Record<string, unknown>;
  setCurrentThread: ReturnType<typeof vi.fn>;
  viewMode: 'single';
  setViewMode: ReturnType<typeof vi.fn>;
  clearUnread: ReturnType<typeof vi.fn>;
  confirmUnreadAck: ReturnType<typeof vi.fn>;
  armUnreadSuppression: ReturnType<typeof vi.fn>;
  uiThinkingExpandedByDefault: boolean;
  splitPaneThreadIds: string[];
  setSplitPaneThreadIds: ReturnType<typeof vi.fn>;
  setSplitPaneTarget: ReturnType<typeof vi.fn>;
  threads: Array<{ id: string; title?: string; projectPath?: string; bootcampState?: boolean }>;
  setCurrentProject: ReturnType<typeof vi.fn>;
  showVoteModal: boolean;
  setShowVoteModal: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
  consumePendingNewThreadSend: ReturnType<typeof vi.fn>;
};

const createMockStoreState = (): MockStoreState => ({
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
  threads: [],
  setCurrentProject: vi.fn(),
  showVoteModal: false,
  setShowVoteModal: vi.fn(),
  addMessage: vi.fn(),
  consumePendingNewThreadSend: vi.fn(() => null),
});

let mockState = createMockStoreState();

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector?: (state: MockStoreState) => unknown) => (selector ? selector(mockState) : mockState),
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ clearTasks: vi.fn() }),
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
  useSendMessage: () => ({ handleSend: mockHandleSend, uploadStatus: null, uploadError: null }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({
    pending: [],
    respond: vi.fn(),
    clearPending: vi.fn(),
    handleAuthRequest: vi.fn(),
    handleAuthResponse: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [
      {
        id: 'jiuwenclaw',
        displayName: '办公助理',
        roster: { available: true },
      },
      {
        id: 'codex',
        displayName: 'Codex',
        roster: { available: true },
      },
    ],
    getAgentById: (id: string) =>
      id === 'jiuwenclaw'
        ? {
            id: 'jiuwenclaw',
            displayName: '办公助理',
            avatar: '/avatars/jiuwenclaw.png',
            color: { primary: '#D97A3A', secondary: '#F6E7DA' },
          }
        : id === 'codex'
          ? {
              id: 'codex',
              displayName: 'Codex',
              avatar: '/avatars/codex.png',
              color: { primary: '#5B8C5A', secondary: '#E6F2E6' },
            }
          : undefined,
  }),
}));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/lib/mention-highlight', () => ({
  getMentionRe: () => /@([^\s@]+)/g,
  getMentionToAgentId: () => mockMentionToAgentId,
}));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/utils/userId', () => ({ getUserId: () => 'test-user' }));

vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/AgentsPanel', () => ({ AgentsPanel: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));
vi.mock('@/components/OfficeClawHub', () => ({ OfficeClawHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({
  ChatContainerHeader: () => React.createElement('div', { 'data-testid': 'chat-header' }),
}));
vi.mock('@/components/chat-input/ChatInput', () => ({
  ChatInput: ({
    onSend,
    onStop,
  }: {
    onSend?: (content: string, images?: unknown[], whisper?: boolean, deliveryMode?: string) => void;
    onStop?: () => void;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          'data-testid': 'chat-stop',
          onClick: () => {
            mockState.isLoading = false;
            mockState.hasActiveInvocation = false;
            mockState.intentMode = null;
            onStop?.();
          },
        },
        'stop',
      ),
      React.createElement(
        'button',
        {
          'data-testid': 'chat-send',
          onClick: () => {
            onSend?.('继续帮我总结', [], false, 'direct');
          },
        },
        'send',
      ),
    ),
}));
vi.mock('@/components/chat-message', () => ({
  ChatMessage: ({ message }: { message: MockMessage }) =>
    message.variant === 'intent_recognition'
      ? React.createElement(
          'div',
          { 'data-testid': 'intent-recognition-placeholder', 'data-cat-id': message.agentId },
          `${message.agentId} ${message.content === 'stopped' ? '已停止对话' : '正在识别你的需求'} ${message.timestamp}`,
        )
      : null,
}));
vi.mock('@/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
vi.mock('@/components/HubListModal', () => ({ HubListModal: () => null }));
vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/skills-panel/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({
  ThinkingIndicator: () => React.createElement('div', { 'data-testid': 'thinking-indicator' }, 'thinking'),
}));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/workspace/ResizeHandle', () => ({ ResizeHandle: () => null }));

describe('ChatContainer recognition loading placeholder', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width: 768px'),
      media: query,
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
    mockState = createMockStoreState();
    mockMentionToAgentId = { codex: 'codex' };
    mockHandleSend.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses the user @mention target for the recognition placeholder', () => {
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '@codex 帮我整理一个汇报方案',
        timestamp: new Date(2026, 1, 26, 19, 35, 0).getTime(),
      },
    ];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')?.getAttribute('data-cat-id')).toBe('codex');
    expect(container.textContent).toContain('codex');
    expect(container.textContent).toContain('正在识别你的需求');
  });

  it('prefers exact targetAgents over fuzzy mention-name parsing for the recognition placeholder', () => {
    mockMentionToAgentId = { '古诗词创作专家': 'my-agent' };
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '@古诗词创作专家 帮我整理一个汇报方案',
        timestamp: new Date(2026, 1, 26, 19, 35, 0).getTime(),
      },
    ];
    mockState.targetAgents = ['expert-poetry'];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')?.getAttribute('data-cat-id')).toBe(
      'expert-poetry',
    );
  });

  it('keeps recognition placeholder visible after intent mode until assistant output starts', () => {
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '帮我整理一个汇报方案',
        timestamp: new Date(2026, 1, 26, 19, 35, 0).getTime(),
      },
    ];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });
    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();

    mockState.intentMode = 'execute';
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="thinking-indicator"]')).toBeFalsy();
  });

  it('changes recognition placeholder to stopped text when user stops during recognition', () => {
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '@codex 帮我整理一个汇报方案',
        timestamp: new Date(2026, 1, 26, 19, 35, 0).getTime(),
      },
    ];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    const stopButton = container.querySelector('[data-testid="chat-stop"]') as HTMLButtonElement | null;
    expect(stopButton).toBeTruthy();

    act(() => {
      stopButton?.click();
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')?.getAttribute('data-cat-id')).toBe('codex');
    expect(container.textContent).toContain('已停止对话');
    expect(container.textContent).not.toContain('正在识别你的需求');
  });

  it('persists the stopped recognition bubble before sending the next user message', () => {
    const userTimestamp = new Date(2026, 1, 26, 19, 35, 0).getTime();
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '@codex 帮我整理一个汇报方案',
        timestamp: userTimestamp,
      },
    ];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    const stopButton = container.querySelector('[data-testid="chat-stop"]') as HTMLButtonElement | null;
    expect(stopButton).toBeTruthy();

    act(() => {
      stopButton?.click();
    });

    const sendButton = container.querySelector('[data-testid="chat-send"]') as HTMLButtonElement | null;
    expect(sendButton).toBeTruthy();

    act(() => {
      sendButton?.click();
    });

    expect(mockState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `intent-recognition-stopped-${userTimestamp}`,
        type: 'assistant',
        agentId: 'codex',
        content: 'stopped',
        timestamp: userTimestamp + 1,
        variant: 'intent_recognition',
      }),
    );
    expect(mockHandleSend).toHaveBeenCalledWith('继续帮我总结', [], undefined, false, 'direct', undefined);

    const persistOrder = mockState.addMessage.mock.invocationCallOrder[0];
    const sendOrder = mockHandleSend.mock.invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(sendOrder);
    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeFalsy();
  });

  it('switches from recognition placeholder to thinking indicator after assistant output begins', () => {
    const userTimestamp = new Date(2026, 1, 26, 19, 35, 0).getTime();
    mockState.messages = [
      {
        id: 'user-1',
        type: 'user',
        content: '帮我整理一个汇报方案',
        timestamp: userTimestamp,
      },
    ];
    mockState.isLoading = true;
    mockState.hasActiveInvocation = true;
    mockState.intentMode = 'execute';

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="thinking-indicator"]')).toBeFalsy();

    mockState.messages = [
      ...mockState.messages,
      {
        id: 'assistant-1',
        type: 'assistant',
        agentId: 'jiuwenclaw',
        content: '',
        timestamp: userTimestamp + 1,
        isStreaming: true,
      },
    ];

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="intent-recognition-placeholder"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="thinking-indicator"]')).toBeTruthy();
  });
});
