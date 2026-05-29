/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F39 UX: withdrawing a queued entry should update UI immediately.
 * User expectation: after "撤回/取消" a queued message, it shouldn't linger stale in QueuePanel.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueEntry } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { QueuePanel } from '../QueuePanel';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

const NOW = Date.now();

const QUEUED_ENTRY: QueueEntry = {
  id: 'q1',
  threadId: 'thread-1',
  userId: 'u1',
  content: 'queued to withdraw',
  messageId: 'm1',
  mergedMessageIds: [],
  source: 'user',
  targetAgents: ['opus'],
  intent: 'execute',
  status: 'queued',
  createdAt: NOW,
};

describe('QueuePanel withdraw UX (F39)', () => {
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
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('removes entry from QueuePanel immediately after successful withdraw and shows toast', async () => {
    useChatStore.setState({ queue: [QUEUED_ENTRY] });

    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    expect(container.innerHTML).toContain('queued to withdraw');

    const removeBtn = container.querySelector('button[aria-label="撤回"]') as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();

    await act(async () => {
      removeBtn?.click();
    });

    expect(useChatStore.getState().queue).toHaveLength(0);
    expect(container.innerHTML).toBe('');

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.title === '已取消')).toBe(true);
  });

  it('rolls back queue state and shows error toast when withdraw fails', async () => {
    const { apiFetch } = await import('@/utils/api-client');
    (apiFetch as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(async () => ({
      ok: false,
      json: async () => ({ error: 'nope' }),
    }));

    useChatStore.setState({ queue: [QUEUED_ENTRY] });
    act(() => {
      root.render(React.createElement(QueuePanel, { threadId: 'thread-1' }));
    });

    const removeBtn = container.querySelector('button[aria-label="撤回"]') as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();

    await act(async () => {
      removeBtn?.click();
    });

    // Should rollback, still visible
    expect(useChatStore.getState().queue).toHaveLength(1);
    expect(container.innerHTML).toContain('queued to withdraw');

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((t) => t.type === 'error' && t.title === '撤回失败')).toBe(true);
  });
});
