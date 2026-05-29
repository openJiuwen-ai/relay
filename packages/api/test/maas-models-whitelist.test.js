/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAAS_MODEL_WHITELIST,
  filterMaaSModelsByWhitelist,
  toMassModelList,
} from '../dist/routes/maas-models.js';

test('filters MaaS models by the configured whitelist using display names', () => {
  const models = toMassModelList([
    { id: 'glm-5' },
    { id: 'deepseek-v3.2' },
    { id: 'qwen3-coder-480b-a35b-instruct' },
    { id: 'not-allowed-model', name: 'Not-Allowed-Model' },
  ]);

  const filtered = filterMaaSModelsByWhitelist(models);

  assert.deepEqual(
    filtered.map((model) => model.name),
    ['GLM-5', 'DeepSeek-V3.2', 'Qwen3-Coder-480B-A35B-Instruct'],
  );
  assert.equal(filtered.every((model) => MAAS_MODEL_WHITELIST.includes(model.name)), true);
});

test('orders whitelisted MaaS models as glm, deepseek, kimi, qwen', () => {
  const models = toMassModelList([
    { id: 'qwen3-coder-480b-a35b-instruct' },
    { id: 'Kimi-K2' },
    { id: 'deepseek-v3.2' },
    { id: 'glm-5' },
    { id: 'DeepSeek-V3' },
    { id: 'qwen3-235b-a22b' },
  ]);

  const filtered = filterMaaSModelsByWhitelist(models);

  assert.deepEqual(
    filtered.map((model) => model.name),
    ['GLM-5', 'DeepSeek-V3.2', 'DeepSeek-V3', 'Kimi-K2', 'Qwen3-235B-A22B', 'Qwen3-Coder-480B-A35B-Instruct'],
  );
});

test('does not affect non-MaaS custom models when whitelist helper is applied only to MaaS results', () => {
  const maasModels = toMassModelList([{ id: 'glm-5' }, { id: 'not-allowed-model', name: 'Not-Allowed-Model' }]);
  const customModels = [
    {
      id: 'model_config:custom:gpt-5',
      name: 'gpt-5',
      provider: 'Custom Provider',
      kind: 'provider',
      enabled: true,
    },
  ];

  const responseModels = [...filterMaaSModelsByWhitelist(maasModels), ...customModels];

  assert.deepEqual(
    responseModels.map((model) => model.name),
    ['GLM-5', 'gpt-5'],
  );
});
