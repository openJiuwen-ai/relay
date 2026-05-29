/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createOfficeClawServer } from '../dist/server.js';
import { getConfiguredRuntimeEnvStore, setConfiguredRuntimeEnvStore } from '../dist/config/runtime-env-store-resolver.js';

test('createOfficeClawServer exposes start and close methods', async () => {
  const server = await createOfficeClawServer({ port: 3314, host: '127.0.0.1', memoryStore: true });
  assert.equal(typeof server.start, 'function');
  assert.equal(typeof server.close, 'function');
});

test('createOfficeClawServer registers the provided runtime env store for bootstrap resolution', async () => {
  const runtimeEnvStore = {
    async load() {
      return {};
    },
    async save() {},
  };

  try {
    await createOfficeClawServer({ runtimeEnvStore, memoryStore: true });
    assert.equal(getConfiguredRuntimeEnvStore(), runtimeEnvStore);
  } finally {
    setConfiguredRuntimeEnvStore(null);
  }
});
