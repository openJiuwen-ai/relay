/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PushSubscriptionStore } from '../dist/domains/agents/services/stores/ports/PushSubscriptionStore.js';

describe('PushSubscriptionStore (memory)', () => {
  /** @type {import('../src/domains/agents/services/stores/ports/PushSubscriptionStore.js').PushSubscriptionStore} */
  let store;

  beforeEach(() => {
    store = new PushSubscriptionStore();
  });

  const sub1 = {
    endpoint: 'https://push.example.com/sub/1',
    keys: { p256dh: 'key1', auth: 'auth1' },
    userId: 'owner',
    createdAt: Date.now(),
  };

  const sub2 = {
    endpoint: 'https://push.example.com/sub/2',
    keys: { p256dh: 'key2', auth: 'auth2' },
    userId: 'owner',
    createdAt: Date.now(),
  };

  it('upsert and listAll', () => {
    store.upsert(sub1);
    assert.equal(store.listAll().length, 1);
    assert.equal(store.listAll()[0].endpoint, sub1.endpoint);
  });

  it('upsert same endpoint updates (no duplicate)', () => {
    store.upsert(sub1);
    store.upsert({ ...sub1, userAgent: 'iPhone' });
    assert.equal(store.listAll().length, 1);
    assert.equal(store.listAll()[0].userAgent, 'iPhone');
  });

  it('upsert same endpoint with different userId reassigns cleanly', () => {
    store.upsert(sub1); // owned by 'owner'
    assert.equal(store.listByUser('owner').length, 1);

    // Re-subscribe same endpoint as 'newUser'
    store.upsert({ ...sub1, userId: 'newUser' });
    assert.equal(store.listAll().length, 1);
    assert.equal(store.listByUser('newUser').length, 1);
    assert.equal(store.listByUser('owner').length, 0, 'old owner should not see reassigned endpoint');
  });

  it('listByUser returns only matching user', () => {
    store.upsert(sub1);
    store.upsert({ ...sub2, userId: 'other' });
    const ownerSubs = store.listByUser('owner');
    assert.equal(ownerSubs.length, 1);
    assert.equal(ownerSubs[0].endpoint, sub1.endpoint);
  });

  it('remove returns true on success, false on missing', () => {
    store.upsert(sub1);
    assert.equal(store.remove(sub1.endpoint), true);
    assert.equal(store.listAll().length, 0);
    assert.equal(store.remove(sub1.endpoint), false);
  });

  it('removeForUser returns false when userId does not match', () => {
    store.upsert(sub1);
    assert.equal(store.removeForUser('intruder', sub1.endpoint), false);
    assert.equal(store.listAll().length, 1, 'subscription should still exist');
  });

  it('removeForUser returns true when userId matches', () => {
    store.upsert(sub1);
    assert.equal(store.removeForUser('owner', sub1.endpoint), true);
    assert.equal(store.listAll().length, 0);
  });

  it('removeForUser returns false for nonexistent endpoint', () => {
    assert.equal(store.removeForUser('owner', 'https://nonexistent'), false);
  });

  it('evicts oldest when at capacity', () => {
    const smallStore = new PushSubscriptionStore({ maxRecords: 2 });
    smallStore.upsert(sub1);
    smallStore.upsert(sub2);
    const sub3 = {
      endpoint: 'https://push.example.com/sub/3',
      keys: { p256dh: 'key3', auth: 'auth3' },
      userId: 'owner',
      createdAt: Date.now(),
    };
    smallStore.upsert(sub3);
    // sub1 should be evicted (oldest)
    assert.equal(smallStore.listAll().length, 2);
    const endpoints = smallStore.listAll().map((s) => s.endpoint);
    assert.ok(!endpoints.includes(sub1.endpoint), 'sub1 should be evicted');
    assert.ok(endpoints.includes(sub2.endpoint));
    assert.ok(endpoints.includes(sub3.endpoint));
  });
});
