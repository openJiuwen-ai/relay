/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';

const mockStoreState = () => ({
  messages: [],
  isLoading: false,
  hasActiveInvocation: false,
  intentMode: null,
  targetAgents: [],
  agentStatuses: {},
  agentInvocations: {},
  activeInvocations: {},
  addMessage: vi.fn(),
  removeMessage: vi.fn(),
  setLoading: vi.fn(),
  setHasActiveInvocation: vi.fn(),
  setIntentMode: vi.fn(),
  setTargetAgents: vi.fn(),
  clearAgentStatuses: vi.fn(),
  setCurrentThread: vi.fn(),
  updateThreadTitle: vi.fn(),
  setCurrentGame: vi.fn(),
  currentGame: null,

  viewMode: 'single' as const,
  setViewMode: vi.fn(),
  clearUnread: vi.fn(),
  confirmUnreadAck: vi.fn(),
  armUnreadSuppression: vi.fn(),
  consumePendingNewThreadSend: vi.fn(() => null),
  splitPaneThreadIds: [],
  setSplitPaneThreadIds: vi.fn(),
  setSplitPaneTarget: vi.fn(),
  threads: [],
});

vi.mock('@/stores/chatStore', () => {
  const hook = (selector?: (s: ReturnType<typeof mockStoreState>) => unknown) => {
    const state = mockStoreState();
    return selector ? selector(state) : state;
  };
  return { useChatStore: hook };
});

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ tasks: [], addTask: vi.fn(), updateTask: vi.fn(), clearTasks: vi.fn() }),
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
  useSendMessage: () => ({ handleSend: vi.fn() }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ pending: [], respond: vi.fn(), handleAuthRequest: vi.fn(), handleAuthResponse: vi.fn() }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));

// Stub child components to isolate ChatContainer behavior
vi.mock('@/components/chat-message', () => ({ ChatMessage: () => null }));
vi.mock('@/components/chat-input/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({
  ChatContainerHeader: (props: { onToggleSidebar: () => void; onOpenMobileStatus: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'header' },
      React.createElement('button', { 'data-testid': 'sidebar-toggle', onClick: props.onToggleSidebar }),
      React.createElement('button', { 'data-testid': 'mobile-status-trigger', onClick: props.onOpenMobileStatus }),
    ),
}));
vi.mock('@/components/ThreadSidebar', () => ({
  ThreadSidebar: () => React.createElement('div', { 'data-testid': 'sidebar' }, 'Sidebar'),
}));
vi.mock('@/components/MobileStatusSheet', () => ({
  MobileStatusSheet: (props: { open: boolean }) =>
    React.createElement('div', { 'data-testid': 'mobile-status', 'data-open': String(props.open) }),
}));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/MessageNavigator', () => ({ MessageNavigator: () => null }));
vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/OfficeClawHub', () => ({ OfficeClawHub: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));

describe('ChatContainer mobile interactions', () => {
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

  function mockMatchMedia(desktopMatch: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: desktopMatch && query.includes('min-width: 768px'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockMatchMedia(false); // default: mobile
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('sidebar is visible by default on mobile', () => {
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'test-thread' }));
    });
    expect(container.querySelector('[data-testid="sidebar"]')).toBeTruthy();
  });

  it('keeps sidebar visible when toggle button is clicked and renders no backdrop', () => {
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'test-thread' }));
    });
    const toggleBtn = container.querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement;
    act(() => {
      toggleBtn.click();
    });
    expect(container.querySelector('[data-testid="sidebar"]')).toBeTruthy();
    expect(container.querySelector('[class*="bg-black"]')).toBeNull();
  });

  it('mobile status sheet starts closed and opens on trigger', () => {
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'test-thread' }));
    });
    const statusSheet = container.querySelector('[data-testid="mobile-status"]') as HTMLElement;
    expect(statusSheet.getAttribute('data-open')).toBe('false');

    const triggerBtn = container.querySelector('[data-testid="mobile-status-trigger"]') as HTMLButtonElement;
    act(() => {
      triggerBtn.click();
    });

    const statusSheetAfter = container.querySelector('[data-testid="mobile-status"]') as HTMLElement;
    expect(statusSheetAfter.getAttribute('data-open')).toBe('true');
  });

  it('sidebar remains visible on desktop viewport', () => {
    mockMatchMedia(true);
    act(() => {
      root.render(React.createElement(ChatContainer, { threadId: 'test-thread' }));
    });
    expect(container.querySelector('[data-testid="sidebar"]')).toBeTruthy();
  });
});
