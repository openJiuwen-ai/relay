/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RedisTaskStore tests
 * 有 Redis → 测全量；无 Redis → skip
 * + TaskStoreFactory 分发测试 (always runs)
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertRedisIsolationOrThrow, cleanupPrefixedRedisKeys } from './helpers/redis-test-helpers.js';

const REDIS_URL = process.env.REDIS_URL;

describe('RedisTaskStore', { skip: !REDIS_URL ? 'REDIS_URL not set' : false }, () => {
  let RedisTaskStore;
  let createRedisClient;
  let redis;
  let store;
  let connected = false;

  before(async () => {
    assertRedisIsolationOrThrow(REDIS_URL, 'RedisTaskStore');

    const storeModule = await import('../dist/domains/agents/services/stores/redis/RedisTaskStore.js');
    RedisTaskStore = storeModule.RedisTaskStore;
    const redisModule = await import('@openjiuwen/relay-shared/utils');
    createRedisClient = redisModule.createRedisClient;

    redis = createRedisClient({ url: REDIS_URL });
    try {
      await redis.ping();
      connected = true;
    } catch {
      console.warn('[redis-task-store.test] Redis unreachable, skipping tests');
      await redis.quit().catch(() => {});
      return;
    }
    store = new RedisTaskStore(redis, { ttlSeconds: 60 });
  });

  after(async () => {
    if (redis && connected) {
      await cleanupPrefixedRedisKeys(redis, ['task:*', 'tasks:*']);
      await redis.quit();
    }
  });

  beforeEach(async (t) => {
    if (!connected) return t.skip('Redis not connected');
    await cleanupPrefixedRedisKeys(redis, ['task:*', 'tasks:*']);
  });

  it('create stores task and listByThread returns it', async () => {
    const task = await store.create({
      threadId: 'test-thread-1',
      title: '修复 bug',
      createdBy: 'opus',
      why: '影响用户体验',
    });

    assert.ok(task.id, 'should have an id');
    assert.equal(task.threadId, 'test-thread-1');
    assert.equal(task.title, '修复 bug');
    assert.equal(task.status, 'todo');
    assert.equal(task.ownerAgentId, null);

    const list = await store.listByThread('test-thread-1');
    assert.ok(list.length >= 1);
    assert.ok(list.some((t) => t.id === task.id));
  });

  it('get returns task by id', async () => {
    const task = await store.create({
      threadId: 'test-thread-2',
      title: '添加测试',
      createdBy: 'user',
      why: '提高覆盖率',
      ownerAgentId: 'gemini',
    });

    const retrieved = await store.get(task.id);
    assert.ok(retrieved);
    assert.equal(retrieved.title, '添加测试');
    assert.equal(retrieved.ownerAgentId, 'gemini');
    assert.equal(retrieved.createdBy, 'user');
  });

  it('update modifies fields', async () => {
    const task = await store.create({
      threadId: 'test-thread-3',
      title: '原始标题',
      createdBy: 'opus',
      why: '原始原因',
    });

    const updated = await store.update(task.id, {
      title: '新标题',
      status: 'doing',
      ownerAgentId: 'codex',
    });

    assert.ok(updated);
    assert.equal(updated.title, '新标题');
    assert.equal(updated.status, 'doing');
    assert.equal(updated.ownerAgentId, 'codex');
    assert.ok(updated.updatedAt >= task.updatedAt);
  });

  it('delete removes task', async () => {
    const task = await store.create({
      threadId: 'test-thread-4',
      title: '将被删除',
      createdBy: 'user',
      why: '测试删除',
    });

    const deleted = await store.delete(task.id);
    assert.equal(deleted, true);

    const retrieved = await store.get(task.id);
    assert.equal(retrieved, null);

    const deleted2 = await store.delete('nonexistent');
    assert.equal(deleted2, false);
  });
});

describe('TaskStoreFactory', () => {
  it('returns TaskStore when no redis, RedisTaskStore when redis', async () => {
    const { createTaskStore } = await import('../dist/domains/agents/services/stores/factories/TaskStoreFactory.js');
    const { TaskStore } = await import('../dist/domains/agents/services/stores/ports/TaskStore.js');
    const { RedisTaskStore } = await import('../dist/domains/agents/services/stores/redis/RedisTaskStore.js');

    const memoryStore = createTaskStore();
    assert.ok(memoryStore instanceof TaskStore, 'no redis → TaskStore');

    // With a fake redis object → RedisTaskStore
    const fakeRedis = { multi: () => ({}) };
    const redisStore = createTaskStore(fakeRedis);
    assert.ok(redisStore instanceof RedisTaskStore, 'redis → RedisTaskStore');
  });
});
