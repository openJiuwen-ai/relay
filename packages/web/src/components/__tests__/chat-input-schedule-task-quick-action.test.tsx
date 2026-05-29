/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, threadDrafts } from '@/components/chat-input/ChatInput';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { useChatStore } from '@/stores/chatStore';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/chat-input/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [
      {
        id: 'office',
        displayName: '通用助手',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@通用助手', '@office'],
        avatar: '',
        roleDescription: '通用助手',
        personality: '',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
      {
        id: 'assistant',
        displayName: '逻辑大师',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@逻辑大师', '@assistant'],
        avatar: '',
        roleDescription: '逻辑大师',
        personality: '',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
      {
        id: 'agentteams',
        displayName: '人文顾问',
        color: { primary: '#1476ff', secondary: '#eff6ff' },
        mentionPatterns: ['@人文顾问', '@agentteams'],
        avatar: '',
        roleDescription: '人文顾问',
        personality: '',
        provider: 'openai',
        defaultModel: '',
        source: 'seed',
        roster: null,
      },
    ],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));
vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: () => Promise.resolve([]),
  seedSkillOptionsCache: vi.fn(),
  SKILL_OPTIONS_UPDATED_EVENT: 'skill-options-updated',
}));

const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === '/icons/schedule.svg');
const expertDebateAction = QUICK_ACTIONS.find((action) => action.icon === '/icons/expert-debate.svg');

if (!scheduledTaskAction) {
  throw new Error('Missing scheduled task quick action config');
}

if (!expertDebateAction || !expertDebateAction.expertCards?.length) {
  throw new Error('Missing expert debate quick action config');
}
const expertDebateCards = expertDebateAction.expertCards;

function flush() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let resizeObserverCallback: ResizeObserverCallback | null = null;

class MockResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe('ChatInput scheduled task quick action injection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    threadDrafts.clear();
    useChatStore.setState({
      activeInvocations: {},
      hasActiveInvocation: false,
      targetAgents: [],
      pendingChatInsert: null,
    });
    resizeObserverCallback = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    threadDrafts.clear();
    useChatStore.setState({ pendingChatInsert: null });
  });

  it('shows an overflow toggle and expands quick actions upward when the quick action row overflows', async () => {
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend: vi.fn() }));
    });
    const quickActionsContainer = container.querySelector('[data-testid="chat-input-quick-actions-row"]')
      ?.parentElement as HTMLDivElement | null;
    const quickActionsRow = container.querySelector('[data-testid="chat-input-quick-actions-row"]') as HTMLDivElement;
    const quickActionButtons = Array.from(
      quickActionsRow.querySelectorAll<HTMLButtonElement>('[data-quick-action-button="true"]'),
    );
    expect(quickActionsContainer).not.toBeNull();
    expect(quickActionsRow).not.toBeNull();
    expect(quickActionButtons.length).toBeGreaterThan(0);

    Object.defineProperty(quickActionsContainer, 'clientWidth', { configurable: true, value: 240 });
    Object.defineProperty(quickActionsRow, 'clientWidth', { configurable: true, value: 240 });
    for (const button of quickActionButtons) {
      Object.defineProperty(button, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
          ({
            width: 120,
            height: 32,
            top: 0,
            left: 0,
            right: 120,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) satisfies DOMRect,
      });
    }

    await act(async () => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      await Promise.resolve();
    });

    const expandButton = container.querySelector('[aria-label="展开快捷操作"]') as HTMLButtonElement | null;
    expect(expandButton).not.toBeNull();
    expect(expandButton?.className).toContain('h-5');
    expect(expandButton?.className).toContain('w-5');
    expect(expandButton?.className).toContain('mt-[7px]');
    expect(expandButton?.className).toContain('self-start');
    expect(expandButton?.className).not.toContain('h-8');
    expect(expandButton?.className).not.toContain('w-8');
    expect(quickActionsRow.className).toContain('flex-nowrap');
    expect(quickActionsRow.className).toContain('overflow-hidden');
    expect(quickActionsRow.className).toContain('chat-input-quick-actions-fade');

    act(() => {
      expandButton?.click();
    });

    expect(container.querySelector('[data-testid="chat-input-quick-actions-expanded"]')).toBeNull();
    expect(quickActionsRow.className).toContain('flex-wrap');
    expect(quickActionsRow.className).toContain('overflow-visible');
    expect(quickActionsRow.className).not.toContain('chat-input-quick-actions-fade');
    const collapseButton = container.querySelector('[aria-label="收起快捷操作"]') as HTMLButtonElement | null;
    expect(collapseButton).not.toBeNull();
    expect(quickActionsRow.contains(collapseButton)).toBe(false);
    expect(collapseButton?.className).toContain('self-end');
    expect(collapseButton?.className).not.toContain('mt-[7px]');
    expect(collapseButton?.className).not.toContain('self-start');

    act(() => {
      collapseButton?.click();
    });

    expect(quickActionsRow.className).toContain('flex-nowrap');
    expect(quickActionsRow.className).toContain('overflow-hidden');
    expect(container.querySelector('[aria-label="展开快捷操作"]')).not.toBeNull();

    Object.defineProperty(quickActionsContainer, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(quickActionsRow, 'clientWidth', { configurable: true, value: 640 });
    for (const button of quickActionButtons) {
      Object.defineProperty(button, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
          ({
            width: 48,
            height: 32,
            top: 0,
            left: 0,
            right: 48,
            bottom: 32,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) satisfies DOMRect,
      });
    }

    await act(async () => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      await Promise.resolve();
    });

    expect(container.querySelector('[aria-label="展开快捷操作"]')).toBeNull();
  });

  it('expands the scheduled-task quick prompts after pending insert without auto-sending', async () => {
    const onSend = vi.fn();
    const token = `[[quick_action:${scheduledTaskAction.label}]] `;

    useChatStore.setState({
      pendingChatInsert: {
        threadId: 'thread-1',
        text: token,
      },
    });

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const quickActionToken = container.querySelector('[data-token-type="quick-action"]') as HTMLElement | null;
    expect(quickActionToken?.textContent).toContain(scheduledTaskAction.label);
    expect(useChatStore.getState().pendingChatInsert).toBeNull();
    expect(onSend).not.toHaveBeenCalled();

    for (const prompt of scheduledTaskAction.prompts) {
      expect(container.textContent).toContain(prompt);
    }
  });

  it('consumes a pending insert only once under StrictMode', async () => {
    const onSend = vi.fn();
    const text = '按照以下要求修改定时任务「晨报提醒」（任务ID：task-123）：';
    useChatStore.setState({
      pendingChatInsert: {
        threadId: 'thread-1',
        text,
      },
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(ChatInput, { threadId: 'thread-1', onSend }),
        ),
      );
    });
    await flush();

    const textbox = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(textbox).toBeTruthy();
    const content = textbox?.textContent ?? '';
    expect(content).toContain(text);
    expect(content.split(text).length - 1).toBe(1);
    expect(useChatStore.getState().pendingChatInsert).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('replaces a trailing bare @ when an invited expert is injected', async () => {
    const onSend = vi.fn();
    threadDrafts.set('thread-1', '@');
    useChatStore.setState({
      pendingChatInsert: {
        threadId: 'thread-1',
        text: '@古诗词创作专家 ',
        replaceTrailingMentionTrigger: true,
      },
    });

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const textbox = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(textbox).toBeTruthy();
    expect(textbox!.textContent).toBe('@古诗词创作专家 ');
    expect(textbox!.textContent?.split('@古诗词创作专家').length).toBe(2);
    expect(textbox!.textContent?.split('@').length - 1).toBe(1);
    expect(useChatStore.getState().pendingChatInsert).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('undoes expert card autofill back to the quick-action capsule state', async () => {
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend: vi.fn() }));
    });
    await flush();

    const quickActionButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(expertDebateAction.label),
    ) as HTMLButtonElement | undefined;
    expect(quickActionButton).toBeTruthy();

    act(() => {
      quickActionButton?.click();
    });
    await flush();

    const firstCard = expertDebateCards[0];
    expect(firstCard).toBeTruthy();
    if (!firstCard) return;
    const expertCardButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(firstCard.agentName),
    ) as HTMLButtonElement | undefined;
    expect(expertCardButton).toBeTruthy();

    act(() => {
      expertCardButton!.click();
    });
    await flush();

    const textbox = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(textbox).toBeTruthy();
    expect(textbox!.textContent).toContain(expertDebateAction.label);
    expect(textbox!.textContent).toContain('@通用助手');
    expect(textbox!.textContent).toContain('@逻辑大师');
    expect(textbox!.textContent).toContain('@人文顾问');

    act(() => {
      textbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await flush();

    expect(textbox!.textContent).toContain(expertDebateAction.label);
    expect(textbox!.textContent).not.toContain('@通用助手');
    expect(textbox!.textContent).not.toContain('@逻辑大师');
    expect(textbox!.textContent).not.toContain('@人文顾问');
  });
  it('renders the first expert debate card with three highlighted mentions and no duplicated lead mention', async () => {
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend: vi.fn() }));
    });
    await flush();

    const quickActionButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(expertDebateAction.label),
    ) as HTMLButtonElement | undefined;
    expect(quickActionButton).toBeTruthy();

    act(() => {
      quickActionButton!.click();
    });
    await flush();

    const firstCardButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.querySelectorAll('.text-\\[var\\(--text-accent\\)\\]').length === 3,
    ) as HTMLButtonElement | undefined;
    expect(firstCardButton).toBeTruthy();

    const highlightedMentions = Array.from(firstCardButton!.querySelectorAll('.text-\\[var\\(--text-accent\\)\\]')).map((node) =>
      node.textContent?.trim(),
    );

    expect(highlightedMentions).toEqual(['@通用助手', '@逻辑大师', '@人文顾问']);
    expect(firstCardButton!.textContent?.match(/@通用助手/g)?.length).toBe(1);
  });
});
