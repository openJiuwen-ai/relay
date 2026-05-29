/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';
import { NewThreadContainer } from '@/components/NewThreadContainer';

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
  rightPanelMode: 'status' | 'workspace' | 'pptStudio' | 'fileBrowser';
  fileBrowserInitialPath: string | null;
  pptStudioSessions: Record<string, unknown>;
  uiThinkingExpandedByDefault: boolean;
  workspaceWorktreeId: string | null;
  splitPaneThreadIds: string[];
  setSplitPaneThreadIds: ReturnType<typeof vi.fn>;
  setSplitPaneTarget: ReturnType<typeof vi.fn>;
  threads: Array<{ id: string; title?: string; projectPath?: string }>;
  setCurrentProject: ReturnType<typeof vi.fn>;
  showVoteModal: boolean;
  setShowVoteModal: ReturnType<typeof vi.fn>;
  addMessage: ReturnType<typeof vi.fn>;
  consumePendingNewThreadSend: ReturnType<typeof vi.fn>;
};

const createMockStoreState = (rightPanelMode: MockStoreState['rightPanelMode']): MockStoreState => ({
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
  rightPanelMode,
  fileBrowserInitialPath: null,
  pptStudioSessions:
    rightPanelMode === 'pptStudio' || rightPanelMode === 'fileBrowser'
      ? {
          'output/pages': {
            threadId: 'thread-1',
            projectRoot: '/mock',
            pagesDir: 'output/pages',
            deckTitle: '',
            status: 'editable' as const,
            slides: [],
            activeSlideId: null,
          },
        }
      : {},
  uiThinkingExpandedByDefault: false,
  workspaceWorktreeId: null,
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

let mockState = createMockStoreState('status');

vi.mock('@/stores/chatStore', () => {
  const mockFn = vi.fn((selector?: (state: MockStoreState) => unknown) => (selector ? selector(mockState) : mockState));
  (mockFn as any).setState = vi.fn();
  return {
    useChatStore: mockFn,
  };
});

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
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({ agents: [], getAgentById: vi.fn() }),
}));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'warm',
    config: {
      sidebar: { bg: '#fff' },
      content: { bg: '#fff' },
    },
  }),
}));
vi.mock('@/hooks/usePreviewAutoOpen', () => ({ usePreviewAutoOpen: vi.fn() }));
vi.mock('@/hooks/useWorkspaceNavigate', () => ({ useWorkspaceNavigate: vi.fn() }));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/utils/userId', () => ({ getUserId: () => 'test-user', getIsSkipAuth: () => false }));

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
vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/MessageNavigator', () => ({ MessageNavigator: () => null }));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/RightContentHeader', () => ({
  RightContentHeader: () => React.createElement('div', { 'data-testid': 'right-content-header' }),
}));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/skills-panel/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({
  ThreadSidebar: () => React.createElement('aside', { 'data-testid': 'thread-sidebar-shell' }),
}));
vi.mock('@/components/file-browser-panel/TaskListPanel', () => ({
  TaskListPanel: () => React.createElement('div', { 'data-testid': 'task-list-panel-stub' }),
}));
vi.mock('@/components/ppt-studio/PptStudioPanel', () => ({
  PptStudioPanel: () => React.createElement('div', { 'data-testid': 'ppt-studio-panel' }),
  PptStudioBackgroundSync: () => null,
}));
vi.mock('@/components/workspace/ResizeHandle', () => ({
  ResizeHandle: () => React.createElement('div', { 'data-testid': 'resize-handle' }),
}));

describe('ChatContainer right panel visibility', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockState = createMockStoreState('status');
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('does not render the desktop status panel on the home chat layout', () => {
    mockState = createMockStoreState('status');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'default' }));
    });

    expect(container.querySelector('[data-testid="right-status-panel"]')).toBeNull();
  });

  it('does not render the desktop workspace panel on the home chat layout', () => {
    mockState = createMockStoreState('workspace');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'default' }));
    });

    expect(container.querySelector('[data-testid="workspace-panel"]')).toBeNull();
  });

  it('renders the unified file browser shell on thread pages when previewing PPT (legacy pptStudio mode)', () => {
    mockState = createMockStoreState('pptStudio');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="file-browser-secondary-pane"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ppt-studio-panel"]')).toBeNull();
  });

  it('renders a wider resizable secondary pane for unified PPT file browser', () => {
    mockState = createMockStoreState('pptStudio');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    const secondaryPane = container.querySelector('[data-testid="file-browser-secondary-pane"]') as HTMLElement | null;
    expect(secondaryPane).not.toBeNull();
    const paneWidthPx = parseInt(secondaryPane?.style.width ?? '0', 10);
    if (!Number.isNaN(paneWidthPx) && paneWidthPx > 0) {
      expect(paneWidthPx).toBeGreaterThanOrEqual(432);
      expect(paneWidthPx).toBeLessThanOrEqual(1600);
    }
    expect(container.querySelector('[data-testid="file-browser-pane-resizer"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="file-browser-secondary-pane"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="file-browser-pane-resizer"]')).toHaveLength(1);
  });

  it('does not render a nested app shell inside thread content pages', () => {
    mockState = createMockStoreState('status');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'thread-1' }));
    });

    expect(container.querySelector('[data-testid="thread-sidebar-shell"]')).toBeNull();
    expect(container.querySelector('[data-testid="right-content-header"]')).toBeNull();
  });

  it('does not render the unified file browser secondary pane on the home new-thread layout', () => {
    act(() => {
      root.render(React.createElement(NewThreadContainer));
    });

    expect(container.querySelector('[data-testid="file-browser-secondary-pane"]')).toBeNull();
  });

  it('does not render the unified file browser secondary pane on the default thread layout', () => {
    mockState = createMockStoreState('pptStudio');

    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'default' }));
    });

    expect(container.querySelector('[data-testid="file-browser-secondary-pane"]')).toBeNull();
  });

});
