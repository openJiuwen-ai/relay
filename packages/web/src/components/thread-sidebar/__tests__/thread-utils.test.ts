/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/chat-types';
import type { Thread, ThreadState } from '@/stores/chat-types';
import { DEFAULT_THREAD_STATE } from '@/stores/chatStore';
import { applyRealtimeThreadActivity } from '../thread-utils';

function makeThread(id: string, lastActiveAt: number): Thread {
  return {
    id,
    projectPath: 'default',
    title: id,
    createdBy: 'user-1',
    participants: [],
    lastActiveAt,
    createdAt: lastActiveAt,
  };
}

function makeMessage(id: string, timestamp: number): ChatMessage {
  return {
    id,
    type: 'assistant',
    agentId: 'opus',
    content: 'hello',
    timestamp,
  };
}

describe('applyRealtimeThreadActivity', () => {
  it('prefers newer in-memory message timestamp over stale thread lastActiveAt', () => {
    const threads = [makeThread('thread-a', 100), makeThread('thread-b', 200)];
    const threadStates: Record<string, Pick<ThreadState, 'messages'> | undefined> = {
      'thread-a': { ...DEFAULT_THREAD_STATE, messages: [makeMessage('m1', 300)] },
    };

    const result = applyRealtimeThreadActivity(threads, threadStates);

    expect(result.map((thread) => [thread.id, thread.lastActiveAt])).toEqual([
      ['thread-a', 300],
      ['thread-b', 200],
    ]);
  });

  it('keeps original thread objects when local messages are not newer', () => {
    const threads = [makeThread('thread-a', 300)];
    const result = applyRealtimeThreadActivity(threads, {
      'thread-a': { ...DEFAULT_THREAD_STATE, messages: [makeMessage('m1', 200)] },
    });

    expect(result[0]).toBe(threads[0]);
  });

  it('does not reorder a thread just because it was opened without new messages', () => {
    const threads = [makeThread('thread-a', 300)];
    const result = applyRealtimeThreadActivity(threads, {
      'thread-a': { ...DEFAULT_THREAD_STATE, messages: [makeMessage('m1', 300)] },
    });

    expect(result[0]).toBe(threads[0]);
  });
});
