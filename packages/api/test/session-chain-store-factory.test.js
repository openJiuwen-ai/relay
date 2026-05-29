/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * SessionChainStoreFactory Tests
 * F24: Redis available → RedisSessionChainStore, otherwise in-memory.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('createSessionChainStore', () => {
  test('returns SessionChainStore when no redis provided', async () => {
    const { createSessionChainStore } = await import(
      '../dist/domains/agents/services/stores/factories/SessionChainStoreFactory.js'
    );
    const { SessionChainStore } = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');

    const store = createSessionChainStore();
    assert.ok(store instanceof SessionChainStore);
  });

  test('returns RedisSessionChainStore when redis provided', async () => {
    const { createSessionChainStore } = await import(
      '../dist/domains/agents/services/stores/factories/SessionChainStoreFactory.js'
    );
    const { RedisSessionChainStore } = await import(
      '../dist/domains/agents/services/stores/redis/RedisSessionChainStore.js'
    );

    // Minimal mock redis — factory only checks truthiness
    const mockRedis = { ping: async () => 'PONG' };
    const store = createSessionChainStore(mockRedis);
    assert.ok(store instanceof RedisSessionChainStore);
  });

  test('returns SessionChainStore when redis is undefined', async () => {
    const { createSessionChainStore } = await import(
      '../dist/domains/agents/services/stores/factories/SessionChainStoreFactory.js'
    );
    const { SessionChainStore } = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');

    const store = createSessionChainStore(undefined);
    assert.ok(store instanceof SessionChainStore);
  });
});
