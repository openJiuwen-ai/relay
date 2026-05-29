/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { DEFAULT_CLI_TIMEOUT_MS, parseCliTimeoutMs, readCliTimeoutMsFromEnv, resolveCliTimeoutMs } = await import(
  '../dist/utils/cli-timeout.js'
);

describe('cli-timeout', () => {
  describe('parseCliTimeoutMs', () => {
    it('returns undefined for missing or invalid values', () => {
      assert.equal(parseCliTimeoutMs(undefined), undefined);
      assert.equal(parseCliTimeoutMs(''), undefined);
      assert.equal(parseCliTimeoutMs('   '), undefined);
      assert.equal(parseCliTimeoutMs('-1'), undefined);
      assert.equal(parseCliTimeoutMs('NaN'), undefined);
      assert.equal(parseCliTimeoutMs('Infinity'), undefined);
    });

    it('accepts zero and positive finite numbers', () => {
      assert.equal(parseCliTimeoutMs('0'), 0);
      assert.equal(parseCliTimeoutMs('300000'), 300000);
      assert.equal(parseCliTimeoutMs(' 1500 '), 1500);
    });
  });

  describe('readCliTimeoutMsFromEnv', () => {
    it('reads CLI_TIMEOUT_MS from env-like objects', () => {
      assert.equal(readCliTimeoutMsFromEnv({ CLI_TIMEOUT_MS: '0' }), 0);
      assert.equal(readCliTimeoutMsFromEnv({ CLI_TIMEOUT_MS: '9000' }), 9000);
      assert.equal(readCliTimeoutMsFromEnv({ CLI_TIMEOUT_MS: '-5' }), undefined);
    });
  });

  describe('resolveCliTimeoutMs', () => {
    it('prefers explicit override, then env, then fallback default', () => {
      assert.equal(resolveCliTimeoutMs(42, { CLI_TIMEOUT_MS: '9000' }), 42);
      assert.equal(resolveCliTimeoutMs(undefined, { CLI_TIMEOUT_MS: '9000' }), 9000);
      assert.equal(resolveCliTimeoutMs(undefined, { CLI_TIMEOUT_MS: '0' }), 0);
      assert.equal(resolveCliTimeoutMs(undefined, { CLI_TIMEOUT_MS: 'NaN' }), DEFAULT_CLI_TIMEOUT_MS);
      assert.equal(resolveCliTimeoutMs(undefined, {}), DEFAULT_CLI_TIMEOUT_MS);
    });
  });
});
