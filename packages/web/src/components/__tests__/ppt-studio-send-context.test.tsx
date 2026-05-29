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
const mockReplaceThreadMessageId = vi.fn();
const mockUpdateThreadLastActive = vi.fn();
const mockUpdateThreadTitle = vi.fn();
const mockProcessCommand = vi.fn(async () => false);

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/hooks/useChatCommands', () => ({
  useChatCommands: () => ({ processCommand: mockProcessCommand }),
}));

vi.mock('@/lib/mention-highlight', () => ({
  getMentionToAgentId: () => ({ codex: 'codex' }),
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
      replaceThreadMessageId: mockReplaceThreadMessageId,
      updateThreadLastActive: mockUpdateThreadLastActive,
      updateThreadTitle: mockUpdateThreadTitle,
      currentThreadId: 'thread-ppt',
      threads: [{ id: 'thread-ppt', title: 'Existing title' }],
    }),
    {
      getState: () => ({
        currentThreadId: 'thread-ppt',
        threads: [{ id: 'thread-ppt', title: 'Existing title' }],
        updateThreadTitle: mockUpdateThreadTitle,
      }),
    },
  ),
}));

import { useSendMessage } from '@/hooks/useSendMessage';
import type { PptMessageContext } from '@/components/ppt-studio/ppt-studio-types';

const pptContext: PptMessageContext = {
  projectRoot: '/tmp/ppt-send-root',
  pagesDir: 'output/demo/pages',
  deckTitle: 'Demo Deck',
};

function SendRunner({ onDone }: { onDone: () => void }) {
  const { handleSend } = useSendMessage('thread-ppt');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    handleSend('把这里改得更有高管汇报感', undefined, undefined, undefined, undefined, {
      pptContext,
      pptTemplateId: 'builtin:light-tech',
    }).then(onDone);
  }, [handleSend, onDone]);

  return null;
}

describe('ppt studio send context', () => {
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
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ userMessageId: 'server-user-msg' }),
    });
    mockAddMessage.mockReset();
    mockAddMessageToThread.mockReset();
    mockRemoveMessage.mockReset();
    mockRemoveThreadMessage.mockReset();
    mockSetLoading.mockReset();
    mockSetHasActiveInvocation.mockReset();
    mockSetThreadLoading.mockReset();
    mockSetThreadHasActiveInvocation.mockReset();
    mockReplaceThreadMessageId.mockReset();
    mockUpdateThreadLastActive.mockReset();
    mockUpdateThreadTitle.mockReset();
    mockProcessCommand.mockReset();
    mockProcessCommand.mockResolvedValue(false);

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

  it('sends hidden pptContext without changing the visible optimistic user bubble', async () => {
    await act(async () => {
      root.render(React.createElement(SendRunner, { onDone: () => {} }));
    });

    const [, requestInit] = mockApiFetch.mock.calls.find(([url]) => url === '/api/messages') ?? [];
    const body = JSON.parse(String((requestInit as RequestInit).body));

    expect(body.content).toBe('把这里改得更有高管汇报感');
    expect(body.pptContext).toEqual(pptContext);
    expect(body.pptTemplateId).toBe('builtin:light-tech');
    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user',
        content: '把这里改得更有高管汇报感',
      }),
    );
    expect(mockAddMessage.mock.calls[0]?.[0]).not.toHaveProperty('pptContext');
  });
});
