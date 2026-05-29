/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PushSubscriptionStore } from '../dist/domains/agents/services/stores/ports/PushSubscriptionStore.js';

describe('PushNotificationService (store layer)', () => {
  /** @type {import('../src/domains/agents/services/stores/ports/PushSubscriptionStore.js').PushSubscriptionStore} */
  let store;

  const sub1 = {
    endpoint: 'https://push.example.com/sub/1',
    keys: { p256dh: 'key1', auth: 'auth1' },
    userId: 'owner',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    store = new PushSubscriptionStore();
  });

  it('listAll returns empty when no subscriptions', () => {
    assert.deepEqual(store.listAll(), []);
  });

  it('upsert + listByUser returns matching subscriptions', () => {
    store.upsert(sub1);
    store.upsert({ ...sub1, endpoint: 'https://push.example.com/sub/2' });
    const subs = store.listByUser('owner');
    assert.equal(subs.length, 2);
  });

  it('remove cleans up subscription from listByUser', () => {
    store.upsert(sub1);
    store.remove(sub1.endpoint);
    assert.equal(store.listByUser('owner').length, 0);
  });

  it('listByUser does not return other users subscriptions', () => {
    store.upsert(sub1);
    store.upsert({
      endpoint: 'https://push.example.com/sub/other',
      keys: { p256dh: 'k', auth: 'a' },
      userId: 'other-user',
      createdAt: Date.now(),
    });
    assert.equal(store.listByUser('owner').length, 1);
    assert.equal(store.listByUser('other-user').length, 1);
    assert.equal(store.listAll().length, 2);
  });
});
