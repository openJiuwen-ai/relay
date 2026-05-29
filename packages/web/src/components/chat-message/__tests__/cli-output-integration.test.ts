/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F097: Integration — ChatMessage renders CliOutputBlock instead of ToolEventsPanel + 💭心里话
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

vi.mock('@/hooks/useTts', () => ({
  useTts: () => ({ state: 'idle', synthesize: vi.fn(), activeMessageId: null }),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({ agents: [], isLoading: false, getAgentById: () => undefined, getAgentsByBreed: () => new Map() }),
}));

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
  useChatStore.setState({
    currentThreadId: 'thread-1',
    rightPanelMode: 'status',
    pptStudioSessions: {},
    workspaceWorktreeId: 'wt-123',
    threads: [
      {
        id: 'thread-1',
        title: 'PPT Thread',
        projectPath: '/repo/project',
        createdBy: 'user',
        participants: ['user', 'opus'],
        lastActiveAt: 1,
        createdAt: 1,
      },
    ],
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useChatStore.setState({
    rightPanelMode: 'status',
    pptStudioSessions: {},
    workspaceWorktreeId: null,
    threads: [],
  });
});

const getAgentById = () => undefined;

describe('ChatMessage CLI Output integration', () => {
  it('renders "CLI Output" instead of "💭 心里话" for stream messages with tools', () => {
    const msg = {
      id: 'msg-1',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'stream stdout',
      origin: 'stream' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Read foo.ts', timestamp: 1000 }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getAgentById }));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('已执行1次工具调用');
    expect(text).not.toContain('💭 心里话');
  });

  it('keeps 🧠 Thinking independent from CLI block', () => {
    const ts = Date.now();
    const msg = {
      id: 'msg-2',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'final answer',
      thinking: 'reasoning here',
      origin: 'stream' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Edit bar.ts', timestamp: ts }],
      timestamp: ts,
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getAgentById }));
    });
    expect(container.querySelector('[data-testid="thinking-toggle"]')?.textContent).toContain('思考执行完成');
    // CLI block should also exist
    expect(container.textContent).toContain('已执行1次工具调用');
  });

  it('callback origin: content text shown ABOVE CLI block', () => {
    const msg = {
      id: 'msg-3',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'Here is the answer',
      origin: 'callback' as const,
      toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'Read x.ts', timestamp: 1000 }],
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getAgentById }));
    });
    const text = container.textContent ?? '';
    const answerIdx = text.indexOf('Here is the answer');
    const cliIdx = text.indexOf('已执行1次工具调用');
    expect(answerIdx).toBeGreaterThanOrEqual(0);
    expect(cliIdx).toBeGreaterThan(answerIdx);
  });

  it('stream origin with only content (no tools) keeps plain stream text without tool-call header', () => {
    const msg = {
      id: 'msg-4',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'some CLI output',
      origin: 'stream' as const,
      timestamp: Date.now(),
      isStreaming: false,
    };
    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getAgentById }));
    });
    expect(container.textContent).toContain('some CLI output');
    expect(container.textContent).not.toContain('已执行0次工具调用');
  });

  it('parses preview-stage ppt pages marker into ppt studio recovery state and shows unified ppt session card at bottom', () => {
    const msg = {
      id: 'msg-5',
      type: 'assistant' as const,
      agentId: 'opus',
      content: 'HTML 已生成\n<!-- artifact:pptx-pages output/demo/pages -->',
      origin: 'stream' as const,
      timestamp: Date.now(),
      isStreaming: false,
    };

    act(() => {
      root.render(React.createElement(ChatMessage, { message: msg, getAgentById }));
    });

    expect(useChatStore.getState().rightPanelMode).toBe('fileBrowser');
    expect(useChatStore.getState().activePptPagesDir).toBe('output/demo/pages');
    expect(useChatStore.getState().pptStudioSessions['output/demo/pages']).toEqual(
      expect.objectContaining({
        projectRoot: '/repo/project',
        pagesDir: 'output/demo/pages',
      }),
    );
    const pptCard = container.querySelector('[data-testid="cli-output-ppt-card"]');
    expect(pptCard).not.toBeNull();
    expect(pptCard?.textContent).toMatch(/正在生成中|未收到可下载/);
  });

  it('designer skill documents ppt-slide layout (spec drift guard)', () => {
    const designerSkill = readFileSync(
      resolve(process.cwd(), '../../office-claw-skills/pptx-craft/designer/SKILL.md'),
      'utf8',
    );

    expect(designerSkill).toContain('.ppt-slide');
    expect(designerSkill).toContain('1280');
  });
});
