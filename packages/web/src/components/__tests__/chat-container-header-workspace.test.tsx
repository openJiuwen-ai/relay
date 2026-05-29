/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RightContentHeader } from '@/components/RightContentHeader';
import { vitestRouter } from '@/vitest-router-mock';

const { mockApiFetch, mockAddToast, mockChatState } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockAddToast: vi.fn(),
  mockChatState: {
    currentThreadId: 'thread-1',
    isLoadingHistory: false,
    messages: [],
    threads: [{ id: 'thread-1', title: '很长的当前会话名称用于验证顶部展示截断', projectPath: 'D:\\workspace\\demo' }],
  },
}));

const feedbackState = {
  isFeedbackOpen: false,
  isAutoOpenedFeedback: false,
  selectedScore: null,
  lowScoreSelectedIssues: [],
  highScoreSelectedIssues: [],
  lowScoreDetail: '',
  lowScoreOtherIssueDetail: '',
  highScoreOtherIssueDetail: '',
  setFeedbackPopoverState: vi.fn(),
  setSelectedScore: vi.fn(),
  setLowScoreSelectedIssues: vi.fn(),
  setHighScoreSelectedIssues: vi.fn(),
  setLowScoreDetail: vi.fn(),
  setLowScoreOtherIssueDetail: vi.fn(),
  setHighScoreOtherIssueDetail: vi.fn(),
  resetFeedbackFormState: vi.fn(),
};

vi.mock('@/hooks/useDesktopWindowControls', () => ({
  useDesktopWindowControls: () => ({
    isMaximized: false,
    canMaximize: true,
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDrag: vi.fn(),
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockChatState) => unknown) => selector(mockChatState),
}));

vi.mock('@/stores/feedbackPopoverStore', () => ({
  useFeedbackPopoverStore: (selector: (state: typeof feedbackState) => unknown) => selector(feedbackState),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/utils/userId', () => ({
  getDomainId: () => 'domain-1',
  getIsSkipAuth: () => true,
}));

describe('top header workspace display', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockResolvedValue({ ok: true, status: 200 });
    mockAddToast.mockReset();
    mockChatState.currentThreadId = 'thread-1';
    mockChatState.threads = [
      { id: 'thread-1', title: '很长的当前会话名称用于验证顶部展示截断', projectPath: 'D:\\workspace\\demo' },
    ];
    vitestRouter.pathname = '/thread/thread-1';
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the thread title before a naturally laid out borderless workspace opener', () => {
    act(() => {
      root.render(React.createElement(RightContentHeader));
    });

    const threadTitle = container.querySelector('[data-testid="thread-title-label"]') as HTMLElement | null;
    const button = container.querySelector('[data-testid="thread-workspace-open-button"]') as HTMLButtonElement | null;
    expect(threadTitle).not.toBeNull();
    expect(threadTitle?.textContent).toBe('很长的当前会话名称用于验证顶部展示截断');
    expect(threadTitle?.className).toContain('block');
    expect(threadTitle?.className).toContain('w-full');
    expect(threadTitle?.className).toContain('truncate');
    expect(threadTitle?.className).toContain('text-ellipsis');
    expect(threadTitle?.className).toContain('whitespace-nowrap');
    expect(threadTitle?.parentElement?.className).toContain('max-w-[220px]');
    expect(threadTitle?.parentElement?.className).toContain('overflow-hidden');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('demo');
    expect(button?.className).not.toContain('ui-button-default');
    expect(button?.className).not.toContain('fixed');
    expect(button?.querySelector('[data-testid="thread-workspace-icon"]')).not.toBeNull();
    expect((threadTitle?.compareDocumentPosition(button as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button?.parentElement?.className).toContain('max-w-[220px]');
  });

  it('opens the workspace directory via API when clicked', async () => {
    await act(async () => {
      root.render(React.createElement(RightContentHeader));
    });

    await act(async () => {
      (container.querySelector('[data-testid="thread-workspace-open-button"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/open-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'D:\\workspace\\demo' }),
    });
  });

  it('shows the backend error reason when opening the workspace fails', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: '目录不存在' }),
    });

    await act(async () => {
      root.render(React.createElement(RightContentHeader));
    });

    await act(async () => {
      (container.querySelector('[data-testid="thread-workspace-open-button"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: '打开工作空间失败',
      message: '目录不存在',
      duration: 2400,
    });
  });

  it('shows a tooltip explaining the workspace opens the session directory', async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(React.createElement(RightContentHeader));
    });

    await act(async () => {
      (container.querySelector('[data-testid="thread-workspace-open-button"]') as HTMLButtonElement).dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true }),
        );
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('点击打开会话工作空间目录');
    vi.useRealTimers();
  });

  it('does not render for default workspace placeholders', () => {
    mockChatState.threads = [{ id: 'thread-1', title: '默认工作区会话', projectPath: 'default' }];

    act(() => {
      root.render(React.createElement(RightContentHeader));
    });

    expect(container.querySelector('[data-testid="thread-title-label"]')?.textContent).toBe('默认工作区会话');
    expect(container.querySelector('[data-testid="thread-workspace-open-button"]')).toBeNull();
  });

  it('does not render thread metadata when the route is not the current thread', () => {
    vitestRouter.pathname = '/projects';

    act(() => {
      root.render(React.createElement(RightContentHeader));
    });

    expect(container.querySelector('[data-testid="thread-title-label"]')).toBeNull();
    expect(container.querySelector('[data-testid="thread-workspace-open-button"]')).toBeNull();
  });
});
