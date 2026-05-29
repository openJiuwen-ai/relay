/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F39 Bug 2: QueuePanel should show image count indicator
 * when the associated message has image contentBlocks.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { QueueEntry } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { QueuePanel } from '../QueuePanel';

const NOW = Date.now();

const QUEUE_ENTRY_BASE: QueueEntry = {
  id: 'q1',
  threadId: 'thread-1',
  userId: 'u1',
  content: 'hello with image',
  messageId: 'msg-1',
  mergedMessageIds: [],
  source: 'user',
  targetAgents: ['opus'],
  intent: 'execute',
  status: 'queued',
  createdAt: NOW,
};

describe('QueuePanel image indicator (F39 Bug 2)', () => {
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

    useChatStore.setState({
      messages: [],
      queue: [],
      queuePaused: false,
      currentThreadId: 'thread-1',
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows image count when associated message has image contentBlocks', () => {
    useChatStore.setState({
      queue: [QUEUE_ENTRY_BASE],
      messages: [
        {
          id: 'msg-1',
          type: 'user' as const,
          content: 'hello with image',
          contentBlocks: [{ type: 'image' as const, url: 'https://example.com/cat.png' }],
          timestamp: NOW,
        },
      ],
    });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const html = container.innerHTML;
    // Should render the queue entry content
    expect(html).toContain('hello with image');
    // Should contain the image count "1" via the SVG landscape icon
    expect(html).toContain('l4-8 3 6'); // SVG path unique to image icon
  });

  it('shows count for multiple images', () => {
    useChatStore.setState({
      queue: [{ ...QUEUE_ENTRY_BASE, content: 'multi-image' }],
      messages: [
        {
          id: 'msg-1',
          type: 'user' as const,
          content: 'multi-image',
          contentBlocks: [
            { type: 'image' as const, url: 'https://example.com/a.png' },
            { type: 'image' as const, url: 'https://example.com/b.png' },
            { type: 'text' as const, text: 'some text' },
          ],
          timestamp: NOW,
        },
      ],
    });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const html = container.innerHTML;
    expect(html).toContain('multi-image');
    // "2" for two images (text block excluded)
    expect(html).toContain('>2<');
  });

  it('does not show image indicator when message has no images', () => {
    useChatStore.setState({
      queue: [{ ...QUEUE_ENTRY_BASE, content: 'text only' }],
      messages: [
        {
          id: 'msg-1',
          type: 'user' as const,
          content: 'text only',
          timestamp: NOW,
        },
      ],
    });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const html = container.innerHTML;
    expect(html).toContain('text only');
    // No image icon SVG path
    expect(html).not.toContain('l4-8 3 6');
  });

  it('does not show image indicator when messageId is null', () => {
    useChatStore.setState({
      queue: [{ ...QUEUE_ENTRY_BASE, messageId: null, content: 'no link' }],
      messages: [],
    });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const html = container.innerHTML;
    expect(html).toContain('no link');
    expect(html).not.toContain('l4-8 3 6');
  });

  it('counts images from merged messages too (Cloud R2 P2)', () => {
    useChatStore.setState({
      queue: [
        {
          ...QUEUE_ENTRY_BASE,
          content: 'merged entry',
          messageId: 'msg-1',
          mergedMessageIds: ['msg-2'],
        },
      ],
      messages: [
        {
          id: 'msg-1',
          type: 'user' as const,
          content: 'first',
          contentBlocks: [{ type: 'image' as const, url: 'https://example.com/a.png' }],
          timestamp: NOW,
        },
        {
          id: 'msg-2',
          type: 'user' as const,
          content: 'merged follow-up',
          contentBlocks: [
            { type: 'image' as const, url: 'https://example.com/b.png' },
            { type: 'image' as const, url: 'https://example.com/c.png' },
          ],
          timestamp: NOW + 1,
        },
      ],
    });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const html = container.innerHTML;
    // 1 from msg-1 + 2 from msg-2 = 3 total
    expect(html).toContain('>3<');
    expect(html).toContain('l4-8 3 6'); // image icon present
  });

  it('renders nothing when queue is empty', () => {
    useChatStore.setState({ queue: [] });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    expect(container.innerHTML).toBe('');
  });
});
