/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const storeState = {
  uiThinkingExpandedByDefault: false,
  threads: [] as { id: string; projectPath?: string }[],
  currentThreadId: 'thread-1',
  hasActiveInvocation: false,
  targetAgents: [] as string[],
  agentInvocations: {} as Record<string, unknown>,
  activeInvocations: {} as Record<string, unknown>,
};

vi.mock('@/stores/chatStore', () => {
  const useChatStore = Object.assign((selector: (s: typeof storeState) => unknown) => selector(storeState), {
    getState: () => storeState,
  });
  return { useChatStore };
});

describe('ChatMessage system warning', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders warning system messages visibly', async () => {
    const { ChatMessage } = await import('@/components/chat-message');
    const message = {
      id: 'sys-warning',
      type: 'system',
      variant: 'warning',
      content: '智能体间链式调用已达到最大深度限制：15，调用停止',
      timestamp: Date.now(),
    } as ChatMessageType;

    act(() => {
      root.render(React.createElement(ChatMessage, { message, getAgentById: () => undefined }));
    });

    const bubble = container.querySelector('[data-message-id="sys-warning"] > div');
    expect(container.textContent).toContain('智能体间链式调用已达到最大深度限制：15，调用停止');
    expect(bubble?.className).not.toContain('hidden');
    expect(bubble?.className).toContain('bg-amber-50');
  });
});
