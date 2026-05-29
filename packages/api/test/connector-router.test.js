/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import { ConnectorRouter } from '../dist/infrastructure/connectors/ConnectorRouter.js';
import { MemoryConnectorThreadBindingStore } from '../dist/infrastructure/connectors/ConnectorThreadBindingStore.js';
import { InboundMessageDedup } from '../dist/infrastructure/connectors/InboundMessageDedup.js';

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

function mockMessageStore() {
  const messages = [];
  return {
    messages,
    async append(input) {
      const msg = { id: `msg-${messages.length + 1}`, ...input };
      messages.push(msg);
      return msg;
    },
  };
}

function mockThreadStore() {
  let counter = 0;
  const threads = new Map();
  return {
    threads,
    create(userId, title, projectPath = 'default') {
      counter++;
      const thread = {
        id: `thread-${counter}`,
        createdBy: userId,
        title,
        participants: [],
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
        projectPath,
      };
      threads.set(thread.id, thread);
      return thread;
    },
    async get(threadId) {
      return threads.get(threadId) ?? null;
    },
    updateConnectorHubState(threadId, state) {
      const thread = threads.get(threadId);
      if (!thread) return;
      if (state === null) {
        delete thread.connectorHubState;
      } else {
        thread.connectorHubState = state;
      }
    },
  };
}

function mockTrigger() {
  const calls = [];
  return {
    calls,
    trigger(threadId, agentId, userId, message, messageId, policy) {
      calls.push({ threadId, agentId, userId, message, messageId, policy });
    },
  };
}

function mockSocketManager() {
  const broadcasts = [];
  const emitted = [];
  return {
    broadcasts,
    emitted,
    broadcastToRoom(room, event, data) {
      broadcasts.push({ room, event, data });
    },
    emitToUser(userId, event, data) {
      emitted.push({ userId, event, data });
    },
  };
}

describe('ConnectorRouter', () => {
  let bindingStore;
  let dedup;
  let messageStore;
  let threadStore;
  let trigger;
  let socketManager;
  let router;
  beforeEach(() => {
    bindingStore = new MemoryConnectorThreadBindingStore();
    dedup = new InboundMessageDedup();
    messageStore = mockMessageStore();
    threadStore = mockThreadStore();
    trigger = mockTrigger();
    socketManager = mockSocketManager();

    router = new ConnectorRouter({
      bindingStore,
      dedup,
      messageStore,
      threadStore,
      invokeTrigger: trigger,
      socketManager,
      defaultUserId: 'owner-1',
      defaultAgentId: 'opus',
      log: noopLog(),
    });
  });

  it('routes new message and creates thread + binding', async () => {
    const result = await router.route('feishu', 'chat-123', 'Hello cat!', 'msg-001');
    assert.equal(result.kind, 'routed');
    assert.ok(result.threadId);
    assert.ok(result.messageId);
    assert.deepEqual(socketManager.emitted, [
      {
        userId: 'owner-1',
        event: 'thread_created',
        data: { threadId: result.threadId, source: 'connector_auto' },
      },
    ]);

    // Binding should exist
    const binding = bindingStore.getByExternal('feishu', 'chat-123');
    assert.ok(binding);
    assert.equal(binding.threadId, result.threadId);
    assert.equal(threadStore.threads.get(result.threadId)?.projectPath, 'default');
  });

  it('reuses existing thread for same external chat', async () => {
    const r1 = await router.route('feishu', 'chat-123', 'msg 1', 'ext-1');
    const r2 = await router.route('feishu', 'chat-123', 'msg 2', 'ext-2');
    assert.equal(r1.threadId, r2.threadId);
  });

  it('uses binding userId for routed messages when binding already exists', async () => {
    process.env.DEFAULT_OWNER_USER_ID = 'default-user';
    try {
      bindingStore.bind('feishu', 'chat-bound-user', 'thread-bound-user', 'owner-bound');
      await router.route('feishu', 'chat-bound-user', 'hello', 'ext-bound-user-1');
      assert.equal(messageStore.messages[0].userId, 'owner-bound');
      assert.equal(trigger.calls[0].userId, 'owner-bound');
    } finally {
      delete process.env.DEFAULT_OWNER_USER_ID;
    }
  });

  it('uses defaultUserIdResolver for new bindings when no binding exists', async () => {
    const routerWithResolver = new ConnectorRouter({
      bindingStore,
      dedup,
      messageStore,
      threadStore,
      invokeTrigger: trigger,
      socketManager,
      defaultUserIdResolver: () => 'resolved-owner',
      defaultUserId: 'owner-1',
      defaultAgentId: 'opus',
      log: noopLog(),
    });

    await routerWithResolver.route('weixin', 'chat-resolver', 'hello', 'ext-resolver-1');
    assert.equal(messageStore.messages[0].userId, 'resolved-owner');
    assert.equal(trigger.calls[0].userId, 'resolved-owner');
  });

  it('drops legacy default-user bindings and recreates the thread under the resolved owner', async () => {
    const originalOwner = process.env.DEFAULT_OWNER_USER_ID;
    delete process.env.DEFAULT_OWNER_USER_ID;
    try {
      bindingStore.bind('dingtalk', 'chat-legacy', 'thread-legacy', 'default-user');
      const routerWithResolver = new ConnectorRouter({
        bindingStore,
        dedup,
        messageStore,
        threadStore,
        invokeTrigger: trigger,
        socketManager,
        defaultUserIdResolver: () => 'owner-real',
        defaultUserId: 'default-user',
        defaultAgentId: 'opus',
        log: noopLog(),
      });

      const result = await routerWithResolver.route('dingtalk', 'chat-legacy', 'hello', 'ext-legacy-1');
      assert.equal(result.kind, 'routed');
      assert.notEqual(result.threadId, 'thread-legacy');
      assert.equal(messageStore.messages[0].userId, 'owner-real');
      assert.equal(trigger.calls[0].userId, 'owner-real');
      assert.deepEqual(socketManager.emitted, [
        {
          userId: 'owner-real',
          event: 'thread_created',
          data: { threadId: result.threadId, source: 'connector_auto' },
        },
      ]);
      const rebound = bindingStore.getByExternal('dingtalk', 'chat-legacy');
      assert.equal(rebound?.userId, 'owner-real');
    } finally {
      if (originalOwner == null) {
        delete process.env.DEFAULT_OWNER_USER_ID;
      } else {
        process.env.DEFAULT_OWNER_USER_ID = originalOwner;
      }
    }
  });

  it('skips inbound routing when owner is unresolved instead of binding to default-user', async () => {
    const originalOwner = process.env.DEFAULT_OWNER_USER_ID;
    delete process.env.DEFAULT_OWNER_USER_ID;
    try {
      const unresolvedRouter = new ConnectorRouter({
        bindingStore,
        dedup,
        messageStore,
        threadStore,
        invokeTrigger: trigger,
        socketManager,
        defaultUserIdResolver: () => 'default-user',
        defaultUserId: 'default-user',
        defaultAgentId: 'opus',
        log: noopLog(),
      });

      const result = await unresolvedRouter.route('dingtalk', 'chat-no-owner', 'hello', 'ext-no-owner-1');
      assert.deepEqual(result, { kind: 'skipped', reason: 'owner_unresolved' });
      assert.equal(messageStore.messages.length, 0);
      assert.equal(trigger.calls.length, 0);
      assert.equal(threadStore.threads.size, 0);
      assert.equal(bindingStore.getByExternal('dingtalk', 'chat-no-owner'), null);
    } finally {
      if (originalOwner == null) {
        delete process.env.DEFAULT_OWNER_USER_ID;
      } else {
        process.env.DEFAULT_OWNER_USER_ID = originalOwner;
      }
    }
  });

  it('posts message to message store with ConnectorSource', async () => {
    await router.route('feishu', 'chat-123', 'Hello', 'ext-1');
    assert.equal(messageStore.messages.length, 1);
    assert.equal(messageStore.messages[0].source.connector, 'feishu');
    assert.equal(messageStore.messages[0].source.label, '飞书');
  });

  it('triggers cat invocation', async () => {
    await router.route('feishu', 'chat-123', 'Hello', 'ext-1');
    assert.equal(trigger.calls.length, 1);
    assert.equal(trigger.calls[0].agentId, 'opus');
    assert.ok(trigger.calls[0].threadId);
  });

  it('routes by displayName mention for connector messages', async () => {
    officeClawRegistry.reset();
    officeClawRegistry.register('office', {
      id: 'office',
      name: '办公智能体',
      displayName: '办公智能体',
      nickname: '小九',
      avatar: '/avatars/agent-avatar-2.png',
      color: { primary: '#2B5797', secondary: '#C0D0E8' },
      mentionPatterns: ['@office', '@小九'],
      provider: 'relayclaw',
      defaultModel: 'gpt-5.4',
      mcpSupport: true,
      breedId: 'office',
      roleDescription: '商务办公专家',
      personality: '专业干练',
    });

    try {
      await router.route('weixin', 'chat-office', '@办公智能体 帮我做个会议纪要', 'ext-office-1');
      assert.equal(trigger.calls.length, 1);
      assert.equal(trigger.calls[0].agentId, 'office');
      assert.equal(messageStore.messages[0].mentions[0], 'office');
    } finally {
      officeClawRegistry.reset();
    }
  });

  it('skips duplicate messages', async () => {
    const r1 = await router.route('feishu', 'chat-123', 'Hello', 'ext-1');
    const r2 = await router.route('feishu', 'chat-123', 'Hello', 'ext-1');
    assert.equal(r1.kind, 'routed');
    assert.equal(r2.kind, 'skipped');
    assert.equal(messageStore.messages.length, 1);
  });

  it('broadcasts connector message to websocket', async () => {
    await router.route('feishu', 'chat-123', 'Hello', 'ext-1');
    assert.ok(socketManager.broadcasts.length > 0);
    assert.equal(socketManager.broadcasts[0].event, 'connector_message');
  });

  it('emits nested message protocol (threadId + message.{id,type,content,source,timestamp})', async () => {
    await router.route('feishu', 'chat-123', 'Hi from IM', 'ext-proto-1');
    const bc = socketManager.broadcasts.find((b) => b.event === 'connector_message');
    assert.ok(bc, 'should have a connector_message broadcast');
    const { data } = bc;
    // Must have nested message — frontend guard: if (!data?.message?.id) return;
    assert.ok(data.threadId, 'data.threadId must exist');
    assert.ok(data.message, 'data.message must exist (nested protocol)');
    assert.ok(data.message.id, 'data.message.id must exist');
    assert.equal(data.message.type, 'connector');
    assert.equal(data.message.content, 'Hi from IM');
    assert.ok(data.message.source, 'data.message.source must exist');
    assert.equal(data.message.source.connector, 'feishu');
    assert.equal(typeof data.message.timestamp, 'number');
    // Must NOT have flat legacy fields
    assert.equal(data.messageId, undefined, 'legacy messageId must not exist');
    assert.equal(data.connectorId, undefined, 'legacy connectorId must not exist');
  });

  describe('command interception', () => {
    let commandRouter;
    let adapterSendCalls;
    let cmdTrigger;

    function mockCommandLayer(responses) {
      return {
        async handle(_connectorId, _externalChatId, _userId, text) {
          const trimmed = text.trim();
          const cmd = trimmed.split(/\s+/)[0].toLowerCase();
          return responses[cmd] ?? { kind: 'not-command' };
        },
      };
    }

    function mockAdapter() {
      adapterSendCalls = [];
      return {
        async sendReply(externalChatId, content) {
          adapterSendCalls.push({ externalChatId, content });
        },
      };
    }

    beforeEach(() => {
      cmdTrigger = mockTrigger();
      const adaptersMap = new Map();
      adaptersMap.set('feishu', mockAdapter());

      commandRouter = new ConnectorRouter({
        bindingStore,
        dedup,
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'You are here' },
          '/new': { kind: 'new', response: 'Thread created', newActiveThreadId: 'thread-99' },
        }),
        adapters: adaptersMap,
      });
    });

    it('routes /where command without triggering invocation', async () => {
      const result = await commandRouter.route('feishu', 'chat-123', '/where', 'ext-cmd-1');
      assert.equal(result.kind, 'command');
      // Adapter should have received the response
      assert.equal(adapterSendCalls.length, 1);
      assert.equal(adapterSendCalls[0].externalChatId, 'chat-123');
      assert.equal(adapterSendCalls[0].content, 'You are here');
      // invokeTrigger should NOT have been called
      assert.equal(cmdTrigger.calls.length, 0);
      // Message should NOT be stored
      assert.equal(messageStore.messages.length, 0);
    });

    it('routes unknown /command as normal message', async () => {
      const result = await commandRouter.route('feishu', 'chat-123', '/unknown foo', 'ext-cmd-2');
      assert.equal(result.kind, 'routed');
      // invokeTrigger should have been called (normal routing)
      assert.equal(cmdTrigger.calls.length, 1);
      // No command response sent
      assert.equal(adapterSendCalls.length, 0);
    });

    it('handles /new command and sends response', async () => {
      const result = await commandRouter.route('feishu', 'chat-123', '/new My Topic', 'ext-cmd-3');
      assert.equal(result.kind, 'command');
      assert.equal(adapterSendCalls.length, 1);
      assert.ok(adapterSendCalls[0].content.includes('Thread created'));
      assert.equal(cmdTrigger.calls.length, 0);
    });

    it('command exchange broadcasts nested protocol (not legacy flat fields)', async () => {
      // Pre-route a normal message so a binding + hub thread exist for chat-cmd-proto
      await commandRouter.route('feishu', 'chat-cmd-proto', 'setup', 'ext-cmd-setup');
      socketManager.broadcasts.length = 0; // clear setup broadcasts

      await commandRouter.route('feishu', 'chat-cmd-proto', '/where', 'ext-cmd-proto-1');
      const cmdBroadcasts = socketManager.broadcasts.filter((b) => b.event === 'connector_message');
      assert.equal(cmdBroadcasts.length, 2, 'should emit command + response');

      // Command message
      const cmd = cmdBroadcasts[0].data;
      assert.ok(cmd.message, 'command broadcast must use nested protocol');
      assert.ok(cmd.message.id, 'command message.id');
      assert.equal(cmd.message.type, 'connector');
      assert.equal(cmd.message.content, '/where');
      assert.equal(cmd.message.source.connector, 'feishu');
      assert.equal(typeof cmd.message.timestamp, 'number');
      assert.equal(cmd.messageId, undefined, 'no legacy messageId');

      // Response message
      const res = cmdBroadcasts[1].data;
      assert.ok(res.message, 'response broadcast must use nested protocol');
      assert.ok(res.message.id, 'response message.id');
      assert.equal(res.message.type, 'connector');
      assert.equal(res.message.content, 'You are here');
      assert.equal(res.message.source.connector, 'system-command');
      assert.ok(res.message.timestamp >= cmd.message.timestamp, 'response timestamp >= command');
      assert.equal(res.messageId, undefined, 'no legacy messageId');
    });

    it('uses sendFormattedReply (MessageEnvelope) when adapter supports it', async () => {
      // Replace adapter with one that has sendFormattedReply
      const envelopeCalls = [];
      const formattedAdapter = {
        async sendReply() {
          throw new Error('should not be called');
        },
        async sendFormattedReply(externalChatId, envelope) {
          envelopeCalls.push({ externalChatId, envelope });
        },
      };
      const adaptersMap = new Map();
      adaptersMap.set('feishu', formattedAdapter);
      const router2 = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'You are here' },
        }),
        adapters: adaptersMap,
      });

      const result = await router2.route('feishu', 'chat-123', '/where', 'ext-fmt-1');
      assert.equal(result.kind, 'command');
      assert.equal(envelopeCalls.length, 1);
      assert.equal(envelopeCalls[0].envelope.header, 'OfficeClaw');
      assert.equal(envelopeCalls[0].envelope.body, 'You are here');
      assert.ok(envelopeCalls[0].envelope.footer); // has timestamp
    });

    it('falls back to sendReply when adapter lacks sendFormattedReply', async () => {
      // Default mockAdapter has no sendFormattedReply
      const result = await commandRouter.route('feishu', 'chat-123', '/where', 'ext-fb-1');
      assert.equal(result.kind, 'command');
      assert.equal(adapterSendCalls.length, 1);
      assert.equal(adapterSendCalls[0].content, 'You are here');
    });

    it('still dedup-checks before command handling', async () => {
      await commandRouter.route('feishu', 'chat-123', '/where', 'ext-dup');
      const r2 = await commandRouter.route('feishu', 'chat-123', '/where', 'ext-dup');
      assert.equal(r2.kind, 'skipped');
      assert.equal(r2.reason, 'duplicate');
    });

    it('stores command exchange in Hub thread (ISSUE-8 8A)', async () => {
      // Pre-create a binding so resolveHubThread can find it
      bindingStore.bind('feishu', 'chat-hub-1', 'thread-conv-1', 'owner-1');
      const ctxRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'Thread info here' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });
      const result = await ctxRouter.route('feishu', 'chat-hub-1', '/where', 'ext-ctx-1');
      assert.equal(result.kind, 'command');
      // Hub thread should be lazily created (not the conversation thread)
      assert.ok(result.threadId);
      assert.notEqual(result.threadId, 'thread-conv-1', 'should NOT store in conversation thread');
      assert.ok(result.messageId);
      assert.equal(threadStore.threads.get(result.threadId)?.projectPath, 'default');
      // Two messages stored: inbound command + outbound response
      assert.equal(messageStore.messages.length, 2);
      assert.equal(messageStore.messages[0].content, '/where');
      assert.equal(messageStore.messages[0].source.connector, 'feishu');
      assert.equal(messageStore.messages[1].content, 'Thread info here');
      assert.equal(messageStore.messages[1].source.connector, 'system-command');
      // Hub thread should be persisted in binding
      const binding = bindingStore.getByExternal('feishu', 'chat-hub-1');
      assert.equal(binding.hubThreadId, result.threadId);
    });

    it('broadcasts command exchange to Hub thread WebSocket (ISSUE-8 8A)', async () => {
      bindingStore.bind('feishu', 'chat-hub-bc', 'thread-conv-bc', 'owner-1');
      const ctxSocket = mockSocketManager();
      const ctxRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager: ctxSocket,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/new': { kind: 'new', response: 'Created!', newActiveThreadId: 'thread-new' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });
      const result = await ctxRouter.route('feishu', 'chat-hub-bc', '/new Test', 'ext-ctx-2');
      const hubThreadId = result.threadId;
      assert.ok(hubThreadId);
      assert.notEqual(hubThreadId, 'thread-conv-bc');
      assert.equal(ctxSocket.broadcasts.length, 2);
      assert.equal(ctxSocket.broadcasts[0].room, `thread:${hubThreadId}`);
      assert.equal(ctxSocket.broadcasts[0].data.message.source.connector, 'feishu');
      assert.equal(ctxSocket.broadcasts[1].room, `thread:${hubThreadId}`);
      assert.equal(ctxSocket.broadcasts[1].data.message.source.connector, 'system-command');
    });

    it('/thread command forwards message to target thread and triggers invocation', async () => {
      const fwdTrigger = mockTrigger();
      const fwdSocket = mockSocketManager();
      const fwdStore = mockMessageStore();
      const fwdRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore: fwdStore,
        threadStore,
        invokeTrigger: fwdTrigger,
        socketManager: fwdSocket,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/thread': {
            kind: 'thread',
            response: '📨 已路由到 目标Thread',
            newActiveThreadId: 'thread-target-1',
            contextThreadId: 'thread-target-1',
            forwardContent: 'hi there',
          },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });
      const result = await fwdRouter.route('feishu', 'chat-123', '/thread thread-target-1 hi there', 'ext-fwd-1');
      assert.equal(result.kind, 'routed');
      assert.equal(result.threadId, 'thread-target-1');
      // Forward content should be stored (not the /thread command)
      const fwdMsg = fwdStore.messages.find((m) => m.content === 'hi there');
      assert.ok(fwdMsg, 'forwarded message should be stored');
      assert.equal(fwdMsg.threadId, 'thread-target-1');
      // Cat invocation should be triggered for the target thread
      assert.equal(fwdTrigger.calls.length, 1);
      assert.equal(fwdTrigger.calls[0].threadId, 'thread-target-1');
      assert.equal(fwdTrigger.calls[0].message, 'hi there');
    });

    it('/thread command sends confirmation response to adapter', async () => {
      const fwdRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: mockTrigger(),
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/thread': {
            kind: 'thread',
            response: '📨 已路由',
            newActiveThreadId: 'thread-t1',
            contextThreadId: 'thread-t1',
            forwardContent: 'hello',
          },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });
      await fwdRouter.route('feishu', 'chat-123', '/thread thread-t1 hello', 'ext-fwd-2');
      // Adapter should receive confirmation
      assert.equal(adapterSendCalls.length, 1);
      assert.ok(adapterSendCalls[0].content.includes('已路由'));
    });

    it('skips message storage when no binding exists (ISSUE-8 8A)', async () => {
      const ctxRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'No binding' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });
      const result = await ctxRouter.route('feishu', 'chat-no-bind', '/where', 'ext-ctx-3');
      assert.equal(result.kind, 'command');
      assert.equal(result.threadId, undefined);
      assert.equal(messageStore.messages.length, 0);
    });

    it('Hub thread is lazily created once and reused (ISSUE-8 8A)', async () => {
      bindingStore.bind('feishu', 'chat-reuse', 'thread-conv-reuse', 'owner-1');
      const hubRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'Info' },
          '/threads': { kind: 'threads', response: 'List' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const r1 = await hubRouter.route('feishu', 'chat-reuse', '/where', 'ext-reuse-1');
      assert.ok(r1.threadId);
      const hubThreadId = r1.threadId;
      assert.notEqual(hubThreadId, 'thread-conv-reuse');

      const r2 = await hubRouter.route('feishu', 'chat-reuse', '/threads', 'ext-reuse-2');
      assert.equal(r2.threadId, hubThreadId, 'second command should reuse same Hub thread');

      const binding = bindingStore.getByExternal('feishu', 'chat-reuse');
      assert.equal(binding.hubThreadId, hubThreadId);
    });

    it('emits thread_created when Hub thread is first created', async () => {
      bindingStore.bind('feishu', 'chat-hub-refresh', 'thread-conv-refresh', 'owner-1');
      const hubSocket = mockSocketManager();
      const hubRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager: hubSocket,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'Info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const result = await hubRouter.route('feishu', 'chat-hub-refresh', '/where', 'ext-hub-refresh-1');
      const threadCreated = hubSocket.emitted.find((event) => event.event === 'thread_created');

      assert.ok(result.threadId);
      assert.deepEqual(threadCreated, {
        userId: 'owner-1',
        event: 'thread_created',
        data: { threadId: result.threadId, source: 'connector_hub' },
      });
    });

    it('recreates Hub thread when stored hub belongs to a different owner', async () => {
      const staleHubThread = threadStore.create('owner-old', '飞书 IM Hub');
      threadStore.updateConnectorHubState(staleHubThread.id, {
        v: 1,
        connectorId: 'feishu',
        externalChatId: 'chat-owner-switch',
        createdAt: Date.now() - 1000,
      });

      bindingStore.bind('feishu', 'chat-owner-switch', 'thread-conv-old', 'owner-old');
      bindingStore.setHubThread('feishu', 'chat-owner-switch', staleHubThread.id);
      bindingStore.bind('feishu', 'chat-owner-switch', 'thread-conv-new', 'owner-1');

      const hubSocket = mockSocketManager();
      const hubRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager: hubSocket,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'Info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const result = await hubRouter.route('feishu', 'chat-owner-switch', '/where', 'ext-owner-switch-1');
      const updatedBinding = bindingStore.getByExternal('feishu', 'chat-owner-switch');
      const recreatedHubThread = threadStore.threads.get(result.threadId);

      assert.ok(result.threadId);
      assert.notEqual(result.threadId, staleHubThread.id);
      assert.equal(updatedBinding?.hubThreadId, result.threadId);
      assert.equal(recreatedHubThread?.createdBy, 'owner-1');
      assert.deepEqual(
        hubSocket.emitted.find((event) => event.event === 'thread_created'),
        {
          userId: 'owner-1',
          event: 'thread_created',
          data: { threadId: result.threadId, source: 'connector_hub' },
        },
      );
    });

    it('Hub thread title includes connector display name (ISSUE-8 8A)', async () => {
      bindingStore.bind('feishu', 'chat-title', 'thread-conv-title', 'owner-1');
      const titleRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const result = await titleRouter.route('feishu', 'chat-title', '/where', 'ext-title-1');
      const hubThread = threadStore.threads.get(result.threadId);
      assert.ok(hubThread);
      assert.ok(hubThread.title.includes('IM Hub'), `expected "IM Hub" in title, got: ${hubThread.title}`);
    });

    it('Hub thread has connectorHubState after creation (F088 Phase G)', async () => {
      bindingStore.bind('feishu', 'chat-state', 'thread-conv-state', 'owner-1');
      const stateRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const result = await stateRouter.route('feishu', 'chat-state', '/where', 'ext-state-1');
      const hubThread = threadStore.threads.get(result.threadId);
      assert.ok(hubThread);
      assert.ok(hubThread.connectorHubState, 'Hub thread should have connectorHubState');
      assert.equal(hubThread.connectorHubState.v, 1);
      assert.equal(hubThread.connectorHubState.connectorId, 'feishu');
      assert.equal(hubThread.connectorHubState.externalChatId, 'chat-state');
      assert.ok(hubThread.connectorHubState.createdAt > 0);
    });

    it('storeCommandExchange updates lastCommandAt on Hub thread (G+)', async () => {
      bindingStore.bind('feishu', 'chat-lca', 'thread-conv-lca', 'owner-1');
      const lcaRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const beforeCmd = Date.now();
      await lcaRouter.route('feishu', 'chat-lca', '/where', 'ext-lca-1');

      const hubThread = [...threadStore.threads.values()].find(
        (t) => t.connectorHubState?.externalChatId === 'chat-lca',
      );
      assert.ok(hubThread, 'Hub thread should exist');
      assert.ok(hubThread.connectorHubState.lastCommandAt, 'lastCommandAt should be set');
      assert.ok(hubThread.connectorHubState.lastCommandAt >= beforeCmd, 'lastCommandAt should be recent');
    });

    // F134 regression: group chats must support /commands (KD-8 was incorrectly blocking them)
    it('handles /commands in group chats (F134)', async () => {
      bindingStore.bind('feishu', 'group-chat-1', 'thread-grp-1', 'owner-1');
      const result = await commandRouter.route(
        'feishu',
        'group-chat-1',
        '/where',
        'ext-grp-cmd-1',
        undefined,
        undefined,
        'group',
      );
      assert.equal(result.kind, 'command');
      assert.equal(adapterSendCalls.length, 1);
      assert.equal(adapterSendCalls[0].content, 'You are here');
      assert.equal(cmdTrigger.calls.length, 0);
    });

    // F134 regression: group Hub title includes chatName to distinguish multiple groups
    it('group Hub thread title includes chatName (F134)', async () => {
      bindingStore.bind('feishu', 'grp-hub-1', 'thread-grp-hub-1', 'owner-1');
      const hubRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: cmdTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockCommandLayer({
          '/where': { kind: 'where', response: 'info' },
        }),
        adapters: new Map([['feishu', mockAdapter()]]),
      });

      const result = await hubRouter.route(
        'feishu',
        'grp-hub-1',
        '/where',
        'ext-grp-hub-1',
        undefined,
        undefined,
        'group',
        '智能体咖啡测试群',
      );
      const hubThread = threadStore.threads.get(result.threadId);
      assert.ok(hubThread);
      assert.ok(hubThread.title.includes('智能体咖啡测试群'), `expected chatName in Hub title, got: ${hubThread.title}`);
      assert.ok(hubThread.title.includes('IM Hub'));
    });
  });

  // ── F134 Phase D: Permission tests ──
  describe('Phase D permissions', () => {
    let permRouter;
    let permSendCalls;
    let permTrigger;

    function mockPermCommandLayer(responses) {
      return {
        async handle(_cid, _ecid, _uid, text, _sid) {
          const cmd = text.trim().split(/\s+/)[0].toLowerCase();
          return responses[cmd] ?? { kind: 'not-command' };
        },
      };
    }

    function mockPermAdapter() {
      permSendCalls = [];
      return {
        async sendReply(externalChatId, content) {
          permSendCalls.push({ externalChatId, content });
        },
      };
    }

    beforeEach(async () => {
      permTrigger = mockTrigger();
      const { MemoryConnectorPermissionStore } = await import(
        '../dist/infrastructure/connectors/ConnectorPermissionStore.js'
      );
      const permStore = new MemoryConnectorPermissionStore();
      await permStore.setWhitelistEnabled('feishu', true);
      await permStore.allowGroup('feishu', 'allowed-group');
      await permStore.setAdminOpenIds('feishu', ['admin-user-1']);
      await permStore.setCommandAdminOnly('feishu', true);

      const adaptersMap = new Map();
      adaptersMap.set('feishu', mockPermAdapter());

      permRouter = new ConnectorRouter({
        bindingStore,
        dedup: new InboundMessageDedup(),
        messageStore,
        threadStore,
        invokeTrigger: permTrigger,
        socketManager,
        defaultUserId: 'owner-1',
        defaultAgentId: 'opus',
        log: noopLog(),
        commandLayer: mockPermCommandLayer({
          '/where': { kind: 'where', response: 'You are here' },
          '/allow-group': { kind: 'allow-group', response: 'Group allowed' },
        }),
        permissionStore: permStore,
        adapters: adaptersMap,
      });
    });

    it('AC-D1: blocks group messages when group not in whitelist', async () => {
      const result = await permRouter.route(
        'feishu',
        'blocked-group',
        'hello',
        'ext-perm-1',
        undefined,
        { id: 'user-1' },
        'group',
      );
      assert.equal(result.kind, 'skipped');
      assert.equal(result.reason, 'group_not_allowed');
      assert.equal(permSendCalls.length, 1);
      assert.ok(permSendCalls[0].content.includes('未授权'));
    });

    it('AC-D1: allows admin /allow-group in blocked group before whitelist check', async () => {
      const result = await permRouter.route(
        'feishu',
        'blocked-group',
        '/allow-group',
        'ext-perm-allow-1',
        undefined,
        { id: 'admin-user-1' },
        'group',
      );
      assert.equal(result.kind, 'command');
      assert.equal(permSendCalls.length, 1);
      assert.equal(permSendCalls[0].content, 'Group allowed');
    });

    it('AC-D1: allows group messages when group is whitelisted', async () => {
      bindingStore.bind('feishu', 'allowed-group', 'thread-allowed', 'owner-1');
      const result = await permRouter.route(
        'feishu',
        'allowed-group',
        'hello',
        'ext-perm-2',
        undefined,
        { id: 'user-1' },
        'group',
      );
      assert.equal(result.kind, 'routed');
      assert.equal(permTrigger.calls.length, 1);
    });

    it('AC-D3: blocks /command from non-admin in group', async () => {
      bindingStore.bind('feishu', 'allowed-group', 'thread-allowed2', 'owner-1');
      const result = await permRouter.route(
        'feishu',
        'allowed-group',
        '/where',
        'ext-perm-3',
        undefined,
        { id: 'non-admin-user' },
        'group',
      );
      assert.equal(result.kind, 'skipped');
      assert.equal(result.reason, 'command_admin_only');
      assert.ok(permSendCalls[0].content.includes('管理员'));
    });

    it('AC-D3: allows /command from admin in group', async () => {
      bindingStore.bind('feishu', 'allowed-group', 'thread-allowed3', 'owner-1');
      const result = await permRouter.route(
        'feishu',
        'allowed-group',
        '/where',
        'ext-perm-4',
        undefined,
        { id: 'admin-user-1' },
        'group',
      );
      assert.equal(result.kind, 'command');
    });

    it('AC-D5: DM messages bypass whitelist (no restriction on @bot)', async () => {
      const result = await permRouter.route('feishu', 'dm-chat', 'hello', 'ext-perm-5', undefined, undefined, 'p2p');
      assert.equal(result.kind, 'routed');
    });

    it('AC-D5: DM /commands bypass admin check', async () => {
      bindingStore.bind('feishu', 'dm-chat-cmd', 'thread-dm-cmd', 'owner-1');
      const result = await permRouter.route(
        'feishu',
        'dm-chat-cmd',
        '/where',
        'ext-perm-6',
        undefined,
        undefined,
        'p2p',
      );
      assert.equal(result.kind, 'command');
    });
  });
});
