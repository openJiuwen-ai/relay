/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const { getErrorMessage } = await import('../dist/utils/response-error.js');

test('getErrorMessage returns API error fields from object responses', async () => {
  const response = new Response(
    JSON.stringify({
      error_code: 'AgentArts.11000008',
      error_msg: 'invalid promotion code',
    }),
    {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    },
  );

  const result = await getErrorMessage(response);

  assert.deepEqual(result, {
    error_code: 'AgentArts.11000008',
    error_message: 'invalid promotion code',
  });
});

test('getErrorMessage falls back to status when response body is not an object', async () => {
  const response = new Response(JSON.stringify('not-an-object'), {
    status: 502,
    statusText: 'Bad Gateway',
    headers: { 'content-type': 'application/json' },
  });

  const result = await getErrorMessage(response);

  assert.deepEqual(result, {
    error_code: '502',
    error_message: 'Bad Gateway',
  });
});
