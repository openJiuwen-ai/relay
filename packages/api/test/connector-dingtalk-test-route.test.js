/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { connectorHubRoutes } from '../dist/routes/connector-hub.js';

function attachAuth(app, userId = 'tester') {
  app.addHook('onRequest', async (request) => {
    request.auth = { userId, sessionId: `${userId}-session` };
  });
}

function createThreadStore() {
  return {
    async list() {
      return [];
    },
  };
}

describe('POST /api/connector/test/dingtalk', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('validates credentials via DingTalk accessToken API', async () => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/v1.0/oauth2/accessToken')) {
        return new Response(JSON.stringify({
          accessToken: 'test-access-token-123',
          expireIn: 7200,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/dingtalk',
      headers: { 'X-Office-Claw-User': 'tester' },
      payload: {
        DINGTALK_APP_KEY: 'test_app_key',
        DINGTALK_APP_SECRET: 'test_app_secret',
      },
    });

    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.ok, true);
    assert.match(data.message, /钉钉应用认证成功/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /oauth2\/accessToken/);

    await app.close();
  });

  it('trims surrounding whitespace before calling DingTalk auth API', async () => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/v1.0/oauth2/accessToken')) {
        return new Response(JSON.stringify({ accessToken: 'trimmed-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/dingtalk',
      headers: { 'X-Office-Claw-User': 'tester' },
      payload: {
        DINGTALK_APP_KEY: '  test_app_key  ',
        DINGTALK_APP_SECRET: '\ttest_app_secret \n',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      appKey: 'test_app_key',
      appSecret: 'test_app_secret',
    });

    await app.close();
  });

  it('rejects requests without credentials', async () => {
    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/dingtalk',
      headers: { 'X-Office-Claw-User': 'tester' },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().ok, false);

    await app.close();
  });

  it('returns localized identity error without user header', async () => {
    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/dingtalk',
      payload: {
        DINGTALK_APP_KEY: 'test_app_key',
        DINGTALK_APP_SECRET: 'test_app_secret',
      },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, '缺少用户身份，请先登录或携带 X-Office-Claw-User 请求头');

    await app.close();
  });

  it('returns 502 when DingTalk API rejects credentials', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/v1.0/oauth2/accessToken')) {
        return new Response(JSON.stringify({
          code: 'InvalidAppKey',
          message: 'invalid appkey',
        }), { status: 401, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/dingtalk',
      headers: { 'X-Office-Claw-User': 'tester' },
      payload: {
        DINGTALK_APP_KEY: 'bad_key',
        DINGTALK_APP_SECRET: 'bad_secret',
      },
    });

    assert.equal(res.statusCode, 502);
    const data = res.json();
    assert.equal(data.ok, false);
    assert.match(data.details, /钉钉接口返回异常/);

    await app.close();
  });
});
