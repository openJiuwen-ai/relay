/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Fail-closed storage guard tests (P1-1)
 * Verifies that assertStorageReady enforces explicit opt-in for memory mode.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

describe('assertStorageReady', () => {
  let savedMemoryStore;

  beforeEach(() => {
    savedMemoryStore = process.env.MEMORY_STORE;
  });

  afterEach(() => {
    if (savedMemoryStore !== undefined) {
      process.env.MEMORY_STORE = savedMemoryStore;
    } else {
      delete process.env.MEMORY_STORE;
    }
  });

  it('returns redis mode when redisAvailable is true', async () => {
    const { assertStorageReady } = await import('../dist/config/storage-guard.js');
    const result = assertStorageReady(true);
    assert.deepStrictEqual(result, { mode: 'redis' });
  });

  it('throws when redis unavailable and MEMORY_STORE not set', async () => {
    delete process.env.MEMORY_STORE;
    const { assertStorageReady } = await import('../dist/config/storage-guard.js');
    assert.throws(() => assertStorageReady(false), { message: /REDIS_URL not set/ });
  });

  it('returns memory mode when MEMORY_STORE=1 and redis unavailable', async () => {
    process.env.MEMORY_STORE = '1';
    const { assertStorageReady } = await import('../dist/config/storage-guard.js');
    const result = assertStorageReady(false);
    assert.deepStrictEqual(result, { mode: 'memory' });
  });

  it('prefers redis over MEMORY_STORE when both available', async () => {
    process.env.MEMORY_STORE = '1';
    const { assertStorageReady } = await import('../dist/config/storage-guard.js');
    const result = assertStorageReady(true);
    assert.deepStrictEqual(result, { mode: 'redis' });
  });
});
