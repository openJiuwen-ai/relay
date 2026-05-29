/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { connectorWebhookRoutes } from '../dist/routes/connector-webhooks.js';

function buildApp(handlers = new Map()) {
  const app = Fastify();
  app.register(connectorWebhookRoutes, { handlers });
  return { app };
}

function mockHandler(connectorId, result) {
  const calls = [];
  return {
    calls,
    handler: {
      connectorId,
      async handleWebhook(body, headers) {
        calls.push({ body, headers });
        return result;
      },
    },
  };
}

describe('POST /api/connectors/:connectorId/webhook', () => {
  it('returns 404 for unknown connector', async () => {
    const { app } = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/unknown/webhook',
      payload: {},
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Unknown connector'));
    await app.close();
  });

  it('returns 501 when connector exists but no handler registered', async () => {
    // 'feishu' is registered in CONNECTOR_DEFINITIONS but no handler
    const { app } = buildApp(new Map());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/feishu/webhook',
      payload: {},
    });
    assert.equal(res.statusCode, 501);
    await app.close();
  });

  it('returns challenge response for verification', async () => {
    const mock = mockHandler('feishu', {
      kind: 'challenge',
      response: { challenge: 'test-challenge' },
    });
    const handlers = new Map([['feishu', mock.handler]]);
    const { app } = buildApp(handlers);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/feishu/webhook',
      payload: { type: 'url_verification', challenge: 'test-challenge' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.challenge, 'test-challenge');
    assert.equal(mock.calls.length, 1);
    await app.close();
  });

  it('returns 200 for processed message', async () => {
    const mock = mockHandler('feishu', {
      kind: 'processed',
      messageId: 'msg-123',
    });
    const handlers = new Map([['feishu', mock.handler]]);
    const { app } = buildApp(handlers);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/feishu/webhook',
      payload: { event: { message: {} } },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.equal(body.messageId, 'msg-123');
    await app.close();
  });

  it('returns 200 for skipped message', async () => {
    const mock = mockHandler('feishu', {
      kind: 'skipped',
      reason: 'duplicate',
    });
    const handlers = new Map([['feishu', mock.handler]]);
    const { app } = buildApp(handlers);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/feishu/webhook',
      payload: {},
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.skipped, 'duplicate');
    await app.close();
  });

  it('returns error status from handler', async () => {
    const mock = mockHandler('feishu', {
      kind: 'error',
      status: 403,
      message: 'Invalid signature',
    });
    const handlers = new Map([['feishu', mock.handler]]);
    const { app } = buildApp(handlers);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connectors/feishu/webhook',
      payload: {},
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Invalid signature');
    await app.close();
  });
});
