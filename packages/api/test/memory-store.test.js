/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * MemoryStore tests
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { MAX_KEYS_PER_THREAD, MemoryStore } from '../dist/domains/agents/services/stores/ports/MemoryStore.js';

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('set() creates entry and get() retrieves it', () => {
    const entry = store.set({
      threadId: 'thread-1',
      key: 'goal',
      value: 'Build a cat cafe',
      updatedBy: 'user',
    });

    assert.equal(entry.key, 'goal');
    assert.equal(entry.value, 'Build a cat cafe');
    assert.equal(entry.threadId, 'thread-1');
    assert.equal(entry.updatedBy, 'user');
    assert.ok(typeof entry.updatedAt === 'number');

    const retrieved = store.get('thread-1', 'goal');
    assert.deepEqual(retrieved, entry);
  });

  it('get() returns null for unknown key', () => {
    const result = store.get('thread-1', 'unknown');
    assert.equal(result, null);
  });

  it('list() returns all entries for a thread', () => {
    store.set({ threadId: 'thread-1', key: 'a', value: '1', updatedBy: 'user' });
    store.set({ threadId: 'thread-1', key: 'b', value: '2', updatedBy: 'opus' });
    store.set({ threadId: 'thread-2', key: 'c', value: '3', updatedBy: 'user' });

    const list1 = store.list('thread-1');
    assert.equal(list1.length, 2);
    assert.ok(list1.some((e) => e.key === 'a'));
    assert.ok(list1.some((e) => e.key === 'b'));

    const list2 = store.list('thread-2');
    assert.equal(list2.length, 1);
    assert.equal(list2[0].key, 'c');
  });

  it('set() overwrites existing key', () => {
    store.set({ threadId: 'thread-1', key: 'goal', value: 'v1', updatedBy: 'user' });
    const updated = store.set({ threadId: 'thread-1', key: 'goal', value: 'v2', updatedBy: 'opus' });

    assert.equal(updated.value, 'v2');
    assert.equal(updated.updatedBy, 'opus');

    const list = store.list('thread-1');
    assert.equal(list.length, 1);
  });

  it('delete() removes entry', () => {
    store.set({ threadId: 'thread-1', key: 'temp', value: 'x', updatedBy: 'user' });
    const deleted = store.delete('thread-1', 'temp');
    assert.equal(deleted, true);

    const retrieved = store.get('thread-1', 'temp');
    assert.equal(retrieved, null);
  });

  it('delete() returns false for unknown key', () => {
    const deleted = store.delete('thread-1', 'unknown');
    assert.equal(deleted, false);
  });

  it('evicts oldest when exceeding MAX_KEYS_PER_THREAD', async () => {
    // Fill to capacity
    for (let i = 0; i < MAX_KEYS_PER_THREAD; i++) {
      store.set({ threadId: 'thread-1', key: `key-${i}`, value: `val-${i}`, updatedBy: 'user' });
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 1));
    }

    // Add one more (should evict key-0)
    store.set({ threadId: 'thread-1', key: 'new-key', value: 'new-val', updatedBy: 'user' });

    const list = store.list('thread-1');
    assert.equal(list.length, MAX_KEYS_PER_THREAD);
    assert.ok(!list.some((e) => e.key === 'key-0'), 'key-0 should be evicted');
    assert.ok(
      list.some((e) => e.key === 'new-key'),
      'new-key should exist',
    );
  });
});
