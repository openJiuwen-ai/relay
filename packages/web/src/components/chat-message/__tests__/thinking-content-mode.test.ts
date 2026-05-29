/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F097: Thinking UI behavior — updated for CliOutputBlock architecture
 * - Thinking: independent collapsible panel
 * - Tool calls: rendered via CliOutputBlock
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));
vi.mock('@/components/rich/RichBlocks', () => ({ RichBlocks: () => null }));

const { ChatMessage } = await import('../components/ChatMessage');

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
  useChatStore.getState().setUiThinkingExpandedByDefault(false);
  useChatStore.setState({ hasActiveInvocation: true, targetAgents: ['opus'] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useChatStore.setState({ hasActiveInvocation: false, targetAgents: [] });
});

const thinkingMessage = {
  id: 'msg-1',
  type: 'assistant' as const,
  agentId: 'opus',
  content: 'CLI stream output text',
  thinking: 'Extended reasoning content here',
  origin: 'stream' as const,
  timestamp: Date.now(),
  isStreaming: false,
};

const getAgentById = () => undefined;

describe('ThinkingContent default collapse', () => {
  it('default: completed thinking is collapsed, completed tool block is collapsed', () => {
    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: thinkingMessage,
          getAgentById,
        }),
      );
    });

    const thinkingButton = container.querySelector('[data-testid="thinking-toggle"]');
    expect(thinkingButton?.textContent).toContain('思考执行完成');
    expect(container.querySelector('[data-testid="cli-output-toggle"]')).toBeNull();
    expect(container.querySelector('.thinking-output-body')).toBeNull();
  });

  it('adds horizontal padding to the thinking header toggle so the status icon is not flush to the clipped edge', () => {
    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: thinkingMessage,
          getAgentById,
        }),
      );
    });

    const thinkingButton = container.querySelector('[data-testid="thinking-toggle"]');
    expect(thinkingButton?.className).toContain('px-2');
  });

  it('global toggle: enabling expands thinking block', () => {
    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: thinkingMessage,
          getAgentById,
        }),
      );
    });

    expect(container.querySelector('.thinking-output-body')).toBeNull();

    act(() => {
      useChatStore.getState().setUiThinkingExpandedByDefault(true);
    });

    expect(container.querySelector('.thinking-output-body')).toBeTruthy();
    expect(container.textContent).toContain('Extended reasoning content here');
  });

  it('streaming thinking shows in-progress thinking and tool labels', () => {
    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: {
            ...thinkingMessage,
            id: 'msg-streaming',
            isStreaming: true,
            content: '',
            toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Read foo.ts', timestamp: 1000 }],
          },
          getAgentById,
        }),
      );
    });

    expect(container.querySelector('[data-testid="thinking-toggle"]')?.textContent).toContain('思考执行中');
    expect(container.querySelector('[data-testid="cli-output-toggle"]')?.textContent).toContain('正在执行工具调用');
    expect(container.querySelector('.thinking-output-body')).toBeTruthy();
  });

  it('auto-collapse: streaming thinking collapses when done', () => {
    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: {
            ...thinkingMessage,
            id: 'msg-streaming-to-done',
            isStreaming: true,
            content: '',
          },
          getAgentById,
        }),
      );
    });

    expect(container.querySelector('.thinking-output-body')).toBeTruthy();

    act(() => {
      root.render(
        React.createElement(ChatMessage, {
          message: {
            ...thinkingMessage,
            id: 'msg-streaming-to-done',
            isStreaming: false,
            content: '',
          },
          getAgentById,
        }),
      );
    });

    expect(container.querySelector('[data-testid="thinking-toggle"]')?.textContent).toContain('思考执行完成');
    expect(container.querySelector('.thinking-output-body')).toBeNull();
  });
});
