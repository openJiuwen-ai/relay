/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiFetch = vi.fn();
const mockAddMessage = vi.fn();
const mockAddMessageToThread = vi.fn();
const mockRemoveMessage = vi.fn();
const mockRemoveThreadMessage = vi.fn();
const mockSetLoading = vi.fn();
const mockSetHasActiveInvocation = vi.fn();
const mockSetThreadLoading = vi.fn();
const mockSetThreadHasActiveInvocation = vi.fn();
const mockReplaceMessageId = vi.fn();
const mockReplaceThreadMessageId = vi.fn();
const mockUpdateThreadTitle = vi.fn();
const mockUpdateThreadLastActive = vi.fn();
const mockProcessCommand = vi.fn(async () => false);

let storeCurrentThreadId = 'thread-route';
let storeThreads: Array<{ id: string; title: string | null; lastActiveAt?: number }> = [];

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/hooks/useChatCommands', () => ({
  useChatCommands: () => ({ processCommand: mockProcessCommand }),
}));

vi.mock('@/lib/mention-highlight', () => ({
  getMentionToAgentId: () => ({
    '布偶': 'ragdoll',
    ragdoll: 'ragdoll',
  }),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    () => ({
      addMessage: mockAddMessage,
      addMessageToThread: mockAddMessageToThread,
      removeMessage: mockRemoveMessage,
      removeThreadMessage: mockRemoveThreadMessage,
      setLoading: mockSetLoading,
      setHasActiveInvocation: mockSetHasActiveInvocation,
      setThreadLoading: mockSetThreadLoading,
      setThreadHasActiveInvocation: mockSetThreadHasActiveInvocation,
      replaceMessageId: mockReplaceMessageId,
      replaceThreadMessageId: mockReplaceThreadMessageId,
      updateThreadTitle: mockUpdateThreadTitle,
      updateThreadLastActive: mockUpdateThreadLastActive,
      currentThreadId: storeCurrentThreadId,
      threads: storeThreads,
    }),
    {
      getState: () => ({
        currentThreadId: storeCurrentThreadId,
        threads: storeThreads,
        updateThreadTitle: mockUpdateThreadTitle,
        updateThreadLastActive: mockUpdateThreadLastActive,
      }),
    },
  ),
}));

import { useSendMessage } from '@/hooks/useSendMessage';

function SendRunner({
  content,
  onDone,
}: {
  content: string;
  onDone: () => void;
}) {
  const { handleSend } = useSendMessage('thread-route');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    handleSend(content).then(onDone);
  }, [content, handleSend, onDone]);

  return null;
}

describe('useSendMessage auto title', () => {
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
    mockApiFetch.mockReset();
    mockAddMessage.mockReset();
    mockAddMessageToThread.mockReset();
    mockRemoveMessage.mockReset();
    mockRemoveThreadMessage.mockReset();
    mockSetLoading.mockReset();
    mockSetHasActiveInvocation.mockReset();
    mockSetThreadLoading.mockReset();
    mockSetThreadHasActiveInvocation.mockReset();
    mockReplaceMessageId.mockReset();
    mockReplaceThreadMessageId.mockReset();
    mockUpdateThreadTitle.mockReset();
    mockUpdateThreadLastActive.mockReset();
    mockProcessCommand.mockReset();
    mockProcessCommand.mockResolvedValue(false);
    storeCurrentThreadId = 'thread-route';
    storeThreads = [
      {
        id: 'thread-route',
        title: null,
        lastActiveAt: 0,
      },
    ];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('auto-fills an untitled thread from the first sent message', async () => {
    mockApiFetch.mockImplementation((url: unknown) => {
      if (url === '/api/messages') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ userMessageId: 'server-msg-1' }),
        });
      }
      if (url === '/api/threads/thread-route') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ title: '帮我整理发布清单' }),
        });
      }
      return Promise.reject(new Error(`unexpected url: ${String(url)}`));
    });

    await act(async () => {
      root.render(
        React.createElement(SendRunner, {
          content: '@布偶 帮我整理发布清单',
          onDone: () => {},
        }),
      );
    });

    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/threads/thread-route',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: '帮我整理发布清单' }),
      }),
    );
    expect(mockUpdateThreadTitle).toHaveBeenCalledWith('thread-route', '帮我整理发布清单');
  });

  it('does not overwrite an existing thread title', async () => {
    storeThreads = [
      {
        id: 'thread-route',
        title: '已有标题',
        lastActiveAt: 0,
      },
    ];
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ userMessageId: 'server-msg-1' }),
    });

    await act(async () => {
      root.render(
        React.createElement(SendRunner, {
          content: '帮我整理发布清单',
          onDone: () => {},
        }),
      );
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateThreadTitle).not.toHaveBeenCalled();
  });

  it('bumps the active thread lastActiveAt immediately when sending', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ userMessageId: 'server-msg-1' }),
    });

    await act(async () => {
      root.render(
        React.createElement(SendRunner, {
          content: '在旧会话里继续提问',
          onDone: () => {},
        }),
      );
    });

    expect(mockUpdateThreadLastActive).toHaveBeenCalledTimes(1);
    expect(mockUpdateThreadLastActive).toHaveBeenCalledWith('thread-route', expect.any(Number));
  });
});
