/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderPluginRegistry } from '../dist/config/plugins/builtin-providers.js';

test('createProviderPluginRegistry discovers workspace provider plugins', async () => {
  const registry = await createProviderPluginRegistry();

  assert.ok(registry.has('echo'));
});
