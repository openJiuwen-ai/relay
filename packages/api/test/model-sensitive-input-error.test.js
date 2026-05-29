/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  classifyAgentErrorCode,
  isModelSensitiveInputError,
} = await import('../dist/utils/model-sensitive-input-error.js');

test('classifies ModelArts sensitive-input error from upstream payload text', () => {
  const raw =
    "{'error': {'code': 'ModelArts.81011', 'message': 'Input text May contain sensitive information, please try again.'}}";

  assert.equal(isModelSensitiveInputError(raw), true);
  assert.equal(classifyAgentErrorCode(raw), MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE);
});

test('accepts smart quotes in upstream sensitive-input payload text', () => {
  const raw =
    "{‘error’: {‘code’: ‘ModelArts.81011’, ‘message’: ‘Input text May contain sensitive information, please try again.’}}";

  assert.equal(isModelSensitiveInputError(raw), true);
  assert.equal(classifyAgentErrorCode(raw), MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE);
});

test('does not classify unrelated model errors', () => {
  const raw = "{'error': {'code': 'ModelArts.50000', 'message': 'Service unavailable'}}";

  assert.equal(isModelSensitiveInputError(raw), false);
  assert.equal(classifyAgentErrorCode(raw), undefined);
});

test('preserves an existing structured error code', () => {
  assert.equal(classifyAgentErrorCode('anything', 'GOVERNANCE_BOOTSTRAP_REQUIRED'), 'GOVERNANCE_BOOTSTRAP_REQUIRED');
});
