/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDomainId, getIsSkipAuth } from '@/utils/userId';
import { useFeedbackPopoverStore } from '@/stores/feedbackPopoverStore';
import {
  RightContentHeader,
  __resetFeedbackAutoOpenSessionForTests,
  __resetFeedbackPopoverStateForTests,
} from '../RightContentHeader';

const addToast = vi.fn();

vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'user-1',
  getDomainId: vi.fn(() => 'domain-1'),
  getIsSkipAuth: vi.fn(() => false),
}));

type MockChatStoreState = {
  currentThreadId: string;
  isLoadingHistory: boolean;
  messages: Array<{ id: string; type: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>;
};

function resetChatStoreState() {
  chatStoreState.currentThreadId = 'thread-1';
  chatStoreState.isLoadingHistory = false;
  chatStoreState.messages = [
    { id: 'user-1', type: 'user', content: 'hello', timestamp: 1 },
    { id: 'assistant-1', type: 'assistant', content: 'hi', timestamp: 2 },
  ];
}

const chatStoreState: MockChatStoreState = {
  currentThreadId: 'thread-1',
  isLoadingHistory: false,
  messages: [
    { id: 'user-1', type: 'user', content: 'hello', timestamp: 1 },
    { id: 'assistant-1', type: 'assistant', content: 'hi', timestamp: 2 },
  ],
};

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: MockChatStoreState) => unknown) => selector(chatStoreState),
}));

describe('RightContentHeader feedback popover', () => {
  let container: HTMLDivElement;
  let root: Root;
  const mockedGetDomainId = vi.mocked(getDomainId);
  const mockedGetIsSkipAuth = vi.mocked(getIsSkipAuth);
  const mockSubmitFetch = vi.fn();
  const detailTemplate = '【使用场景】：\n【优化意见】：';
  const formatFeedbackDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    __resetFeedbackAutoOpenSessionForTests();
    __resetFeedbackPopoverStateForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedGetIsSkipAuth.mockReset();
    mockedGetIsSkipAuth.mockReturnValue(false);
    mockedGetDomainId.mockReset();
    mockedGetDomainId.mockReturnValue('domain-1');
    mockSubmitFetch.mockReset();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: formatFeedbackDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)) }),
    } as Response);
    vi.stubGlobal('fetch', mockSubmitFetch);
    addToast.mockReset();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/thread/thread-1');
    resetChatStoreState();
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function getSmileButton() {
    return container.querySelector('.ui-content-header-action[aria-haspopup="dialog"]') as HTMLButtonElement | null;
  }

  function getScoreButton(score: number) {
    return Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === `评分 ${score}`,
    ) as HTMLButtonElement | undefined;
  }

  function getPopoverCloseButton() {
    return container.querySelector('.ui-content-header-feedback-popover-close') as HTMLButtonElement | null;
  }

  function getFeedbackAnchor() {
    return container.querySelector('.ui-content-header-feedback-anchor') as HTMLDivElement | null;
  }

  function getFetchCallsByMethod(method: string) {
    return mockSubmitFetch.mock.calls.filter(([, init]) => {
      const requestInit = init as RequestInit | undefined;
      return (requestInit?.method ?? 'GET') === method;
    });
  }

  function getLatestPostAnswers() {
    const postCalls = getFetchCallsByMethod('POST');
    const latestPost = postCalls.at(-1);
    expect(latestPost).toBeTruthy();
    const requestInit = latestPost?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body ?? '{}')) as {
      data?: { answers?: Array<{ questionId: string; subName?: string; answer?: string }> };
    };
    return body.data?.answers ?? [];
  }

  it('renders caller-provided left content and panel toggle in the existing header regions', async () => {
    const onToggle = vi.fn();

    await act(async () => {
      root.render(React.createElement(RightContentHeader, {
        leftContent: React.createElement(
          'div',
          { 'data-testid': 'detail-header-title', className: 'flex items-center gap-2' },
          '详情标题',
        ),
        panelToggle: {
          isOpen: true,
          onToggle,
          openLabel: '展开信息面板',
          closeLabel: '收起信息面板',
        },
      } as never));
    });

    expect(container.querySelector('[data-testid="detail-header-title"]')?.textContent).toBe('详情标题');
    const toggle = container.querySelector('button[aria-label="收起信息面板"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();

    act(() => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  function getLatestPostBody() {
    const postCalls = getFetchCallsByMethod('POST');
    const latestPost = postCalls.at(-1);
    expect(latestPost).toBeTruthy();
    const requestInit = latestPost?.[1] as RequestInit | undefined;
    return JSON.parse(String(requestInit?.body ?? '{}')) as {
      data?: { contactId?: string; w3account?: string; answers?: Array<{ questionId: string }> };
    };
  }

  it('auto opens the feedback popover when the API reports no previous submission', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('does not auto open before the current thread has completed one round of dialogue', async () => {
    chatStoreState.messages = [{ id: 'user-1', type: 'user', content: 'hello', timestamp: 1 }];

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not auto open outside the thread detail route', async () => {
    window.history.replaceState({}, '', '/');

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('only executes the auto-open check once per app session', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(getFetchCallsByMethod('GET')).toHaveLength(1);

    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    chatStoreState.currentThreadId = 'thread-2';
    chatStoreState.messages = [
      { id: 'user-2', type: 'user', content: 'hello again', timestamp: 3 },
      { id: 'assistant-2', type: 'assistant', content: 'hi again', timestamp: 4 },
    ];
    window.history.replaceState({}, '', '/thread/thread-2');

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(getFetchCallsByMethod('GET')).toHaveLength(1);
  });

  it('auto opens after thread entry once history finishes loading and one round becomes available', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);
    chatStoreState.isLoadingHistory = true;
    chatStoreState.messages = [];

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeNull();

    chatStoreState.isLoadingHistory = false;
    chatStoreState.messages = [
      { id: 'user-late', type: 'user', content: 'hello', timestamp: 10 },
      { id: 'assistant-late', type: 'assistant', content: 'hi', timestamp: 11 },
    ];

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(getFetchCallsByMethod('GET')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('does not query or auto open when the user dismissed feedback within 30 days', async () => {
    window.localStorage.setItem('feedbackCloseTime:domain-1', String(Date.now() - 15 * 24 * 60 * 60 * 1000));

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(mockSubmitFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('auto opens the feedback popover when the previous submission is older than 120 days', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: formatFeedbackDate(new Date(Date.now() - 121 * 24 * 60 * 60 * 1000)) }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('keeps the auto-opened feedback popover open across route remounts until user or timer closes it', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(getFetchCallsByMethod('GET')).toHaveLength(1);

    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    window.history.replaceState({}, '', '/thread/thread-2');
    chatStoreState.currentThreadId = 'thread-2';
    chatStoreState.messages = [
      { id: 'user-2', type: 'user', content: 'follow up', timestamp: 30 },
      { id: 'assistant-2', type: 'assistant', content: 'response', timestamp: 31 },
    ];

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(getFetchCallsByMethod('GET')).toHaveLength(1);
  });

  it('preserves selected score and typed feedback across route remounts', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    expect(container.textContent).toContain('您在使用过程中遇到了哪些问题？（选择您最关注的三项）');
    expect(container.textContent).toContain('请您反馈遇到的具体问题，帮助我们准确评估并优化');

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    act(() => {
      useFeedbackPopoverStore.getState().setLowScoreDetail('keep this detail');
    });
    await flush();
    expect((container.querySelector('textarea') as HTMLTextAreaElement | null)?.value).toBe('keep this detail');

    const otherIssueCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const otherIssueCheckbox = otherIssueCheckboxes.at(-1) ?? null;
    const resolvedOtherIssueCheckbox =
      (otherIssueCheckbox ?? Array.from(container.querySelectorAll('input[type="checkbox"]')).at(-1)) as HTMLInputElement | undefined;
    expect(resolvedOtherIssueCheckbox).toBeTruthy();
    act(() => {
      resolvedOtherIssueCheckbox?.click();
    });
    await flush();

    const otherIssueInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(otherIssueInput).toBeTruthy();
    act(() => {
      useFeedbackPopoverStore.getState().setLowScoreOtherIssueDetail('keep this reason');
    });
    await flush();
    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('keep this reason');

    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    window.history.replaceState({}, '', '/thread/thread-2');
    chatStoreState.currentThreadId = 'thread-2';
    chatStoreState.messages = [
      { id: 'user-2', type: 'user', content: 'follow up', timestamp: 30 },
      { id: 'assistant-2', type: 'assistant', content: 'response', timestamp: 31 },
    ];

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const persistedScoreButton = getScoreButton(6);
    expect(persistedScoreButton?.className).toContain('ui-content-header-feedback-score-selected');
    expect((container.querySelector('textarea') as HTMLTextAreaElement | null)?.value).toBe('keep this detail');
    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('keep this reason');
  });

  it('keeps low-score and high-score other-issue inputs separate when switching scores', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const lowScoreOtherIssueCheckbox = (Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]).at(-1) ?? null;
    expect(lowScoreOtherIssueCheckbox).toBeTruthy();
    act(() => {
      lowScoreOtherIssueCheckbox?.click();
    });
    await flush();

    const lowScoreOtherInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(lowScoreOtherInput).toBeTruthy();
    act(() => {
      lowScoreOtherInput!.value = 'low-score reason';
      lowScoreOtherInput?.dispatchEvent(new Event('input', { bubbles: true }));
      useFeedbackPopoverStore.getState().setLowScoreOtherIssueDetail('low-score reason');
    });
    await flush();
    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('low-score reason');

    const highScoreButton = getScoreButton(9);
    expect(highScoreButton).toBeTruthy();
    act(() => {
      highScoreButton?.click();
    });
    await flush();

    const highScoreOtherIssueCheckbox = (Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[]).at(-1) ?? null;
    expect(highScoreOtherIssueCheckbox).toBeTruthy();
    act(() => {
      highScoreOtherIssueCheckbox?.click();
    });
    await flush();

    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('');

    act(() => {
      useFeedbackPopoverStore.getState().setHighScoreOtherIssueDetail('high-score reason');
    });
    await flush();
    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('high-score reason');

    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('low-score reason');
  });

  it('stores the close time in localStorage when the user dismisses the feedback popover with the close button', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const closeButton = getPopoverCloseButton();
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.click();
    });
    await flush();

    const storedValue = window.localStorage.getItem('feedbackCloseTime:domain-1');
    expect(storedValue).toBeTruthy();
    expect(Number(storedValue)).toBeGreaterThan(0);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('falls back to the base feedback close key when domainId is unavailable', async () => {
    mockedGetDomainId.mockReturnValue('');
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const closeButton = getPopoverCloseButton();
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.click();
    });
    await flush();

    const storedValue = window.localStorage.getItem('feedbackCloseTime');
    expect(storedValue).toBeTruthy();
    expect(Number(storedValue)).toBeGreaterThan(0);
  });

  it('auto closes an auto-opened feedback popover after 60s when no score is selected', async () => {
    vi.useFakeTimers();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps an auto-opened feedback popover open after 60s when a score was selected', async () => {
    vi.useFakeTimers();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const scoreButton = getScoreButton(6);
    expect(scoreButton).toBeTruthy();
    act(() => {
      scoreButton?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('closes the feedback popover shortly after the mouse leaves before any score is selected', async () => {
    vi.useFakeTimers();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    const anchor = getFeedbackAnchor();
    expect(anchor).toBeTruthy();

    act(() => {
      anchor?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('skips the feedback date check when skip auth is enabled', async () => {
    mockedGetIsSkipAuth.mockReturnValue(true);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(mockSubmitFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the feedback popover open when the mouse leaves after a score is selected', async () => {
    vi.useFakeTimers();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const scoreButton = getScoreButton(6);
    expect(scoreButton).toBeTruthy();
    act(() => {
      scoreButton?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const anchor = getFeedbackAnchor();
    expect(anchor).toBeTruthy();
    act(() => {
      anchor?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('keeps the feedback popover open when the mouse re-enters before the delayed close fires', async () => {
    vi.useFakeTimers();
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const anchor = getFeedbackAnchor();
    expect(anchor).toBeTruthy();

    act(() => {
      anchor?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    act(() => {
      anchor?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });

    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('uses auto height and computes the popover max height from viewport', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(
        React.createElement(
          'div',
          { 'data-testid': 'right-content-frame' },
          React.createElement(RightContentHeader),
        ),
      );
    });
    await flush();
    await flush();

    const frame = container.querySelector('[data-testid="right-content-frame"]') as HTMLDivElement | null;
    const smileButton = getSmileButton();

    expect(frame).toBeTruthy();
    expect(smileButton).toBeTruthy();

    Object.defineProperty(frame!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 700,
        width: 1000,
        height: 700,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    Object.defineProperty(smileButton!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 100,
        top: 80,
        right: 128,
        bottom: 120,
        width: 28,
        height: 40,
        x: 100,
        y: 80,
        toJSON: () => ({}),
      }),
    });

    await flush();
    await flush();

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await flush();

    const popover = container.querySelector('[role="dialog"]') as HTMLDivElement | null;
    const popoverContent = container.querySelector('.ui-content-header-feedback-popover-content') as HTMLDivElement | null;
    expect(popover).toBeTruthy();
    expect(popover?.style.height).toBe('auto');
    expect(popoverContent).toBeTruthy();
    expect(popoverContent?.style.maxHeight).toBe('604px');
  });

  it('uses shared input styles for the detail textarea and other issue input', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === '评分 6');
    expect(lowScoreButton).toBeTruthy();

    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const detailTextarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(detailTextarea).toBeTruthy();
    expect(detailTextarea?.className).toContain('ui-textarea');
    expect(detailTextarea?.className).toContain('ui-content-header-feedback-detail-input');
    expect(detailTextarea?.value).toBe(detailTemplate);

    const otherIssueLabel = Array.from(container.querySelectorAll('label')).find((label) => label.textContent?.includes('其他问题'));
    const otherIssueCheckbox = otherIssueLabel?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const effectiveOtherIssueCheckbox =
      (otherIssueCheckbox ?? Array.from(container.querySelectorAll('input[type="checkbox"]')).at(-1)) as HTMLInputElement | undefined;
    expect(effectiveOtherIssueCheckbox).toBeTruthy();

    act(() => {
      effectiveOtherIssueCheckbox?.click();
    });
    await flush();

    const otherIssueInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(otherIssueInput).toBeTruthy();
    expect(otherIssueInput?.className).toContain('ui-input');

    const actions = container.querySelector('.ui-content-header-feedback-low-score-actions') as HTMLDivElement | null;
    const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    const [cancelButton, submitButton] = actionButtons;
    expect(cancelButton).toBeTruthy();
    expect(cancelButton?.className).toContain('ui-button-default');
    expect(submitButton).toBeTruthy();
    expect(submitButton?.className).toContain('ui-button-primary');
  });

  it('uses nss score icons for selected score ranges', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();
    const lowScoreIcon = lowScoreButton?.querySelector('img');
    expect(lowScoreButton?.className).toContain('ui-content-header-feedback-score-selected');
    expect(lowScoreButton?.className).not.toContain('ui-content-header-feedback-score-active-negative');
    expect(lowScoreIcon?.getAttribute('src')).toBe('/icons/nss/1.svg');
    expect(lowScoreIcon?.getAttribute('width')).toBe('24');
    expect(lowScoreIcon?.getAttribute('height')).toBe('24');
    expect(lowScoreIcon?.className).toContain('h-6');
    expect(lowScoreIcon?.className).toContain('w-6');

    const warningScoreButton = getScoreButton(7);
    expect(warningScoreButton).toBeTruthy();
    act(() => {
      warningScoreButton?.click();
    });
    await flush();
    const warningScoreIcon = warningScoreButton?.querySelector('img');
    expect(warningScoreButton?.className).toContain('ui-content-header-feedback-score-selected');
    expect(warningScoreButton?.className).not.toContain('ui-content-header-feedback-score-active-warning');
    expect(warningScoreIcon?.getAttribute('src')).toBe('/icons/nss/2.svg');
    expect(warningScoreIcon?.getAttribute('width')).toBe('24');
    expect(warningScoreIcon?.getAttribute('height')).toBe('24');

    const positiveScoreButton = getScoreButton(9);
    expect(positiveScoreButton).toBeTruthy();
    act(() => {
      positiveScoreButton?.click();
    });
    await flush();
    const positiveScoreIcon = positiveScoreButton?.querySelector('img');
    expect(positiveScoreButton?.className).toContain('ui-content-header-feedback-score-selected');
    expect(positiveScoreButton?.className).not.toContain('ui-content-header-feedback-score-active-positive');
    expect(positiveScoreIcon?.getAttribute('src')).toBe('/icons/nss/3.svg');
    expect(positiveScoreIcon?.getAttribute('width')).toBe('24');
    expect(positiveScoreIcon?.getAttribute('height')).toBe('24');
  });

  it('requires low-score detail beyond the prefilled template before submitting', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();
    expect(textarea?.value).toBe(detailTemplate);

    const firstCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstCheckbox).toBeTruthy();
    act(() => {
      firstCheckbox?.click();
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.click();
    });
    await flush();
    expect(getFetchCallsByMethod('POST')).toHaveLength(0);
    expect(container.textContent).toContain('输入不能为空');
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('submits score reason as question_1 for scores 0 through 8', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const scoreButton = getScoreButton(8);
    expect(scoreButton).toBeTruthy();
    act(() => {
      scoreButton?.click();
    });
    await flush();

    const firstCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstCheckbox).toBeTruthy();
    act(() => {
      firstCheckbox?.click();
      useFeedbackPopoverStore.getState().setLowScoreDetail('【使用场景】：测试\n【优化意见】：需要补充');
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();
    act(() => {
      submitButton?.click();
    });
    await flush();
    await flush();

    expect(getLatestPostAnswers()[1]?.questionId).toBe('question_1');
    expect(getLatestPostAnswers()[1]?.answer).toBe('0');
    expect(getLatestPostAnswers()[1]?.subName).toBe('您在使用过程中遇到了哪些问题？');
    expect(getLatestPostAnswers()[2]?.subName).toBe('您还有其它意见和建议吗？');
  });

  it('submits high-score feedback without requiring detail input', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const scoreButton = getScoreButton(9);
    expect(scoreButton).toBeTruthy();
    act(() => {
      scoreButton?.click();
    });
    await flush();
    expect(container.textContent).toContain('您感到满意的原因是？（选择您最关注的三项）');
    expect(container.textContent).toContain('您还有其它意见和建议吗？(可选)');
    expect((container.querySelector('textarea') as HTMLTextAreaElement | null)?.value).toBe(detailTemplate);

    const firstCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstCheckbox).toBeTruthy();
    act(() => {
      firstCheckbox?.click();
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();
    act(() => {
      submitButton?.click();
    });
    await flush();
    await flush();

    expect(getLatestPostAnswers()[1]?.questionId).toBe('question_2');
    expect(getLatestPostAnswers()[1]?.answer).toBe('0');
    expect(getLatestPostAnswers()[1]?.subName).toBe('您感到满意的原因是？');
    expect(getLatestPostAnswers()[2]?.subName).toBe('您还有其它意见和建议吗？');
    expect(getLatestPostAnswers()[2]?.answer).toBe('');
  });

  it('uses the current domainId as feedback w3account when submitting', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    const scoreButton = getScoreButton(9);
    expect(scoreButton).toBeTruthy();
    act(() => {
      scoreButton?.click();
    });
    await flush();

    const firstCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstCheckbox).toBeTruthy();
    act(() => {
      firstCheckbox?.click();
      useFeedbackPopoverStore.getState().setLowScoreDetail(detailTemplate);
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();
    act(() => {
      submitButton?.click();
    });
    await flush();
    await flush();

    expect(getLatestPostBody().data?.w3account).toBe('domain-1');
  });

  it('shows an inline error only when other issue is selected without input', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const otherIssueCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const otherIssueCheckbox = otherIssueCheckboxes.at(-1) ?? null;
    expect(otherIssueCheckbox).toBeTruthy();

    act(() => {
      otherIssueCheckbox?.click();
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.click();
    });
    await flush();

    expect(getFetchCallsByMethod('POST')).toHaveLength(0);
    expect(container.textContent).toContain('输入不能为空');
    expect(container.textContent).not.toContain('请先完成必填项');
  });

  it('shows both other-issue and detail errors when both are empty on low-score submit', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
      useFeedbackPopoverStore.getState().setLowScoreDetail('');
    });
    await flush();

    const otherIssueCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const otherIssueCheckbox = otherIssueCheckboxes.at(-1) ?? null;
    expect(otherIssueCheckbox).toBeTruthy();

    act(() => {
      otherIssueCheckbox?.click();
    });
    await flush();

    const submitButton = container.querySelector('.ui-button-primary') as HTMLButtonElement | null;
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.click();
    });
    await flush();

    expect(getFetchCallsByMethod('POST')).toHaveLength(0);
    expect(container.querySelectorAll('.ui-content-header-feedback-other-error')).toHaveLength(1);
    expect(container.querySelectorAll('.ui-content-header-feedback-detail-error')).toHaveLength(1);
  });

  it('shows both selection and detail errors when no option is selected and detail is empty', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
      useFeedbackPopoverStore.getState().setLowScoreDetail('');
    });
    await flush();

    const submitButton = container.querySelector('.ui-button-primary') as HTMLButtonElement | null;
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.click();
    });
    await flush();

    expect(getFetchCallsByMethod('POST')).toHaveLength(0);
    expect(container.querySelectorAll('.ui-content-header-feedback-other-error')).toHaveLength(1);
    expect(container.querySelectorAll('.ui-content-header-feedback-detail-error')).toHaveLength(1);
  });

  it('shows selection and detail errors when no checkbox is selected on submit', async () => {
    mockSubmitFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: '' }),
    } as Response);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    const lowScoreButton = getScoreButton(6);
    expect(lowScoreButton).toBeTruthy();
    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('提交'));
    expect(submitButton).toBeTruthy();

    act(() => {
      submitButton?.click();
    });
    await flush();

    expect(getFetchCallsByMethod('POST')).toHaveLength(0);
    expect(container.textContent).toContain('选择不能为空');
    expect(container.textContent).not.toContain('请先完成必填项');
    expect(container.textContent).toContain('输入不能为空');
  });
});
