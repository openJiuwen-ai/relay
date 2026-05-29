/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THREAD_STATE } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

describe('chatStore thinking merge', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      threadStates: {},
      currentThreadId: 'thread-active',
    });
  });

  it('appends active-thread thinking chunks without markdown separators', () => {
    const store = useChatStore.getState();
    store.addMessage({
      id: 'msg-1',
      type: 'assistant',
      agentId: 'opus',
      content: '',
      origin: 'stream',
      timestamp: 1,
      isStreaming: true,
    });

    store.setMessageThinking('msg-1', 'Line 1');
    store.setMessageThinking('msg-1', '\nLine 2');

    expect(useChatStore.getState().messages.find((m) => m.id === 'msg-1')?.thinking).toBe('Line 1\nLine 2');
  });

  it('appends background-thread thinking chunks without markdown separators', () => {
    useChatStore.setState((state) => ({
      threadStates: {
        ...state.threadStates,
        'thread-bg': {
          ...DEFAULT_THREAD_STATE,
          messages: [
            {
              id: 'bg-msg-1',
              type: 'assistant',
              agentId: 'codex',
              content: '',
              origin: 'stream',
              timestamp: 1,
              isStreaming: true,
            },
          ],
        },
      },
    }));

    const store = useChatStore.getState();
    store.setThreadMessageThinking('thread-bg', 'bg-msg-1', 'Thought A');
    store.setThreadMessageThinking('thread-bg', 'bg-msg-1', ' + Thought B');

    expect(store.getThreadState('thread-bg').messages.find((m) => m.id === 'bg-msg-1')?.thinking).toBe(
      'Thought A + Thought B',
    );
  });
});
