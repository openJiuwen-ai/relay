/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Thinking UI behavior (2026-03-01):
 * - Default is COLLAPSED
 * - `Thread.thinkingMode` does NOT control UI expansion/collapse
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

// ── Stub hooks used by ChatMessage ──
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({ agents: [], isLoading: false, getAgentById: () => undefined, getAgentsByBreed: () => new Map() }),
}));
vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));

// ── Stub heavy sub-components ──
vi.mock('@/components/AgentAvatar', () => ({
  AgentAvatar: () => React.createElement('span', null, 'avatar'),
}));
vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('span', null, content),
}));
vi.mock('../components/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('../components/MetadataBadge', () => ({ MetadataBadge: () => null }));
vi.mock('@/components/rich/RichBlocks', () => ({ RichBlocks: () => null }));

const THINKING_TEXT = 'I am thinking about the meaning of cats and coffee.';

describe('F045: ThinkingContent thinkingMode toggle', () => {
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
    // Stable baseline for each test
    useChatStore.getState().setUiThinkingExpandedByDefault(false);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  const thinkingMsg = {
    id: 't1',
    type: 'assistant' as const,
    agentId: 'opus',
    content: 'visible reply',
    thinking: THINKING_TEXT,
    timestamp: Date.now(),
    contentBlocks: [],
  };

  const getAgentById = vi.fn(() => ({
    id: 'opus',
    displayName: '布偶猫',
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    breedId: 'ragdoll',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    avatar: '/avatars/opus.png',
    mentionPatterns: [],
    roleDescription: '',
    personality: '',
  }));

  it('default: completed thinking block is collapsed', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: thinkingMsg as never,
          getAgentById: getAgentById as never,
        }),
      );
    });

    // Collapsed: button visible with label, full thinking text NOT rendered
    const thinkingButton = container.querySelector('[data-testid="thinking-toggle"]');
    expect(thinkingButton).toBeTruthy();

    // Full content should NOT be in the DOM when collapsed
    // The border-l-2 div with MarkdownContent only renders when expanded
    const expandedBlocks = container.querySelectorAll('.cli-output-md');
    expect(expandedBlocks.length).toBe(0);
  });

  it('global toggle: expand then collapse re-renders already-mounted blocks', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: thinkingMsg as never,
          getAgentById: getAgentById as never,
        }),
      );
    });

    expect(container.querySelectorAll('.cli-output-md').length).toBe(0);

    // Expand globally
    act(() => {
      useChatStore.getState().setUiThinkingExpandedByDefault(true);
    });

    expect(container.querySelectorAll('.cli-output-md').length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain(THINKING_TEXT);

    // Collapse globally again
    act(() => {
      useChatStore.getState().setUiThinkingExpandedByDefault(false);
    });

    expect(container.querySelectorAll('.cli-output-md').length).toBe(0);
  });

  it('normalizes pathological hard-wrapped thinking text after hydration', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    act(() => {
      useChatStore.getState().setUiThinkingExpandedByDefault(true);
      root.render(
        React.createElement(ChatMessage, {
          message: {
            ...thinkingMsg,
            id: 't2',
            thinking: '用户\n\n通过\n\ncat\n\nca\n\nfe\n\n频道\n\n发送\n\n了一条\n\n消息\n\n，\n\n内容\n\n是',
          } as never,
          getAgentById: getAgentById as never,
        }),
      );
    });

    const flat = (container.textContent ?? '').replace(/\s+/g, '');
    expect(flat).toContain('用户通过catcafe频道发送了一条消息，内容是');
    expect(flat).not.toContain('catca fe');
  });

  it('stream-origin messages render via CliOutputBlock (F097)', async () => {
    const { ChatMessage } = await import('@/components/chat-message');

    const streamMsg = {
      id: 's1',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'stream inner monologue content here',
      origin: 'stream',
      isStreaming: false,
      timestamp: Date.now(),
      contentBlocks: [],
    };

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: streamMsg as never,
          getAgentById: getAgentById as never,
        }),
      );
    });

    // F097: stream content without tool calls keeps plain stream output
    expect(container.querySelector('[data-testid="cli-output-toggle"]')).toBeNull();
    expect(container.textContent).toContain('stream inner monologue content here');

    expect(container.textContent).not.toContain('已执行0次工具调用');
  });
});
