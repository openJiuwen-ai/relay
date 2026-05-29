/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F088 Gateway Integration Smoke Test
 * Tests the full flow with mocked platform SDKs:
 *   Inbound message → ConnectorRouter → agent mock → outbound delivery
 */
import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FeishuAdapter } from '../dist/infrastructure/connectors/adapters/FeishuAdapter.js';
import { ConnectorRouter } from '../dist/infrastructure/connectors/ConnectorRouter.js';
import { MemoryConnectorThreadBindingStore } from '../dist/infrastructure/connectors/ConnectorThreadBindingStore.js';
import { InboundMessageDedup } from '../dist/infrastructure/connectors/InboundMessageDedup.js';
import { OutboundDeliveryHook } from '../dist/infrastructure/connectors/OutboundDeliveryHook.js';

function assertFeishuCardContains(content, expectedHeader, expectedBody) {
  const parsed = JSON.parse(content);
  assert.equal(parsed.header?.title?.content, expectedHeader);
  const bodyEntry = parsed.elements?.find((item) => item.tag === 'markdown' && item.content === expectedBody);
  assert.ok(bodyEntry, `Expected Feishu card to contain body "${expectedBody}"`);
}

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

function mockTextAdapter(connectorId) {
  const sent = [];
  return {
    adapter: {
      connectorId,
      async sendReply(chatId, text) {
        sent.push({ chatId, text });
      },
    },
    sent,
  };
}

function buildTestHarness() {
  const log = noopLog();
  const bindingStore = new MemoryConnectorThreadBindingStore();
  const dedup = new InboundMessageDedup();
  const messageStore = {
    messages: [],
    async append(input) {
      const msg = {
        id: `msg-${this.messages.length + 1}`,
        ...input,
      };
      this.messages.push(msg);
      return msg;
    },
  };
  let threadCounter = 0;
  const threadStore = {
    create(userId, title) {
      threadCounter++;
      return { id: `thread-${threadCounter}`, createdBy: userId, title };
    },
  };
  const triggerCalls = [];
  const invokeTrigger = {
    trigger(threadId, agentId, userId, message, messageId) {
      triggerCalls.push({ threadId, agentId, userId, message, messageId });
    },
  };
  const broadcasts = [];
  const socketManager = {
    broadcastToRoom(room, event, data) {
      broadcasts.push({ room, event, data });
    },
  };

  const feishuAdapter = new FeishuAdapter('app-id', 'app-secret', log);
  const feishuSent = [];
  feishuAdapter._injectSendMessage(async (params) => {
    feishuSent.push(params);
  });
  const dingtalk = mockTextAdapter('dingtalk');

  const adapters = new Map([
    ['dingtalk', dingtalk.adapter],
    ['feishu', feishuAdapter],
  ]);

  const outboundHook = new OutboundDeliveryHook({
    bindingStore,
    adapters,
    log,
  });

  const router = new ConnectorRouter({
    bindingStore,
    dedup,
    messageStore,
    threadStore,
    invokeTrigger,
    socketManager,
    defaultUserId: 'owner-1',
    defaultAgentId: 'assistant',
    log,
  });

  return {
    router,
    outboundHook,
    bindingStore,
    messageStore,
    triggerCalls,
    dingtalkSent: dingtalk.sent,
    feishuSent,
    broadcasts,
  };
}

describe('F088 Gateway Integration', () => {
  describe('Feishu full flow', () => {
    it('inbound → route → outbound', async () => {
      const h = buildTestHarness();

      // 1. Simulate inbound Feishu event
      const feishuAdapter = new FeishuAdapter('app-id', 'app-secret', noopLog());
      const parsed = feishuAdapter.parseEvent({
        header: {
          event_type: 'im.message.receive_v1',
          event_id: 'evt-1',
        },
        event: {
          sender: {
            sender_id: { open_id: 'ou_user_1' },
            sender_type: 'user',
          },
          message: {
            message_id: 'om_msg_1',
            chat_id: 'oc_chat_1',
            chat_type: 'p2p',
            content: JSON.stringify({ text: '你好智能体！' }),
            message_type: 'text',
          },
        },
      });
      assert.ok(parsed, 'Should parse valid Feishu event');

      // 2. Route
      const result = await h.router.route('feishu', parsed.chatId, parsed.text, parsed.messageId);
      assert.equal(result.kind, 'routed');

      // 3. Verify connector source
      assert.equal(h.messageStore.messages[0].source.connector, 'feishu');
      assert.equal(h.messageStore.messages[0].source.label, '飞书');

      // 4. Outbound delivery
      await h.outboundHook.deliver(result.threadId, '智能体回复！');
      assert.equal(h.feishuSent.length, 1);
      assert.equal(h.feishuSent[0].chatId, 'oc_chat_1');
      assertFeishuCardContains(h.feishuSent[0].content, 'Agent', '智能体回复！');
    });
  });

  describe('Idempotency', () => {
    it('duplicate message ID does not trigger second invocation', async () => {
      const h = buildTestHarness();

      const r1 = await h.router.route('dingtalk', 'chat-1', 'Hello', 'ext-msg-1');
      const r2 = await h.router.route('dingtalk', 'chat-1', 'Hello', 'ext-msg-1');

      assert.equal(r1.kind, 'routed');
      assert.equal(r2.kind, 'skipped');
      assert.equal(h.triggerCalls.length, 1);
      assert.equal(h.messageStore.messages.length, 1);
    });
  });

  describe('Thread reuse', () => {
    it('second message from same chat reuses thread', async () => {
      const h = buildTestHarness();

      const r1 = await h.router.route('dingtalk', 'chat-1', 'First message', 'ext-1');
      const r2 = await h.router.route('dingtalk', 'chat-1', 'Second message', 'ext-2');

      assert.equal(r1.kind, 'routed');
      assert.equal(r2.kind, 'routed');
      assert.equal(r1.threadId, r2.threadId);
      assert.equal(h.messageStore.messages.length, 2);
    });
  });

  describe('Cross-platform binding isolation', () => {
    it('same user on different platforms gets different threads', async () => {
      const h = buildTestHarness();

      const r1 = await h.router.route('dingtalk', 'chat-1', 'From DingTalk', 'dt-1');
      const r2 = await h.router.route('feishu', 'chat-1', 'From Feishu', 'fs-1');

      assert.equal(r1.kind, 'routed');
      assert.equal(r2.kind, 'routed');
      assert.notEqual(r1.threadId, r2.threadId);
    });
  });

  describe('Outbound multi-platform delivery', () => {
    it('delivers to both platforms when thread has both bindings', async () => {
      const h = buildTestHarness();

      const r1 = await h.router.route('dingtalk', 'dt-chat', 'msg', 'dt-1');

      // Manually bind feishu to same thread (simulates dual-platform user)
      h.bindingStore.bind('feishu', 'fs-chat', r1.threadId, 'owner-1');

      // Deliver outbound
      await h.outboundHook.deliver(r1.threadId, 'Reply to both!');

      assert.equal(h.dingtalkSent.length, 1);
      assert.equal(h.feishuSent.length, 1);
      assert.equal(h.dingtalkSent[0].text, 'Reply to both!');
      assertFeishuCardContains(h.feishuSent[0].content, 'Agent', 'Reply to both!');
    });

    it('prefixes reply with cat identity when agentId provided', async () => {
      const h = buildTestHarness();
      const r = await h.router.route('dingtalk', 'dt-chat', 'hello', 'dt-1');

      await h.outboundHook.deliver(r.threadId, 'Hello!', 'assistant');

      assert.equal(h.dingtalkSent.length, 1);
      assert.equal(h.dingtalkSent[0].text, '[通用智能体] Hello!');
    });
  });

  describe('Phase 2: @-mention routing + identity prefix', () => {
    it('@agentteams in DingTalk → triggers agentteams + prefixed reply', async () => {
      const h = buildTestHarness();

      // 1. Inbound message with @agentteams mention
      const r = await h.router.route('dingtalk', 'dt-chat', '@agentteams please review this PR', 'dt-mention-1');
      assert.equal(r.kind, 'routed');

      // 2. Verify invocation targeted agentteams (not default assistant)
      assert.equal(h.triggerCalls.length, 1);
      assert.equal(h.triggerCalls[0].agentId, 'agentteams');

      // 3. Verify mentions stored in message
      assert.deepEqual(h.messageStore.messages[0].mentions, ['agentteams']);

      // 4. Simulate outbound with agentteams identity
      await h.outboundHook.deliver(r.threadId, 'LGTM!', 'agentteams');
      assert.equal(h.dingtalkSent.length, 1);
      assert.equal(h.dingtalkSent[0].text, '[编码智能体] LGTM!');
    });

    it('@通用智能体 in Feishu → triggers assistant + prefixed reply', async () => {
      const h = buildTestHarness();

      const r = await h.router.route('feishu', 'fs-chat', '@通用智能体 帮我看看这个', 'fs-mention-1');
      assert.equal(r.kind, 'routed');
      assert.equal(h.triggerCalls[0].agentId, 'assistant');
      assert.deepEqual(h.messageStore.messages[0].mentions, ['assistant']);

      await h.outboundHook.deliver(r.threadId, '好的！', 'assistant');
      assertFeishuCardContains(h.feishuSent[0].content, '通用智能体', '好的！');
    });

    it('no mention → default cat (assistant) invoked', async () => {
      const h = buildTestHarness();

      await h.router.route('dingtalk', 'dt-chat', 'hello cats!', 'dt-no-mention');
      assert.equal(h.triggerCalls[0].agentId, 'assistant');
    });
  });
});
