/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const proxyScript = fileURLToPath(new URL('./anthropic-proxy.mjs', import.meta.url));

function runProxy(env, args = []) {
  return spawnSync(process.execPath, [proxyScript, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 3000,
  });
}

test('rejects a non-numeric proxy port with one config error line', () => {
  const result = runProxy({ ANTHROPIC_PROXY_PORT: 'not-a-port' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid ANTHROPIC_PROXY_PORT/);
  assert.doesNotMatch(result.stderr, /ERR_SOCKET_BAD_PORT|Node\.js v/);
});

test('rejects a non-numeric upstream timeout instead of starting with NaN', () => {
  const result = runProxy({
    ANTHROPIC_PROXY_PORT: '9877',
    ANTHROPIC_PROXY_UPSTREAM_TIMEOUT_MS: 'not-a-timeout',
  });

  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
  assert.match(result.stderr, /Invalid ANTHROPIC_PROXY_UPSTREAM_TIMEOUT_MS/);
});
