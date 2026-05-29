/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Connector bubble theming
 * - GitHub Review notifications should be visually distinct from generic connector bubbles.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/chat-types';
import { ConnectorBubble } from '../components/ConnectorBubble';

describe('ConnectorBubble theme', () => {
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

  it('uses purple theme for vote-result connector', () => {
    const message: ChatMessage = {
      id: 'm-vote',
      type: 'connector',
      content: '投票结果: 谁最坏？',
      timestamp: Date.now(),
      source: {
        connector: 'vote-result',
        label: '投票结果',
        icon: 'ballot',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    expect(html).toContain('bg-purple-100');
    expect(html).toContain('border-purple-200');
    expect(html).not.toContain('bg-blue-100');
    expect(html).not.toContain('bg-slate-100');
  });

  it('renders rich block fields inside connector bubble', () => {
    const message: ChatMessage = {
      id: 'm-vote-rich',
      type: 'connector',
      content: '投票结果: 谁最坏？',
      timestamp: Date.now(),
      source: {
        connector: 'vote-result',
        label: '投票结果',
        icon: 'ballot',
      },
      extra: {
        rich: {
          v: 1 as const,
          blocks: [
            {
              id: 'vote-1',
              kind: 'card' as const,
              v: 1 as const,
              title: '投票结果: 谁最坏？',
              bodyMarkdown: '实名投票 · 2 票',
              tone: 'info' as const,
              fields: [
                { label: 'opus', value: '1 票 (50%)' },
                { label: 'codex', value: '1 票 (50%)' },
              ],
            },
          ],
        },
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    // Rich block fields should be visible inside the connector bubble
    expect(html).toContain('opus');
    expect(html).toContain('codex');
    expect(html).toContain('50%');
  });

  it('uses slate theme for github-review connector', () => {
    const message: ChatMessage = {
      id: 'm1',
      type: 'connector',
      content: '**GitHub Review 通知**',
      timestamp: Date.now(),
      source: {
        connector: 'github-review',
        label: 'GitHub Review',
        icon: '🔔',
        url: 'https://github.com/example/repo/pull/97',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    expect(html).toContain('bg-slate-100');
    expect(html).toContain('border-slate-200');
    expect(html).not.toContain('bg-blue-100');
  });

  it('uses slate theme for github-ci connector (same as github-review)', () => {
    const message: ChatMessage = {
      id: 'm-ci',
      type: 'connector',
      content: '**CI/CD Build #42 passed**',
      timestamp: Date.now(),
      source: {
        connector: 'github-ci',
        label: 'GitHub CI/CD',
        icon: 'github',
        url: 'https://github.com/example/repo/actions/runs/123',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    // Same slate theme as github-review
    expect(html).toContain('bg-slate-100');
    expect(html).toContain('border-slate-200');
    expect(html).not.toContain('bg-blue-100');
    // Should render GitHubIcon SVG, not raw text "github"
    expect(html).toContain('<svg');
    expect(html).not.toContain('>github<');
  });

  it('preserves legacy warning icon for github-review triage messages', () => {
    const message: ChatMessage = {
      id: 'm-triage',
      type: 'connector',
      content: '**GitHub Review 需要分派**',
      timestamp: Date.now(),
      source: {
        connector: 'github-review',
        label: 'GitHub Review',
        icon: '⚠️',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    // Legacy triage icon should be preserved, not replaced with GitHub SVG
    expect(html).toContain('⚠️');
  });

  it('uses emerald theme for multi-mention-result connector', () => {
    const message: ChatMessage = {
      id: 'm-mm',
      type: 'connector',
      content: '3 条外源消息已回复',
      timestamp: Date.now(),
      source: {
        connector: 'multi-mention-result',
        label: 'Multi-Mention 结果',
        icon: '👥',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    expect(html).toContain('bg-emerald-100');
    expect(html).toContain('border-emerald-200');
    expect(html).not.toContain('bg-blue-100');
  });

  it('uses blue theme for feishu connector', () => {
    const message: ChatMessage = {
      id: 'm-fs',
      type: 'connector',
      content: '来自飞书的消息',
      timestamp: Date.now(),
      source: {
        connector: 'feishu',
        label: '飞书 DM',
        icon: '🪶',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    expect(html).toContain('bg-blue-100');
    expect(html).toContain('border-blue-200');
  });

  it('uses default blue theme for unknown/unregistered connector (B5 fallback)', () => {
    const message: ChatMessage = {
      id: 'm-unknown',
      type: 'connector',
      content: 'iMessage incoming',
      timestamp: Date.now(),
      source: {
        connector: 'imessage',
        label: 'iMessage',
        icon: '💬',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    // Unknown connectors fall back to default blue theme
    expect(html).toContain('bg-blue-100');
    expect(html).toContain('border-blue-200');
  });

  it('renders an icon image for scheduler connector instead of raw scheduler text', () => {
    const message: ChatMessage = {
      id: 'm-scheduler',
      type: 'connector',
      content: '✅ 定时任务「明天计划」已创建，下次执行时间：2026/4/18 08:59:59',
      timestamp: Date.now(),
      source: {
        connector: 'scheduler',
        label: '定时任务',
        icon: 'scheduler',
      },
    };

    act(() => {
      root.render(React.createElement(ConnectorBubble, { message }));
    });

    const html = container.innerHTML;
    expect(html).toContain('/icons/scheduled-task.svg');
    expect(html).not.toContain('>scheduler<');
  });
});
