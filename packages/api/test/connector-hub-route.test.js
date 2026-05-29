/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

const { connectorHubRoutes } = await import('../dist/routes/connector-hub.js');

const AUTH_HEADERS = { 'x-office-claw-user': 'owner-1' };

function attachAuth(app, userId = 'owner-1') {
  app.addHook('onRequest', async (request) => {
    request.auth = { userId, sessionId: `${userId}-session` };
  });
}

async function buildApp(overrides = {}, { authenticated = true } = {}) {
  const listCalls = [];
  const threadStore = {
    async list(userId) {
      listCalls.push(userId);
      return (
        overrides.threads ?? [
          {
            id: 'thread-hub-2',
            title: 'Feishu IM Hub',
            connectorHubState: { connectorId: 'feishu', externalChatId: 'chat-2', createdAt: 20 },
          },
          {
            id: 'thread-normal',
            title: 'Regular thread',
            connectorHubState: null,
          },
          {
            id: 'thread-hub-1',
            title: 'DingTalk IM Hub',
            connectorHubState: { connectorId: 'dingtalk', externalChatId: 'chat-1', createdAt: 10 },
          },
        ]
      );
    },
  };

  const app = Fastify();
  if (authenticated) attachAuth(app);
  await app.register(connectorHubRoutes, { threadStore });
  await app.ready();
  return { app, listCalls };
}

describe('GET /api/connector/weixin/qrcode-status — adapter not ready', () => {
  it('P1: returns 503 when QR confirms but weixinAdapter is not available (cloud review a312a53f)', async () => {
    // Arrange: inject a mock fetch that makes pollQrCodeStatus return 'confirmed'
    const { WeixinAdapter: WA } = await import('../dist/infrastructure/connectors/adapters/WeixinAdapter.js');
    const originalFetch = globalThis.fetch;
    WA._injectStaticFetch(async () => ({
      ok: true,
      json: async () => ({ errcode: 0, status: 2, bot_token: 'tok_secret_123' }),
    }));

    const app = Fastify();
    attachAuth(app);
    // Register with weixinAdapter deliberately missing (simulates gateway not started)
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      weixinAdapter: undefined,
    });
    await app.ready();

    // Act
    const res = await app.inject({
      method: 'GET',
      url: '/api/connector/weixin/qrcode-status?qrPayload=test-payload',
      headers: AUTH_HEADERS,
    });

    // Assert: should NOT return confirmed with 200 — token would be lost
    const body = JSON.parse(res.body);
    assert.notEqual(res.statusCode, 200, 'Should not return 200 when adapter is missing');
    assert.equal(res.statusCode, 503);
    assert.ok(body.error, 'Response should contain error message');
    assert.equal(body.error, '微信连接器尚未就绪，请稍后重试');
    assert.equal(body.status, undefined, 'Should not leak confirmed status');

    // Cleanup
    WA._injectStaticFetch(originalFetch);
    await app.close();
  });

  it('P1: returns confirmed when adapter IS available and QR confirms', async () => {
    const { WeixinAdapter: WA } = await import('../dist/infrastructure/connectors/adapters/WeixinAdapter.js');
    const originalFetch = globalThis.fetch;
    WA._injectStaticFetch(async () => ({
      ok: true,
      json: async () => ({ errcode: 0, status: 2, bot_token: 'tok_secret_456' }),
    }));

    let tokenSet = null;
    let pollingStarted = false;
    const mockAdapter = {
      setBotToken(t) {
        tokenSet = t;
      },
      hasBotToken() {
        return tokenSet != null;
      },
      isPolling() {
        return pollingStarted;
      },
    };

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      weixinAdapter: mockAdapter,
      startWeixinPolling: () => {
        pollingStarted = true;
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/connector/weixin/qrcode-status?qrPayload=test-payload',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.status, 'confirmed');
    assert.equal(tokenSet, 'tok_secret_456', 'Token should be set on adapter');
    assert.equal(pollingStarted, true, 'Polling should be started');

    WA._injectStaticFetch(originalFetch);
    await app.close();
  });

  it('persists and activates token through activateWeixinBotToken when available', async () => {
    const { WeixinAdapter: WA } = await import('../dist/infrastructure/connectors/adapters/WeixinAdapter.js');
    const originalFetch = globalThis.fetch;
    WA._injectStaticFetch(async () => ({
      ok: true,
      json: async () => ({ errcode: 0, status: 2, bot_token: 'tok_secret_789' }),
    }));

    const activated = [];
    const owners = [];
    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      activateWeixinBotToken: async (token) => {
        activated.push(token);
      },
      connectorRuntimeManager: {
        async reconcile() {
          return { applied: true, attemptedConnectors: [], appliedConnectors: [], unchangedConnectors: [], failedConnectors: [] };
        },
        async setOwnerUserId(userId) {
          owners.push(userId);
        },
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/connector/weixin/qrcode-status?qrPayload=test-payload',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.status, 'confirmed');
    assert.deepEqual(activated, ['tok_secret_789']);
    assert.deepEqual(owners, ['owner-1']);

    WA._injectStaticFetch(originalFetch);
    await app.close();
  });
});

describe('POST /api/connector/weixin/disconnect', () => {
  it('claims the logged-in user as connector owner on manual activate', async () => {
    const owners = [];
    let pollingStarted = false;
    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      weixinAdapter: {
        hasBotToken() {
          return true;
        },
        isPolling() {
          return pollingStarted;
        },
      },
      startWeixinPolling: () => {
        pollingStarted = true;
      },
      connectorRuntimeManager: {
        async reconcile() {
          return { applied: true, attemptedConnectors: [], appliedConnectors: [], unchangedConnectors: [], failedConnectors: [] };
        },
        async setOwnerUserId(userId) {
          owners.push(userId);
        },
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/weixin/activate',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, polling: true });
    assert.equal(pollingStarted, true);
    assert.deepEqual(owners, ['owner-1']);

    await app.close();
  });

  it('returns 503 when disconnect handler is unavailable', async () => {
    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      weixinAdapter: {
        hasBotToken() {
          return true;
        },
        isPolling() {
          return true;
        },
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/weixin/disconnect',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, '微信连接器不可用，连接网关尚未启动');
    await app.close();
  });

  it('clears active WeChat session through disconnectWeixinBotToken', async () => {
    let connected = true;
    let disconnectCalls = 0;
    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      weixinAdapter: {
        hasBotToken() {
          return connected;
        },
        isPolling() {
          return connected;
        },
      },
      disconnectWeixinBotToken: async () => {
        disconnectCalls += 1;
        connected = false;
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/weixin/disconnect',
      headers: AUTH_HEADERS,
    });

    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(disconnectCalls, 1);
    assert.deepEqual(body, { ok: true, configured: false });

    await app.close();
  });
});

describe('Feishu QR-only connector flow', () => {
  it('forces websocket mode and clears verification token after QR confirmation', async () => {
    const envDir = mkdtempSync(join(tmpdir(), 'office-claw-feishu-qr-'));
    const envFilePath = join(envDir, '.env');
    writeFileSync(envFilePath, 'FEISHU_VERIFICATION_TOKEN=legacy-token\n', 'utf8');
    process.env.FEISHU_VERIFICATION_TOKEN = 'legacy-token';
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    delete process.env.FEISHU_CONNECTION_MODE;

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      envFilePath,
      feishuQrBindClient: {
        async create() {
          throw new Error('not used');
        },
        async poll() {
          return {
            status: 'confirmed',
            appId: 'cli_qr_bound',
            appSecret: 'qr_secret',
          };
        },
      },
    });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/connector/feishu/qrcode-status?qrPayload=payload-1',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().status, 'confirmed');
      assert.equal(process.env.FEISHU_APP_ID, 'cli_qr_bound');
      assert.equal(process.env.FEISHU_APP_SECRET, 'qr_secret');
      assert.equal(process.env.FEISHU_CONNECTION_MODE, 'websocket');
      assert.equal(process.env.FEISHU_VERIFICATION_TOKEN, undefined);

      const envText = readFileSync(envFilePath, 'utf8');
      assert.match(envText, /FEISHU_APP_ID=cli_qr_bound/);
      assert.match(envText, /FEISHU_APP_SECRET=qr_secret/);
      assert.match(envText, /FEISHU_CONNECTION_MODE=websocket/);
      assert.doesNotMatch(envText, /FEISHU_VERIFICATION_TOKEN=/);
    } finally {
      await app.close();
      delete process.env.FEISHU_APP_ID;
      delete process.env.FEISHU_APP_SECRET;
      delete process.env.FEISHU_CONNECTION_MODE;
      delete process.env.FEISHU_VERIFICATION_TOKEN;
      rmSync(envDir, { recursive: true, force: true });
    }
  });

  it('disconnect clears all persisted Feishu QR connector settings', async () => {
    const envDir = mkdtempSync(join(tmpdir(), 'office-claw-feishu-disconnect-'));
    const envFilePath = join(envDir, '.env');
    writeFileSync(
      envFilePath,
      [
        'FEISHU_APP_ID=cli_qr_bound',
        'FEISHU_APP_SECRET=qr_secret',
        'FEISHU_CONNECTION_MODE=websocket',
        'FEISHU_VERIFICATION_TOKEN=legacy-token',
        'FEISHU_BOT_OPEN_ID=ou_bot_123',
      ].join('\n') + '\n',
      'utf8',
    );
    process.env.FEISHU_APP_ID = 'cli_qr_bound';
    process.env.FEISHU_APP_SECRET = 'qr_secret';
    process.env.FEISHU_CONNECTION_MODE = 'websocket';
    process.env.FEISHU_VERIFICATION_TOKEN = 'legacy-token';
    process.env.FEISHU_BOT_OPEN_ID = 'ou_bot_123';

    const app = Fastify();
    attachAuth(app);
    await app.register(connectorHubRoutes, {
      threadStore: {
        async list() {
          return [];
        },
      },
      envFilePath,
    });
    await app.ready();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/connector/feishu/disconnect',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.json().ok, true);
      assert.equal(process.env.FEISHU_APP_ID, undefined);
      assert.equal(process.env.FEISHU_APP_SECRET, undefined);
      assert.equal(process.env.FEISHU_CONNECTION_MODE, undefined);
      assert.equal(process.env.FEISHU_VERIFICATION_TOKEN, undefined);
      assert.equal(process.env.FEISHU_BOT_OPEN_ID, undefined);

      const envText = readFileSync(envFilePath, 'utf8');
      assert.doesNotMatch(envText, /FEISHU_APP_ID=/);
      assert.doesNotMatch(envText, /FEISHU_APP_SECRET=/);
      assert.doesNotMatch(envText, /FEISHU_CONNECTION_MODE=/);
      assert.doesNotMatch(envText, /FEISHU_VERIFICATION_TOKEN=/);
      assert.doesNotMatch(envText, /FEISHU_BOT_OPEN_ID=/);
    } finally {
      await app.close();
      delete process.env.FEISHU_APP_ID;
      delete process.env.FEISHU_APP_SECRET;
      delete process.env.FEISHU_CONNECTION_MODE;
      delete process.env.FEISHU_VERIFICATION_TOKEN;
      delete process.env.FEISHU_BOT_OPEN_ID;
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});

describe('GET /api/connector/hub-threads', () => {
  it('returns 401 when only a spoofed userId query param is provided', async () => {
    const { app } = await buildApp({}, { authenticated: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/connector/hub-threads?userId=spoofed',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(JSON.parse(res.body).error, '缺少用户身份，请先登录或携带 X-Office-Claw-User 请求头');
  });

  it('uses the trusted header identity and returns hub threads sorted by createdAt desc', async () => {
    const { app, listCalls } = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/connector/hub-threads?userId=spoofed',
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(listCalls, ['owner-1']);

    const body = JSON.parse(res.body);
    assert.deepEqual(
      body.threads.map((thread) => thread.id),
      ['thread-hub-2', 'thread-hub-1'],
    );
    assert.deepEqual(body.threads[0], {
      id: 'thread-hub-2',
      title: 'Feishu IM Hub',
      connectorId: 'feishu',
      externalChatId: 'chat-2',
      createdAt: 20,
    });
  });
});
