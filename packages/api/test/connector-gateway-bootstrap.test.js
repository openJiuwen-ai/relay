/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { startConnectorGateway } from '../dist/infrastructure/connectors/connector-gateway-bootstrap.js';

const envKeysToRestore = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_VERIFICATION_TOKEN',
  'FEISHU_CONNECTION_MODE',
  'DINGTALK_APP_KEY',
  'DINGTALK_APP_SECRET',
  'WEIXIN_BOT_TOKEN',
  'XIAOYI_AK',
  'XIAOYI_SK',
  'XIAOYI_AGENT_ID',
];
const originalEnv = Object.fromEntries(envKeysToRestore.map((key) => [key, process.env[key]]));

function noopLog() {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLog(),
  };
}

const baseDeps = {
  messageStore: {
    async append(input) {
      return { id: 'msg-1', ...input };
    },
  },
  threadStore: {
    create(userId, title) {
      return { id: 'thread-1', createdBy: userId, title };
    },
  },
  invokeTrigger: {
    trigger() {},
  },
  socketManager: {
    broadcastToRoom() {},
  },
  defaultUserId: 'owner-1',
  defaultAgentId: 'opus',
  log: noopLog(),
};

afterEach(() => {
  for (const key of envKeysToRestore) {
    const value = originalEnv[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('ConnectorGateway Bootstrap', () => {
  it('creates gateway in QR-only mode when no connectors configured', async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), 'office-claw-gateway-qr-only-'));
    try {
      const result = await startConnectorGateway({}, { ...baseDeps, hostRoot });
      assert.ok(result, 'Gateway should be created even without env tokens (for WeChat QR login)');
      assert.ok(result.weixinAdapter);
      assert.equal(result.weixinAdapter.hasBotToken(), false);
      assert.equal(result.webhookHandlers.size, 0);
      await result.stop();
    } finally {
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });

  it('creates gateway without feishu when verification token missing (fail-closed)', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
    };
    const result = await startConnectorGateway(config, baseDeps);
    assert.ok(result, 'Gateway should be created');
    assert.equal(result.webhookHandlers.has('feishu'), false, 'Feishu should not be registered');
    assert.ok(result.weixinAdapter, 'WeChat adapter should always be present');
    await result.stop();
  });

  it('creates gateway handle with feishu webhook handler', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, baseDeps);
    assert.ok(handle);
    assert.ok(handle.outboundHook);
    assert.ok(handle.webhookHandlers.has('feishu'));
    assert.equal(typeof handle.stop, 'function');
    await handle.stop();
  });

  it('feishu webhook handler handles verification challenge', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, baseDeps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    assert.ok(feishuHandler);

    const result = await feishuHandler.handleWebhook({ type: 'url_verification', challenge: 'my-challenge' }, {});
    assert.equal(result.kind, 'challenge');
    if (result.kind === 'challenge') {
      assert.equal(result.response.challenge, 'my-challenge');
    }
    await handle.stop();
  });

  it('feishu webhook handler routes DM text message', async () => {
    const triggerCalls = [];
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
    };

    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      {
        header: {
          event_type: 'im.message.receive_v1',
          event_id: 'evt-1',
          token: 'test-token',
        },
        event: {
          sender: {
            sender_id: { open_id: 'ou_user' },
            sender_type: 'user',
          },
          message: {
            message_id: 'om_msg_1',
            chat_id: 'oc_chat_1',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'Hello cat!' }),
            message_type: 'text',
          },
        },
      },
      {},
    );

    assert.equal(result.kind, 'processed');
    assert.equal(triggerCalls.length, 1);
    await handle.stop();
  });

  it('feishu webhook handler adds THUMBSUP reaction after successful inbound processing', async () => {
    const triggerCalls = [];
    const fetchCalls = [];
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      fetchCalls.push({ url: href, init });
      if (href.includes('/auth/v3/tenant_access_token/internal')) {
        return {
          ok: true,
          json: async () => ({ tenant_access_token: 'tenant-token', expire: 7200 }),
        };
      }
      if (href.includes('/bot/v3/info')) {
        return {
          ok: true,
          json: async () => ({ bot: { open_id: 'ou_bot_123' } }),
        };
      }
      if (href.includes('/reactions')) {
        return {
          ok: true,
          json: async () => ({ code: 0 }),
        };
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    try {
      const config = {
        feishuAppId: 'test-app-id',
        feishuAppSecret: 'test-app-secret',
        feishuVerificationToken: 'test-token',
      };
      const handle = await startConnectorGateway(config, deps);
      assert.ok(handle);

      const feishuHandler = handle.webhookHandlers.get('feishu');
      const result = await feishuHandler.handleWebhook(
        {
          header: {
            event_type: 'im.message.receive_v1',
            event_id: 'evt-react-1',
            token: 'test-token',
          },
          event: {
            sender: {
              sender_id: { open_id: 'ou_user' },
              sender_type: 'user',
            },
            message: {
              message_id: 'om_msg_react_1',
              chat_id: 'oc_chat_1',
              chat_type: 'p2p',
              content: JSON.stringify({ text: 'Hello cat!' }),
              message_type: 'text',
            },
          },
        },
        {},
      );

      assert.equal(result.kind, 'processed');
      assert.equal(triggerCalls.length, 1);

      for (let i = 0; i < 20; i++) {
        if (fetchCalls.some((call) => call.url.includes('/messages/om_msg_react_1/reactions'))) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const reactionCall = fetchCalls.find((call) => call.url.includes('/messages/om_msg_react_1/reactions'));
      assert.ok(reactionCall, 'reaction API should be called');
      assert.equal(reactionCall.init.method, 'POST');
      const body = JSON.parse(reactionCall.init.body);
      assert.equal(body.reaction_type.emoji_type, 'THUMBSUP');

      await handle.stop();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('feishu webhook handler skips unsupported events', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, baseDeps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      { header: { event_type: 'other.event', token: 'test-token' }, event: {} },
      {},
    );
    assert.equal(result.kind, 'skipped');
    await handle.stop();
  });

  it('uses coCreatorUserId from config for thread creation instead of deps.defaultUserId', async () => {
    const createdThreads = [];
    const deps = {
      ...baseDeps,
      defaultUserId: 'fallback-user',
      threadStore: {
        create(userId, title) {
          const t = { id: 'thread-owned', createdBy: userId, title };
          createdThreads.push(t);
          return t;
        },
      },
    };

    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
      coCreatorUserId: 'you-real-id',
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    await feishuHandler.handleWebhook(
      {
        header: { event_type: 'im.message.receive_v1', event_id: 'evt-1', token: 'test-token' },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_owner_test',
            chat_id: 'oc_owner_chat',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'test owner' }),
            message_type: 'text',
          },
        },
      },
      {},
    );

    assert.equal(createdThreads.length, 1);
    assert.equal(
      createdThreads[0].createdBy,
      'you-real-id',
      'thread should be created with coCreatorUserId, not fallback',
    );
    await handle.stop();
  });

  it('loadConnectorGatewayConfig reads DEFAULT_OWNER_USER_ID from env', async () => {
    const { loadConnectorGatewayConfig } = await import(
      '../dist/infrastructure/connectors/connector-gateway-bootstrap.js'
    );
    const originalEnv = process.env.DEFAULT_OWNER_USER_ID;
    try {
      process.env.DEFAULT_OWNER_USER_ID = 'env-owner-123';
      const config = loadConnectorGatewayConfig();
      assert.equal(config.coCreatorUserId, 'env-owner-123');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.DEFAULT_OWNER_USER_ID;
      } else {
        process.env.DEFAULT_OWNER_USER_ID = originalEnv;
      }
    }
  });

  it('loadConnectorGatewayConfig trims connector credential env values', async () => {
    const { loadConnectorGatewayConfig } = await import(
      '../dist/infrastructure/connectors/connector-gateway-bootstrap.js'
    );
    try {
      process.env.DINGTALK_APP_KEY = '  ding-key  ';
      process.env.DINGTALK_APP_SECRET = '\tding-secret ';
      process.env.XIAOYI_AGENT_ID = '  agent-id  ';
      process.env.XIAOYI_AK = '  ak-value  ';
      process.env.XIAOYI_SK = '\nsk-value\t';

      const config = loadConnectorGatewayConfig();
      assert.equal(config.dingtalkAppKey, 'ding-key');
      assert.equal(config.dingtalkAppSecret, 'ding-secret');
      assert.equal(config.xiaoyiAgentId, 'agent-id');
      assert.equal(config.xiaoyiAk, 'ak-value');
      assert.equal(config.xiaoyiSk, 'sk-value');
    } finally {
      delete process.env.DINGTALK_APP_KEY;
      delete process.env.DINGTALK_APP_SECRET;
      delete process.env.XIAOYI_AGENT_ID;
      delete process.env.XIAOYI_AK;
      delete process.env.XIAOYI_SK;
    }
  });

  it('restores persisted WeChat bot token across gateway restarts', async () => {
    const hostRoot = mkdtempSync(join(tmpdir(), 'office-claw-weixin-'));
    const delayedFetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        ok: true,
        json: async () => ({ ret: 0, msgs: [], get_updates_buf: 'cursor-1' }),
      };
    };

    try {
      const first = await startConnectorGateway(
        {},
        {
          ...baseDeps,
          hostRoot,
          _weixinFetch: delayedFetch,
        },
      );
      assert.ok(first);
      assert.equal(first.weixinAdapter.hasBotToken(), false);

      await first.activateWeixinBotToken('persisted-token-1');
      assert.equal(first.weixinAdapter.hasBotToken(), true);
      assert.equal(first.weixinAdapter.isPolling(), true);
      await first.stop();

      const second = await startConnectorGateway(
        {},
        {
          ...baseDeps,
          hostRoot,
          _weixinFetch: delayedFetch,
        },
      );
      assert.ok(second);
      assert.equal(second.weixinAdapter.hasBotToken(), true, 'Persisted token should be restored on restart');
      assert.equal(second.weixinAdapter.isPolling(), true, 'Polling should auto-start after restoring token');
      await second.stop();
    } finally {
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });

  it('does not restore persisted WeChat bot token when hostRoot is not explicitly provided', async () => {
    const { WeixinSessionStore } = await import('../dist/infrastructure/connectors/WeixinSessionStore.js');
    const originalLoad = WeixinSessionStore.prototype.load;
    let loadCalls = 0;

    WeixinSessionStore.prototype.load = function mockedLoad() {
      loadCalls++;
      return { version: 1, botToken: 'should-not-load', updatedAt: new Date().toISOString() };
    };

    try {
      const handle = await startConnectorGateway({}, baseDeps);
      assert.ok(handle);
      assert.equal(loadCalls, 0, 'Implicit gateway starts must not restore a persisted WeChat session');
      assert.equal(handle.weixinAdapter.hasBotToken(), false);
      await handle.stop();
    } finally {
      WeixinSessionStore.prototype.load = originalLoad;
    }
  });

  it('feishu webhook handler routes card action button click (AC-14)', async () => {
    const triggerCalls = [];
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
    };

    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      {
        header: {
          event_type: 'card.action.trigger',
          event_id: 'evt-card-1',
          token: 'test-token',
        },
        event: {
          operator: { open_id: 'ou_operator' },
          action: { value: { action: 'approve', threadId: 'th_123' }, tag: 'button' },
          context: { open_chat_id: 'oc_chat_card' },
        },
      },
      {},
    );

    assert.equal(result.kind, 'processed');
    assert.equal(triggerCalls.length, 1, 'card action should trigger cat invocation');
    await handle.stop();
  });

  it('feishu webhook handler routes image message (Phase 5)', async () => {
    const triggerCalls = [];
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
    };

    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      {
        header: {
          event_type: 'im.message.receive_v1',
          event_id: 'evt-img-1',
          token: 'test-token',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_img_1',
            chat_id: 'oc_chat_img',
            chat_type: 'p2p',
            content: JSON.stringify({ image_key: 'img-key-abc' }),
            message_type: 'image',
          },
        },
      },
      {},
    );

    assert.equal(result.kind, 'processed');
    assert.equal(triggerCalls.length, 1, 'image message should trigger cat invocation');
    // The routed text should be [图片]
    assert.equal(triggerCalls[0][3], '[图片]');
    await handle.stop();
  });

  it('feishu webhook handler routes voice message (Phase 6)', async () => {
    const triggerCalls = [];
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
    };

    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      {
        header: {
          event_type: 'im.message.receive_v1',
          event_id: 'evt-voice-1',
          token: 'test-token',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_voice_1',
            chat_id: 'oc_chat_voice',
            chat_type: 'p2p',
            content: JSON.stringify({ file_key: 'audio-key-xyz', duration: 5 }),
            message_type: 'audio',
          },
        },
      },
      {},
    );

    assert.equal(result.kind, 'processed');
    assert.equal(triggerCalls.length, 1, 'voice message should trigger cat invocation');
    assert.equal(triggerCalls[0][3], '[语音]');
    await handle.stop();
  });

  it('feishu webhook handler rejects events with invalid verification token', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'correct-token',
    };
    const handle = await startConnectorGateway(config, baseDeps);
    assert.ok(handle);

    const feishuHandler = handle.webhookHandlers.get('feishu');
    const result = await feishuHandler.handleWebhook(
      {
        header: {
          event_type: 'im.message.receive_v1',
          token: 'wrong-token',
        },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_msg',
            chat_id: 'oc_chat',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'evil message' }),
            message_type: 'text',
          },
        },
      },
      {},
    );
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.status, 403);
    }
    await handle.stop();
  });

  it('creates gateway with feishu in websocket mode without verificationToken', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuConnectionMode: 'websocket',
    };
    const mockWsClient = { started: false, closed: false };
    const deps = {
      ...baseDeps,
      _wsClientFactory: () => ({
        async start() {
          mockWsClient.started = true;
        },
        close() {
          mockWsClient.closed = true;
        },
      }),
    };
    const handle = await startConnectorGateway(config, deps);
    assert.ok(handle, 'Gateway should be created with websocket mode');
    assert.equal(handle.webhookHandlers.has('feishu'), false, 'Websocket mode should NOT register webhook handler');
    assert.ok(mockWsClient.started, 'Mock WSClient should have been started');
    await handle.stop();
    assert.ok(mockWsClient.closed, 'Mock WSClient should have been closed on stop');
  });

  it('feishu websocket mode adds THUMBSUP reaction after successful inbound processing', async () => {
    const triggerCalls = [];
    const fetchCalls = [];
    let wsEventDispatcher;
    const deps = {
      ...baseDeps,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
      _wsClientFactory: () => ({
        async start(opts) {
          wsEventDispatcher = opts.eventDispatcher;
        },
        close() {},
      }),
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      fetchCalls.push({ url: href, init });
      if (href.includes('/auth/v3/tenant_access_token/internal')) {
        return {
          ok: true,
          json: async () => ({ tenant_access_token: 'tenant-token', expire: 7200 }),
        };
      }
      if (href.includes('/bot/v3/info')) {
        return {
          ok: true,
          json: async () => ({ bot: { open_id: 'ou_bot_123' } }),
        };
      }
      if (href.includes('/reactions')) {
        return {
          ok: true,
          json: async () => ({ code: 0 }),
        };
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    try {
      const handle = await startConnectorGateway(
        {
          feishuAppId: 'test-app-id',
          feishuAppSecret: 'test-app-secret',
          feishuConnectionMode: 'websocket',
        },
        deps,
      );
      assert.ok(handle);
      assert.ok(wsEventDispatcher, 'WebSocket mode should start an event dispatcher');

      const onMessage = wsEventDispatcher.handles.get('im.message.receive_v1');
      assert.ok(onMessage, 'message receive handler should be registered');

      await onMessage({
        sender: {
          sender_id: { open_id: 'ou_user' },
          sender_type: 'user',
        },
        message: {
          message_id: 'om_msg_ws_react_1',
          chat_id: 'oc_chat_1',
          chat_type: 'p2p',
          content: JSON.stringify({ text: 'Hello cat!' }),
          message_type: 'text',
        },
      });

      assert.equal(triggerCalls.length, 1);

      for (let i = 0; i < 20; i++) {
        if (fetchCalls.some((call) => call.url.includes('/messages/om_msg_ws_react_1/reactions'))) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const reactionCall = fetchCalls.find((call) => call.url.includes('/messages/om_msg_ws_react_1/reactions'));
      assert.ok(reactionCall, 'reaction API should be called in websocket mode');
      assert.equal(reactionCall.init.method, 'POST');
      const body = JSON.parse(reactionCall.init.body);
      assert.equal(body.reaction_type.emoji_type, 'THUMBSUP');

      await handle.stop();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('feishu websocket mode still allows webhook mode when explicitly set', async () => {
    const config = {
      feishuAppId: 'test-app-id',
      feishuAppSecret: 'test-app-secret',
      feishuVerificationToken: 'test-token',
      feishuConnectionMode: 'webhook',
    };
    const handle = await startConnectorGateway(config, baseDeps);
    assert.ok(handle);
    assert.ok(handle.webhookHandlers.has('feishu'), 'Explicit webhook mode should register webhook handler');
    await handle.stop();
  });

  it('loadConnectorGatewayConfig reads FEISHU_CONNECTION_MODE from env', async () => {
    const { loadConnectorGatewayConfig } = await import(
      '../dist/infrastructure/connectors/connector-gateway-bootstrap.js'
    );

    process.env.FEISHU_CONNECTION_MODE = 'websocket';
    const config = loadConnectorGatewayConfig();
    assert.equal(config.feishuConnectionMode, 'websocket');

    process.env.FEISHU_CONNECTION_MODE = 'webhook';
    const config2 = loadConnectorGatewayConfig();
    assert.equal(config2.feishuConnectionMode, 'webhook');

    delete process.env.FEISHU_CONNECTION_MODE;
    const config3 = loadConnectorGatewayConfig();
    assert.equal(config3.feishuConnectionMode, 'webhook', 'Should default to webhook when not set');
  });

  it('reconcile hot-swaps feishu webhook verification token without API restart', async () => {
    process.env.FEISHU_APP_ID = 'test-app-id';
    process.env.FEISHU_APP_SECRET = 'test-app-secret';
    process.env.FEISHU_VERIFICATION_TOKEN = 'new-token';

    const sharedHandlers = new Map();
    const handle = await startConnectorGateway(
      {
        feishuAppId: 'test-app-id',
        feishuAppSecret: 'test-app-secret',
        feishuVerificationToken: 'old-token',
      },
      { ...baseDeps, webhookHandlers: sharedHandlers },
    );
    assert.equal(sharedHandlers, handle.webhookHandlers);

    const firstHandler = sharedHandlers.get('feishu');
    assert.ok(firstHandler);
    const firstResult = await firstHandler.handleWebhook(
      {
        header: { event_type: 'im.message.receive_v1', token: 'old-token' },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_old_token',
            chat_id: 'oc_chat',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'hello' }),
            message_type: 'text',
          },
        },
      },
      {},
    );
    assert.equal(firstResult.kind, 'processed');

    const summary = await handle.reconcile(['FEISHU_VERIFICATION_TOKEN']);
    assert.equal(summary.applied, true);
    assert.deepEqual(summary.appliedConnectors, ['feishu']);

    const nextHandler = sharedHandlers.get('feishu');
    assert.ok(nextHandler);
    const staleTokenResult = await nextHandler.handleWebhook(
      {
        header: { event_type: 'im.message.receive_v1', token: 'old-token' },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_stale_token',
            chat_id: 'oc_chat',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'hello' }),
            message_type: 'text',
          },
        },
      },
      {},
    );
    assert.equal(staleTokenResult.kind, 'error');

    const newTokenResult = await nextHandler.handleWebhook(
      {
        header: { event_type: 'im.message.receive_v1', token: 'new-token' },
        event: {
          sender: { sender_id: { open_id: 'ou_user' } },
          message: {
            message_id: 'om_new_token',
            chat_id: 'oc_chat',
            chat_type: 'p2p',
            content: JSON.stringify({ text: 'hello' }),
            message_type: 'text',
          },
        },
      },
      {},
    );
    assert.equal(newTokenResult.kind, 'processed');
    await handle.stop();
  });

  it('reconcile restarts dingtalk stream in place', async () => {
    const { DingTalkAdapter } = await import('../dist/infrastructure/connectors/adapters/DingTalkAdapter.js');
    const originalStart = DingTalkAdapter.prototype.startStream;
    const originalStop = DingTalkAdapter.prototype.stopStream;
    let starts = 0;
    let stops = 0;

    DingTalkAdapter.prototype.startStream = async function mockedStart() {
      starts++;
    };
    DingTalkAdapter.prototype.stopStream = async function mockedStop() {
      stops++;
    };

    process.env.DINGTALK_APP_KEY = 'next-key';
    process.env.DINGTALK_APP_SECRET = 'next-secret';

    try {
      const handle = await startConnectorGateway(
        {
          dingtalkAppKey: 'old-key',
          dingtalkAppSecret: 'old-secret',
        },
        baseDeps,
      );
      assert.equal(starts, 1);

      const summary = await handle.reconcile(['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET']);
      assert.equal(summary.applied, true);
      assert.deepEqual(summary.appliedConnectors, ['dingtalk']);
      assert.equal(stops, 1);
      assert.equal(starts, 2);
      await handle.stop();
    } finally {
      DingTalkAdapter.prototype.startStream = originalStart;
      DingTalkAdapter.prototype.stopStream = originalStop;
    }
  });

  it('reconcile restarts xiaoyi stream in place', async () => {
    const { XiaoyiAdapter } = await import('../dist/infrastructure/connectors/adapters/XiaoyiAdapter.js');
    const originalStart = XiaoyiAdapter.prototype.startStream;
    const originalStop = XiaoyiAdapter.prototype.stopStream;
    let starts = 0;
    let stops = 0;

    XiaoyiAdapter.prototype.startStream = async function mockedStart() {
      starts++;
    };
    XiaoyiAdapter.prototype.stopStream = async function mockedStop() {
      stops++;
    };

    process.env.XIAOYI_AK = 'next-ak';
    process.env.XIAOYI_SK = 'next-sk';
    process.env.XIAOYI_AGENT_ID = 'next-agent';

    try {
      const handle = await startConnectorGateway(
        {
          xiaoyiAk: 'old-ak',
          xiaoyiSk: 'old-sk',
          xiaoyiAgentId: 'old-agent',
        },
        baseDeps,
      );
      assert.equal(starts, 1);

      const summary = await handle.reconcile(['XIAOYI_AK', 'XIAOYI_SK', 'XIAOYI_AGENT_ID']);
      assert.equal(summary.applied, true);
      assert.deepEqual(summary.appliedConnectors, ['xiaoyi']);
      assert.equal(stops, 1);
      assert.equal(starts, 2);
      await handle.stop();
    } finally {
      XiaoyiAdapter.prototype.startStream = originalStart;
      XiaoyiAdapter.prototype.stopStream = originalStop;
    }
  });
});
