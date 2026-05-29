/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import { getAntigravitySmokeSkipReason, runAntigravityRoundTripSmoke } from './helpers/antigravity-smoke.js';

function createMockClient({ response = 'pong', connectError = null, sendError = null } = {}) {
  return {
    connected: false,
    connect: mock.fn(async () => {
      if (connectError) throw connectError;
    }),
    disconnect: mock.fn(async () => {}),
    newConversation: mock.fn(async () => {}),
    sendMessage: mock.fn(async () => {
      if (sendError) throw sendError;
    }),
    pollResponse: mock.fn(async () => response),
  };
}

describe('getAntigravitySmokeSkipReason', () => {
  test('requires explicit env opt-in even when Antigravity runtime is reachable', () => {
    const reason = getAntigravitySmokeSkipReason({
      env: {},
      runtimeReachable: true,
    });

    assert.match(reason, /RUN_ANTIGRAVITY_SMOKE/);
  });

  test('returns runtime reason when opt-in is enabled but port 9000 is unreachable', () => {
    const reason = getAntigravitySmokeSkipReason({
      env: { RUN_ANTIGRAVITY_SMOKE: 'true' },
      runtimeReachable: false,
    });

    assert.match(reason, /9000/);
  });

  test('returns null only when both opt-in and runtime reachability are satisfied', () => {
    const reason = getAntigravitySmokeSkipReason({
      env: { RUN_ANTIGRAVITY_SMOKE: 'true' },
      runtimeReachable: true,
    });

    assert.equal(reason, null);
  });
});

describe('runAntigravityRoundTripSmoke', () => {
  test('disconnects after a successful round trip', async () => {
    const client = createMockClient({ response: 'pong' });

    const response = await runAntigravityRoundTripSmoke(client, {
      prompt: 'Reply with just pong',
      pollTimeoutMs: 1_234,
    });

    assert.equal(response, 'pong');
    assert.equal(client.connect.mock.callCount(), 1);
    assert.equal(client.newConversation.mock.callCount(), 1);
    assert.equal(client.sendMessage.mock.callCount(), 1);
    assert.equal(client.pollResponse.mock.calls[0].arguments[0], 1_234);
    assert.equal(client.disconnect.mock.callCount(), 1);
  });

  test('still disconnects when pollResponse returns null', async () => {
    const client = createMockClient({ response: null });

    const response = await runAntigravityRoundTripSmoke(client);

    assert.equal(response, null);
    assert.equal(client.disconnect.mock.callCount(), 1);
  });

  test('still disconnects when sendMessage throws', async () => {
    const client = createMockClient({ sendError: new Error('send failed') });

    await assert.rejects(() => runAntigravityRoundTripSmoke(client), /send failed/);

    assert.equal(client.disconnect.mock.callCount(), 1);
  });
});
