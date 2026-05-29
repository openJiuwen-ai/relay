/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RedisThreadStore tests
 * 有 Redis → 测全量；无 Redis → skip
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertRedisIsolationOrThrow, cleanupPrefixedRedisKeys } from './helpers/redis-test-helpers.js';

const REDIS_URL = process.env.REDIS_URL;

describe('RedisThreadStore', { skip: !REDIS_URL ? 'REDIS_URL not set' : false }, () => {
  let RedisThreadStore;
  let createRedisClient;
  let redis;
  let store;
  let connected = false;

  before(async () => {
    assertRedisIsolationOrThrow(REDIS_URL, 'RedisThreadStore');

    const storeModule = await import('../dist/domains/agents/services/stores/redis/RedisThreadStore.js');
    RedisThreadStore = storeModule.RedisThreadStore;
    const redisModule = await import('@openjiuwen/relay-shared/utils');
    createRedisClient = redisModule.createRedisClient;

    redis = createRedisClient({ url: REDIS_URL });
    try {
      await redis.ping();
      connected = true;
    } catch {
      console.warn('[redis-thread-store.test] Redis unreachable, skipping tests');
      await redis.quit().catch(() => {});
      return;
    }
    store = new RedisThreadStore(redis, { ttlSeconds: 60 });
  });

  after(async () => {
    if (redis && connected) {
      await cleanupPrefixedRedisKeys(redis, ['thread:*', 'threads:*']);
      await redis.quit();
    }
  });

  beforeEach(async (t) => {
    if (!connected) return t.skip('Redis not connected');
    await cleanupPrefixedRedisKeys(redis, ['thread:*', 'threads:*']);
  });

  it('create() stores thread and returns it', async () => {
    const thread = await store.create('user1', 'Test Thread', '/home/user/project');
    assert.ok(thread.id);
    assert.equal(thread.title, 'Test Thread');
    assert.equal(thread.createdBy, 'user1');
    assert.equal(thread.projectPath, '/home/user/project');
    assert.deepEqual(thread.participants, []);
  });

  it('get() returns stored thread', async () => {
    const created = await store.create('user1', 'My Thread');
    const fetched = await store.get(created.id);
    assert.ok(fetched);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, 'My Thread');
    assert.equal(fetched.createdBy, 'user1');
  });

  it('get("default") auto-creates default thread', async () => {
    const thread = await store.get('default');
    assert.ok(thread);
    assert.equal(thread.id, 'default');
    assert.equal(thread.createdBy, 'system');
  });

  it('get() returns null for nonexistent thread', async () => {
    const result = await store.get('nonexistent-id');
    assert.equal(result, null);
  });

  it('addParticipants() stores and getParticipants() retrieves', async () => {
    const thread = await store.create('user1', 'Chat');
    await store.addParticipants(thread.id, ['opus', 'codex']);
    const participants = await store.getParticipants(thread.id);
    assert.ok(participants.includes('opus'));
    assert.ok(participants.includes('codex'));
    assert.equal(participants.length, 2);
  });

  it('addParticipants() deduplicates', async () => {
    const thread = await store.create('user1', 'Chat');
    await store.addParticipants(thread.id, ['opus']);
    await store.addParticipants(thread.id, ['opus', 'codex']);
    const participants = await store.getParticipants(thread.id);
    assert.equal(participants.length, 2);
  });

  it('addParticipants() persists default thread participants even before default detail exists', async () => {
    await store.addParticipants('default', ['opus', 'codex']);
    const participants = await store.getParticipants('default');
    assert.ok(participants.includes('opus'));
    assert.ok(participants.includes('codex'));
    assert.equal(participants.length, 2);
  });

  it('addParticipants() does not recreate participants for deleted thread (delete race)', async () => {
    const thread = await store.create('user1', 'Deleted Chat');
    const deleted = await store.delete(thread.id);
    assert.equal(deleted, true);

    await store.addParticipants(thread.id, ['opus']);
    const participants = await store.getParticipants(thread.id);
    assert.deepEqual(participants, []);
  });

  it('list() returns user threads sorted by lastActiveAt', async () => {
    const t1 = await store.create('user1', 'First');
    // Small delay for ordering
    await new Promise((r) => setTimeout(r, 10));
    const t2 = await store.create('user1', 'Second');

    const threads = await store.list('user1');
    // Most recent first
    assert.ok(threads.length >= 2);
    const ids = threads.map((t) => t.id);
    assert.ok(ids.indexOf(t2.id) < ids.indexOf(t1.id));
  });

  it('updateTitle() updates the title', async () => {
    const thread = await store.create('user1', 'Old Title');
    await store.updateTitle(thread.id, 'New Title');
    const updated = await store.get(thread.id);
    assert.equal(updated.title, 'New Title');
  });

  it('updatePin(true) sets pinned and pinnedAt', async () => {
    const thread = await store.create('user1', 'Pin Test');
    await store.updatePin(thread.id, true);
    const updated = await store.get(thread.id);
    assert.equal(updated.pinned, true);
    assert.ok(updated.pinnedAt > 0);
  });

  it('updatePin(false) clears pinned and sets pinnedAt to null', async () => {
    const thread = await store.create('user1', 'Unpin Test');
    await store.updatePin(thread.id, true);
    await store.updatePin(thread.id, false);
    const updated = await store.get(thread.id);
    assert.equal(updated.pinned, false);
    assert.equal(updated.pinnedAt, null);
  });

  it('updateFavorite(true) sets favorited and favoritedAt', async () => {
    const thread = await store.create('user1', 'Fav Test');
    await store.updateFavorite(thread.id, true);
    const updated = await store.get(thread.id);
    assert.equal(updated.favorited, true);
    assert.ok(updated.favoritedAt > 0);
  });

  it('updateFavorite(false) clears favorited and sets favoritedAt to null', async () => {
    const thread = await store.create('user1', 'Unfav Test');
    await store.updateFavorite(thread.id, true);
    await store.updateFavorite(thread.id, false);
    const updated = await store.get(thread.id);
    assert.equal(updated.favorited, false);
    assert.equal(updated.favoritedAt, null);
  });

  it('linkBacklogItem() persists reverse backlog reference', async () => {
    const thread = await store.create('user1', 'Backlog link');
    await store.linkBacklogItem(thread.id, 'blg_123');

    const updated = await store.get(thread.id);
    assert.equal(updated?.backlogItemId, 'blg_123');
  });

  it('set/consumeMentionRoutingFeedback() returns one-shot payload', async () => {
    const thread = await store.create('user1', 'Feedback');
    await store.setMentionRoutingFeedback(thread.id, 'codex', {
      sourceMessageId: 'msg-1',
      sourceTimestamp: 1700000000000,
      items: [{ targetAgentId: 'opus', reason: 'cross_paragraph' }],
    });

    const first = await store.consumeMentionRoutingFeedback(thread.id, 'codex');
    assert.ok(first);
    assert.equal(first?.sourceMessageId, 'msg-1');
    assert.deepEqual(first?.items, [{ targetAgentId: 'opus', reason: 'cross_paragraph' }]);

    const second = await store.consumeMentionRoutingFeedback(thread.id, 'codex');
    assert.equal(second, null, 'feedback should be consumed once');
  });

  it('updateRoutingPolicy() stores and hydrates routingPolicy', async () => {
    const thread = await store.create('user1', 'Routing Policy');
    const policy = { v: 1, scopes: { review: { avoidCats: ['opus'], reason: 'budget' } } };
    await store.updateRoutingPolicy(thread.id, policy);
    const updated = await store.get(thread.id);
    assert.deepEqual(updated.routingPolicy, policy);

    // null clears
    await store.updateRoutingPolicy(thread.id, null);
    const cleared = await store.get(thread.id);
    assert.equal(cleared.routingPolicy, undefined);
  });

  it('updateMentionActionabilityMode() stores relaxed and clears on strict', async () => {
    const thread = await store.create('user1', 'Mention Actionability');

    await store.updateMentionActionabilityMode(thread.id, 'relaxed');
    const updated = await store.get(thread.id);
    assert.equal(updated?.mentionActionabilityMode, 'relaxed');

    await store.updateMentionActionabilityMode(thread.id, 'strict');
    const cleared = await store.get(thread.id);
    assert.equal(cleared?.mentionActionabilityMode, undefined);
  });

  it('delete() removes thread', async () => {
    const thread = await store.create('user1', 'To Delete');
    const result = await store.delete(thread.id);
    assert.equal(result, true);
    const fetched = await store.get(thread.id);
    assert.equal(fetched, null);
  });

  it('delete() cannot remove default thread', async () => {
    await store.get('default'); // ensure it exists
    const result = await store.delete('default');
    assert.equal(result, false);
  });

  // Cloud Codex P2: updateParticipantActivity should check thread existence
  it('updateParticipantActivity() does not write orphaned data for deleted thread', async () => {
    const thread = await store.create('user1', 'Test Activity');
    const threadId = thread.id;

    // First update activity while thread exists
    await store.updateParticipantActivity(threadId, 'opus');
    let activity = await store.getParticipantsWithActivity(threadId);
    assert.equal(activity.length, 1);
    assert.equal(activity[0].messageCount, 1);

    // Delete the thread
    await store.delete(threadId);
    assert.equal(await store.get(threadId), null);

    // updateParticipantActivity should NOT create orphaned activity data
    await store.updateParticipantActivity(threadId, 'opus');

    // After thread deletion, getParticipantsWithActivity should return empty
    // (no orphaned activity data should exist)
    activity = await store.getParticipantsWithActivity(threadId);
    assert.equal(activity.length, 0, 'Should not have orphaned activity data for deleted thread');
  });
});

describe('ThreadStoreFactory', () => {
  it('returns ThreadStore when no redis', async () => {
    const { createThreadStore } = await import('../dist/domains/agents/services/stores/factories/ThreadStoreFactory.js');
    const { ThreadStore } = await import('../dist/domains/agents/services/stores/ports/ThreadStore.js');
    const store = createThreadStore();
    assert.ok(store instanceof ThreadStore);
  });

  it(
    'returns RedisThreadStore when redis provided',
    {
      skip: !REDIS_URL ? 'REDIS_URL not set' : false,
    },
    async () => {
      assertRedisIsolationOrThrow(REDIS_URL, 'ThreadStoreFactory');

      const { createThreadStore } = await import(
        '../dist/domains/agents/services/stores/factories/ThreadStoreFactory.js'
      );
      const { RedisThreadStore } = await import('../dist/domains/agents/services/stores/redis/RedisThreadStore.js');
      const { createRedisClient } = await import('@openjiuwen/relay-shared/utils');
      const redis = createRedisClient({ url: REDIS_URL });
      try {
        const store = createThreadStore(redis);
        assert.ok(store instanceof RedisThreadStore);
      } finally {
        await redis.quit().catch(() => {});
      }
    },
  );
});
