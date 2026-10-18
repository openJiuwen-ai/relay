/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Callback HTTP retry semantics.
 *
 * A 2xx response means the callback was accepted; body parsing must not
 * convert that success into retried duplicate POSTs.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { postJsonWithRetry } from '../dist/tools/callback-retry.js';

const URL = 'http://127.0.0.1:3004/api/callback';

describe('postJsonWithRetry 2xx handling', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('204 No Content is success and is not retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    };

    const result = await postJsonWithRetry(URL, '{}', [0, 0, 0]);

    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: true, data: null });
  });

  test('200 with a non-JSON acknowledgement is success and is not retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain' } });
    };

    const result = await postJsonWithRetry(URL, '{}', [0, 0, 0]);

    assert.equal(calls, 1);
    assert.deepEqual(result, { ok: true, data: 'OK' });
  });

  test('200 JSON body is still parsed', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ accepted: true }), { status: 200 });

    const result = await postJsonWithRetry(URL, '{}', [0, 0, 0]);

    assert.deepEqual(result, { ok: true, data: { accepted: true } });
  });

  test('5xx responses are still retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response('upstream down', { status: 503 });
    };

    const result = await postJsonWithRetry(URL, '{}', [0, 0, 0]);

    assert.equal(calls, 4);
    assert.equal(result.ok, false);
    assert.equal(result.failure.retryable, true);
  });

  test('4xx responses are not retried', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response('bad request', { status: 400 });
    };

    const result = await postJsonWithRetry(URL, '{}', [0, 0, 0]);

    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    assert.equal(result.failure.retryable, false);
  });
});
