/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Thread } from '../chat-types';
import { useChatStore } from '../chatStore';

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  return {
    projectPath: 'default',
    title: null,
    createdBy: 'user',
    participants: [],
    lastActiveAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('chatStore updateThreadPin / updateThreadFavorite', () => {
  beforeEach(() => {
    useChatStore.setState({
      threads: [makeThread({ id: 'thread-1', title: 'First' }), makeThread({ id: 'thread-2', title: 'Second' })],
    });
  });

  it('updateThreadPin sets pinned=true and pinnedAt', () => {
    useChatStore.getState().updateThreadPin('thread-1', true);
    const thread = useChatStore.getState().threads.find((t) => t.id === 'thread-1');
    expect(thread?.pinned).toBe(true);
    expect(thread?.pinnedAt).toBeGreaterThan(0);
  });

  it('updateThreadPin sets pinned=false and pinnedAt=null', () => {
    useChatStore.getState().updateThreadPin('thread-1', true);
    useChatStore.getState().updateThreadPin('thread-1', false);
    const thread = useChatStore.getState().threads.find((t) => t.id === 'thread-1');
    expect(thread?.pinned).toBe(false);
    expect(thread?.pinnedAt).toBeNull();
  });

  it('updateThreadPin does not affect other threads', () => {
    useChatStore.getState().updateThreadPin('thread-1', true);
    const other = useChatStore.getState().threads.find((t) => t.id === 'thread-2');
    expect(other?.pinned).toBeUndefined();
  });

  it('updateThreadFavorite sets favorited=true and favoritedAt', () => {
    useChatStore.getState().updateThreadFavorite('thread-2', true);
    const thread = useChatStore.getState().threads.find((t) => t.id === 'thread-2');
    expect(thread?.favorited).toBe(true);
    expect(thread?.favoritedAt).toBeGreaterThan(0);
  });

  it('updateThreadFavorite sets favorited=false and favoritedAt=null', () => {
    useChatStore.getState().updateThreadFavorite('thread-2', true);
    useChatStore.getState().updateThreadFavorite('thread-2', false);
    const thread = useChatStore.getState().threads.find((t) => t.id === 'thread-2');
    expect(thread?.favorited).toBe(false);
    expect(thread?.favoritedAt).toBeNull();
  });

  it('pin and favorite are independent', () => {
    useChatStore.getState().updateThreadPin('thread-1', true);
    useChatStore.getState().updateThreadFavorite('thread-1', true);
    const thread = useChatStore.getState().threads.find((t) => t.id === 'thread-1');
    expect(thread?.pinned).toBe(true);
    expect(thread?.favorited).toBe(true);

    useChatStore.getState().updateThreadPin('thread-1', false);
    const after = useChatStore.getState().threads.find((t) => t.id === 'thread-1');
    expect(after?.pinned).toBe(false);
    expect(after?.favorited).toBe(true); // still favorited
  });

  it('updateThreadPin for nonexistent thread is a no-op', () => {
    const before = useChatStore.getState().threads.length;
    useChatStore.getState().updateThreadPin('nonexistent', true);
    expect(useChatStore.getState().threads.length).toBe(before);
  });
});
