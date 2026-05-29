/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

class MockRedisHash {
  constructor() {
    /** @type {Map<string, Map<string, string>>} */
    this.hashes = new Map();
    /** @type {Array<{key: string, ttl: number}>} */
    this.expireCalls = [];
  }

  /** @param {string} key @param {string} field */
  async hget(key, field) {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  /** @param {string} key @param {string} field @param {string} value */
  async hset(key, field, value) {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    h.set(field, value);
    return 1;
  }

  /** @param {string} key */
  async hgetall(key) {
    const h = this.hashes.get(key);
    if (!h) return {};
    return Object.fromEntries(h.entries());
  }

  /** @param {string} key @param {string} field */
  async hdel(key, field) {
    const h = this.hashes.get(key);
    if (!h) return 0;
    const existed = h.delete(field);
    if (h.size === 0) this.hashes.delete(key);
    return existed ? 1 : 0;
  }

  /** @param {string} key @param {number} ttl */
  async expire(key, ttl) {
    this.expireCalls.push({ key, ttl });
    return 1;
  }

  /** @param {string} key */
  async del(key) {
    const existed = this.hashes.delete(key);
    return existed ? 1 : 0;
  }
}

describe('RedisTaskProgressStore', () => {
  test('setSnapshot/getSnapshot/getThreadSnapshots/deleteSnapshot', async () => {
    const { RedisTaskProgressStore } = await import(
      '../dist/domains/agents/services/agents/invocation/RedisTaskProgressStore.js'
    );

    const redis = new MockRedisHash();
    const store = new RedisTaskProgressStore(redis, 123);

    const snapshot = {
      threadId: 'thread_1',
      agentId: 'opus',
      tasks: [
        { id: 't1', subject: 'Read files', status: 'completed' },
        { id: 't2', subject: 'Fix bug', status: 'pending' },
      ],
      status: 'interrupted',
      updatedAt: 1700000000000,
      lastInvocationId: 'inv_123',
      interruptReason: 'killed',
    };

    await store.setSnapshot(snapshot);
    const got = await store.getSnapshot('thread_1', 'opus');
    assert.deepEqual(got, snapshot);

    const thread = await store.getThreadSnapshots('thread_1');
    assert.equal(Object.keys(thread).length, 1);
    assert.deepEqual(thread.opus, snapshot);

    await store.deleteSnapshot('thread_1', 'opus');
    const afterDelete = await store.getSnapshot('thread_1', 'opus');
    assert.equal(afterDelete, null);
  });

  test('setSnapshot uses default ttl unless overridden', async () => {
    const { RedisTaskProgressStore } = await import(
      '../dist/domains/agents/services/agents/invocation/RedisTaskProgressStore.js'
    );

    const redis = new MockRedisHash();
    const store = new RedisTaskProgressStore(redis, 111);

    await store.setSnapshot({
      threadId: 'thread_2',
      agentId: 'opus',
      tasks: [],
      status: 'running',
      updatedAt: 1,
    });
    assert.deepEqual(redis.expireCalls.at(-1), { key: 'task-progress:thread_2', ttl: 111 });

    await store.setSnapshot(
      {
        threadId: 'thread_2',
        agentId: 'codex',
        tasks: [],
        status: 'running',
        updatedAt: 2,
      },
      { ttlSeconds: 222 },
    );
    assert.deepEqual(redis.expireCalls.at(-1), { key: 'task-progress:thread_2', ttl: 222 });
  });

  test('deleteThread clears the whole hash key', async () => {
    const { RedisTaskProgressStore } = await import(
      '../dist/domains/agents/services/agents/invocation/RedisTaskProgressStore.js'
    );

    const redis = new MockRedisHash();
    const store = new RedisTaskProgressStore(redis, 10);

    await store.setSnapshot({
      threadId: 'thread_3',
      agentId: 'opus',
      tasks: [],
      status: 'running',
      updatedAt: 1,
    });
    await store.setSnapshot({
      threadId: 'thread_3',
      agentId: 'codex',
      tasks: [],
      status: 'running',
      updatedAt: 2,
    });
    assert.equal(Object.keys(await store.getThreadSnapshots('thread_3')).length, 2);

    await store.deleteThread('thread_3');
    assert.deepEqual(await store.getThreadSnapshots('thread_3'), {});
  });
});
