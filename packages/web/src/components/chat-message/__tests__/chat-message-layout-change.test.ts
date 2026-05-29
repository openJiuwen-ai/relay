/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';

const layoutChangeChatStoreState = {
  uiThinkingExpandedByDefault: false,
  threads: [] as { id: string; projectPath?: string }[],
  currentThreadId: 'default',
  hasActiveInvocation: false,
  targetAgents: [] as string[],
  agentInvocations: {} as Record<string, unknown>,
  activeInvocations: {} as Record<string, unknown>,
  pptStudioSessions: {} as Record<string, unknown>,
};

vi.mock('@/stores/chatStore', () => {
  const useChatStore = Object.assign(
    (selector: (s: typeof layoutChangeChatStoreState) => unknown) => selector(layoutChangeChatStoreState),
    { getState: () => layoutChangeChatStoreState },
  );
  return { useChatStore };
});

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('ChatMessage layout-change event timing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('dispatches chat-layout-changed after thinking collapse state commits (cloud P2)', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    const message = {
      id: 'm1',
      type: 'assistant',
      agentId: 'codex',
      timestamp: Date.now(),
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'assistant',
      variant: null,
      isStreaming: false,
      content: '',
      thinking: 'hello thinking',
      contentBlocks: null,
      toolEvents: null,
      metadata: null,
      summary: null,
      evidence: null,
      extra: null,
      source: null,
    } as const;

    let expandedPresentAtEvent: boolean | null = null;
    const handler = () => {
      expandedPresentAtEvent = Boolean(container.querySelector('div.cli-output-md'));
    };
    window.addEventListener('office-claw:chat-layout-changed', handler);

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: message as unknown as ChatMessageType,
          getAgentById: () => undefined,
        }),
      );
    });

    const thinkingToggle = container.querySelector('[data-testid="thinking-toggle"]');
    expect(thinkingToggle).toBeTruthy();

    act(() => {
      (thinkingToggle as HTMLButtonElement).click();
    });

    expect(container.querySelector('div.cli-output-md')).toBeTruthy();
    expect(expandedPresentAtEvent).toBe(true);

    window.removeEventListener('office-claw:chat-layout-changed', handler);
  });

  it('dispatches chat-layout-changed after CLI output block collapse state commits (cloud P2)', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    const message = {
      id: 'm2',
      type: 'assistant',
      agentId: 'codex',
      timestamp: Date.now(),
      visibility: 'public',
      revealedAt: null,
      whisperTo: null,
      origin: 'assistant',
      variant: null,
      isStreaming: false,
      content: '',
      thinking: '',
      contentBlocks: null,
      toolEvents: [{ id: 't1', type: 'tool_use', label: 'tool 1', detail: 'detail-1', timestamp: 1000 }],
      metadata: null,
      summary: null,
      evidence: null,
      extra: null,
      source: null,
    } as const;

    let expandedPresentAtEvent: boolean | null = null;
    const handler = () => {
      // CliOutputBlock uses data-testid="cli-output-body" when expanded
      expandedPresentAtEvent = Boolean(container.querySelector('[data-testid="cli-output-body"]'));
    };
    window.addEventListener('office-claw:chat-layout-changed', handler);

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: message as unknown as ChatMessageType,
          getAgentById: () => undefined,
        }),
      );
    });

    // F097: now uses CliOutputBlock summary line instead of ToolEventsPanel
    const cliToggle = container.querySelector('[data-testid="cli-output-toggle"]');
    expect(cliToggle).toBeTruthy();

    act(() => {
      (cliToggle as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-testid="cli-output-body"]')).toBeTruthy();
    expect(expandedPresentAtEvent).toBe(true);

    window.removeEventListener('office-claw:chat-layout-changed', handler);
  });
});
