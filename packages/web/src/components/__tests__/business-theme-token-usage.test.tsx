/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';
import { ThreadItem } from '@/components/thread-sidebar/ThreadItem';

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

vi.mock('@/stores/taskStore', () => ({ useTaskStore: () => ({ clearTasks: vi.fn() }) }));
vi.mock('@/hooks/useSocket', () => ({ useSocket: () => ({ cancelInvocation: vi.fn(), syncRooms: vi.fn() }) }));
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
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({ useChatSocketCallbacks: () => ({}) }));
vi.mock('@/hooks/useAgentData', () => ({ useAgentData: () => ({ agents: [], getAgentById: vi.fn() }) }));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'business', toggleTheme: vi.fn(), setTheme: vi.fn(), isLoaded: true }),
}));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn(() => new Promise(() => {})), API_URL: '' }));
vi.mock('@/utils/userId', () => ({ getUserId: () => 'test-user' }));
vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/agent-management/AgentManagement', () => ({ AgentManagement: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));
vi.mock('@/components/OfficeClawHub', () => ({ OfficeClawHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({
  ChatContainerHeader: () => React.createElement('div', { 'data-testid': 'chat-header' }),
}));
vi.mock('@/components/chat-input/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/chat-message', () => ({ ChatMessage: () => null }));
vi.mock('@/components/HubListModal', () => ({ HubListModal: () => null }));
vi.mock('@/components/MessageActions', () => ({ MessageActions: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/skills-panel/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/workspace/ResizeHandle', () => ({ ResizeHandle: () => null }));
vi.mock('@/components/AgentAvatar', () => ({ AgentAvatar: () => null }));
vi.mock('@/components/icons/HubIcon', () => ({ HubIcon: () => null }));
vi.mock('@/components/icons/PawIcon', () => ({ PawIcon: () => null }));
vi.mock('@/components/ThreadAgentStatus', () => ({ ThreadAgentStatus: () => null }));
vi.mock('@/components/ThreadSidebar/ThreadAgentSettings', () => ({ ThreadAgentSettings: () => null }));
vi.mock('@/components/ThreadSidebar/thread-utils', () => ({ formatRelativeTime: () => 'just now' }));

describe('business theme token usage', () => {
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

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockState = createMockStoreState();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders ChatContainer under business theme without requiring theme config objects', () => {
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'default' }));
    });

    expect(container.querySelector('[data-chat-container]')).not.toBeNull();
  });

  it('uses token-backed active styling for thread items', () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-1',
          title: 'Quarterly Review',
          participants: ['office'],
          lastActiveAt: Date.now(),
          isActive: true,
          onSelect: vi.fn(),
        }),
      );
    });

    const item = container.firstElementChild as HTMLElement | null;
    expect(item).not.toBeNull();
    expect(item?.className).toContain('ui-thread-item-active');
    expect(item?.getAttribute('style')).toBeNull();
  });
});
