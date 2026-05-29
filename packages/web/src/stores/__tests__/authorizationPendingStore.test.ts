/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthorizationPendingStore } from '../authorizationPendingStore';

describe('authorizationPendingStore', () => {
  beforeEach(() => {
    useAuthorizationPendingStore.setState({ pendingByThread: {}, threadByRequest: {} });
  });

  it('registerPendingBatch hydrates multiple threads at once for sidebar badges', () => {
    const store = useAuthorizationPendingStore.getState();

    store.registerPendingBatch([
      { threadId: 'thread-a', requestId: 'req-1' },
      { threadId: 'thread-b', requestId: 'req-2' },
      { threadId: 'thread-a', requestId: 'req-1' },
      { threadId: 'thread-c', requestId: '' },
    ]);

    const state = useAuthorizationPendingStore.getState();
    expect(state.pendingByThread['thread-a']).toEqual(['req-1']);
    expect(state.pendingByThread['thread-b']).toEqual(['req-2']);
    expect(state.hasPending('thread-a')).toBe(true);
    expect(state.hasPending('thread-b')).toBe(true);
    expect(state.hasPending('thread-c')).toBe(false);
  });

  it('registerPendingBatch migrates request ownership without stale marks', () => {
    const store = useAuthorizationPendingStore.getState();

    store.registerPending('thread-a', 'req-1');
    store.registerPendingBatch([{ threadId: 'thread-b', requestId: 'req-1' }]);

    const state = useAuthorizationPendingStore.getState();
    expect(state.pendingByThread['thread-a']).toBeUndefined();
    expect(state.pendingByThread['thread-b']).toEqual(['req-1']);
    expect(state.threadByRequest['req-1']).toBe('thread-b');
  });

  it('syncAllPending replaces stale local markers with the server snapshot', () => {
    const store = useAuthorizationPendingStore.getState();

    store.registerPending('thread-a', 'stale-req');
    store.registerPending('thread-b', 'keep-req');
    store.syncAllPending([{ threadId: 'thread-b', requestId: 'keep-req' }]);

    const state = useAuthorizationPendingStore.getState();
    expect(state.pendingByThread['thread-a']).toBeUndefined();
    expect(state.pendingByThread['thread-b']).toEqual(['keep-req']);
    expect(state.threadByRequest).toEqual({ 'keep-req': 'thread-b' });
  });
});
