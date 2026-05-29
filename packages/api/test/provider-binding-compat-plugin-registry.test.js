/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import test from 'node:test';
import { ProviderPluginRegistry } from '../../core/dist/index.js';
import {
  resolveBuiltinClientForProvider,
  validateRuntimeProviderBinding,
} from '../dist/config/provider-binding-compat.js';
import { initPluginRegistry, resetPluginRegistry } from '../dist/config/plugins/plugin-registry-singleton.js';

afterEach(() => {
  resetPluginRegistry();
});

function registerEchoPlugin() {
  const registry = new ProviderPluginRegistry();
  registry.register({
    name: 'echo',
    providers: ['echo'],
    binding: {
      builtinClient: 'openai',
      expectedProtocol: 'openai',
    },
    validateBinding() {
      return 'plugin-registry-validation';
    },
    createAgentService() {
      throw new Error('not needed in this test');
    },
  });
  initPluginRegistry(registry);
}

test('resolveBuiltinClientForProvider reads plugin registry mappings for custom providers', () => {
  registerEchoPlugin();
  assert.equal(resolveBuiltinClientForProvider('echo'), 'openai');
});

test('validateRuntimeProviderBinding delegates to plugin validation when registry is initialized', () => {
  registerEchoPlugin();
  const result = validateRuntimeProviderBinding('echo', {
    id: 'echo-profile',
    kind: 'api_key',
    authType: 'api_key',
    protocol: 'openai',
  });
  assert.equal(result, 'plugin-registry-validation');
});
