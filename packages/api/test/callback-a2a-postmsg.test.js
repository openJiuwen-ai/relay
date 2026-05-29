/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Regression tests for post_message @mention → A2A invocation
 *
 * Validates:
 * - P1-1: No @ → no invocation triggered
 * - P1-2: Inline @ (行中) → no invocation triggered
 * - Line-start @ → mentions stored correctly
 * - P2-1: Deleting race → record marked canceled
 */

import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import Fastify from 'fastify';

// Ensure officeClawRegistry is populated for agentId validation tests
before(() => {
  for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
    if (!officeClawRegistry.has(id)) officeClawRegistry.register(id, config);
  }
});

function createMockSocketManager() {
  const messages = [];
  const roomEvents = [];
  return {
    broadcastAgentMessage(msg) {
      messages.push(msg);
    },
    broadcastToRoom(room, event, data) {
      roomEvents.push({ room, event, data });
    },
    getMessages() {
      return messages;
    },
    getRoomEvents() {
      return roomEvents;
    },
  };
}

function createMockInvocationRecordStore() {
  const records = [];
  const updates = [];
  return {
    create(input) {
      const id = `inv-${records.length}`;
      records.push({ id, ...input });
      return { outcome: 'created', invocationId: id };
    },
    update(id, data) {
      updates.push({ id, ...data });
      return { id, ...data };
    },
    getRecords() {
      return records;
    },
    getUpdates() {
      return updates;
    },
  };
}

function createMockRouter() {
  const executions = [];
  return {
    async *routeExecution(userId, message, threadId, _userMessageId, targetAgents, _intent) {
      executions.push({ userId, message, threadId, targetAgents });
      // Yield a done message
      yield {
        type: 'done',
        agentId: targetAgents[0],
        isFinal: true,
        timestamp: Date.now(),
      };
    },
    getExecutions() {
      return executions;
    },
  };
}

describe('post_message A2A mention invocation', () => {
  let registry;
  let messageStore;
  let socketManager;
  let invocationRecordStore;
  let mockRouter;

  beforeEach(async () => {
    const { InvocationRegistry } = await import(
      '../dist/domains/agents/services/agents/invocation/InvocationRegistry.js'
    );
    const { MessageStore } = await import('../dist/domains/agents/services/stores/ports/MessageStore.js');

    registry = new InvocationRegistry();
    messageStore = new MessageStore();
    socketManager = createMockSocketManager();
    invocationRecordStore = createMockInvocationRecordStore();
    mockRouter = createMockRouter();
  });

  async function createApp(opts = {}) {
    const { callbacksRoutes } = await import('../dist/routes/callbacks.js');
    const app = Fastify();
    await app.register(callbacksRoutes, {
      registry,
      messageStore,
      socketManager,
      router: mockRouter,
      invocationRecordStore,
      ...opts,
    });
    return app;
  }

  // P1-1 regression: no @ → no invocation
  test('post-message without @ does NOT trigger invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: { invocationId, callbackToken, content: 'Just a status update, no mentions' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      invocationRecordStore.getRecords().length,
      0,
      'No InvocationRecord should be created for non-@ messages',
    );
    assert.equal(mockRouter.getExecutions().length, 0, 'routeExecution should not be called');
  });

  // P1-2 regression: inline @ → no invocation
  test('post-message with inline @ (行中) does NOT trigger invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '这个方案里，之前 @assistant 提过类似的思路',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      invocationRecordStore.getRecords().length,
      0,
      'Inline @mentions (行中) must not trigger A2A invocation',
    );
  });

  // P1-2 regression: @ inside code block → no invocation
  test('post-message with @ in code block does NOT trigger invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '看看这段代码:\n```\n@assistant 这里是注释\n```\n完毕',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      invocationRecordStore.getRecords().length,
      0,
      '@mentions inside code blocks must not trigger invocation',
    );
  });

  // Positive case: line-start @ → mentions stored + invocation created
  test('post-message with line-start @ stores mentions and triggers invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '修复完成了\n@assistant\n请帮忙 review',
      },
    });

    assert.equal(response.statusCode, 200);

    // Mentions should be stored on the message
    const recent = messageStore.getRecent(10);
    assert.equal(recent.length, 1);
    assert.ok(recent[0].mentions.includes('codex'), 'Message should store codex as mention (Codex = codex)');

    // InvocationRecord should be created
    assert.equal(invocationRecordStore.getRecords().length, 1);
    assert.deepEqual(invocationRecordStore.getRecords()[0].targetAgents, ['codex']);
  });

  // Content-before-mention regression: 上面写内容，最后一行 @ (Codex习惯)
  test('post-message with content-before-mention triggers invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '这是交接文档，DARE 源码目录执行\n是否接受完全禁用 --api-key argv\n@assistant',
      },
    });

    assert.equal(response.statusCode, 200);

    const recent = messageStore.getRecent(10);
    const lastMsg = recent[recent.length - 1];
    assert.ok(
      lastMsg.mentions.includes('codex'),
      'Content-before-mention: codex should be mentioned when @assistant is on last line',
    );

    const records = invocationRecordStore.getRecords();
    const a2aRecord = records.find((r) => r.targetAgents.includes('codex'));
    assert.ok(a2aRecord, 'Content-before-mention should trigger A2A invocation for codex');
  });

  test('post-message skips redundant A2A when target already covered by active parent invocation', async () => {
    const mockInvocationTracker = {
      has() {
        return true;
      },
      getAgentIds() {
        return ['opus', 'codex', 'gemini'];
      },
      getActiveSlots() {
        return ['opus', 'codex', 'gemini'];
      },
      start() {
        return new AbortController();
      },
      complete() {},
    };
    const app = await createApp({ invocationTracker: mockInvocationTracker });
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '同步一下\n@assistant\n这条是冗余提醒',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(invocationRecordStore.getRecords().length, 0, 'Redundant A2A should not create InvocationRecord');
    assert.equal(mockRouter.getExecutions().length, 0, 'Redundant A2A should not call routeExecution');
  });

  // F108 slot-aware: opus active, @codex in different slot → codex SHOULD be invoked
  test('post-message wakes codex when opus is active in different slot (slot-aware fallback)', async () => {
    const mockInvocationTracker = {
      has() {
        return true;
      },
      getActiveSlots() {
        return ['opus']; // only opus is active, codex is NOT
      },
      start() {
        return new AbortController();
      },
      complete() {},
    };
    const app = await createApp({ invocationTracker: mockInvocationTracker });
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '修完了，请帮忙 review\n@assistant',
      },
    });

    assert.equal(response.statusCode, 200);
    // codex should be invoked even though opus is active
    assert.equal(invocationRecordStore.getRecords().length, 1, 'Should create InvocationRecord for codex');
    assert.deepEqual(
      invocationRecordStore.getRecords()[0].targetAgents,
      ['codex'],
      'codex should be invoked (different slot from active opus)',
    );
  });

  // F108 slot-aware: opus active, explicit targetAgents:["codex"] → codex SHOULD be invoked
  test('post-message with targetAgents wakes codex when opus is active (no worklist)', async () => {
    const mockInvocationTracker = {
      has() {
        return true;
      },
      getActiveSlots() {
        return ['opus'];
      },
      start() {
        return new AbortController();
      },
      complete() {},
    };
    const app = await createApp({ invocationTracker: mockInvocationTracker });
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '用户快看！有事情！',
        targetAgents: ['codex'],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      invocationRecordStore.getRecords().length,
      1,
      'Should create InvocationRecord for codex via targetAgents',
    );
    assert.deepEqual(invocationRecordStore.getRecords()[0].targetAgents, ['codex']);
  });

  // Invalid agentId in explicitTargetCats → filtered out, no A2A crash
  test('post-message with invalid agentId in targetAgents is filtered gracefully', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '用户快看！有事情！',
        targetAgents: ['default-user'],
      },
    });

    assert.equal(response.statusCode, 200, 'Should succeed (graceful degradation, not 400)');
    // Message should still be stored
    const recent = messageStore.getRecent(10);
    assert.equal(recent.length, 1, 'Message should still be stored');
    // No A2A invocation should be triggered for invalid agentId
    assert.equal(invocationRecordStore.getRecords().length, 0, 'Invalid agentId must not trigger A2A');
    assert.equal(mockRouter.getExecutions().length, 0, 'routeExecution should not be called');
  });

  // Mixed valid + invalid targetAgents → only valid ones enter A2A
  test('post-message with mixed valid/invalid targetAgents keeps only valid ones', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '通知一下',
        targetAgents: ['codex', 'default-user', 'nonexistent-cat'],
      },
    });

    assert.equal(response.statusCode, 200);
    // A2A should fire for codex only
    const records = invocationRecordStore.getRecords();
    assert.equal(records.length, 1, 'Should create InvocationRecord for valid target');
    assert.deepEqual(records[0].targetAgents, ['codex'], 'Only valid agentId (codex) should be in targetAgents');
  });

  test('single line-start mention drops polluted explicit targetAgents extras (fail-closed)', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '请帮忙复核\n@assistant',
        targetAgents: ['codex', 'gemini'],
      },
    });

    assert.equal(response.statusCode, 200);
    const records = invocationRecordStore.getRecords();
    assert.equal(records.length, 1, 'single mention should enqueue exactly one target');
    assert.deepEqual(records[0].targetAgents, ['codex'], 'extra explicit target should be dropped');

    const recent = messageStore.getRecent(10);
    assert.equal(recent.length, 1);
    assert.ok(recent[0].mentions.includes('codex'));
    assert.equal(recent[0].mentions.includes('gemini'), false, 'gemini must not be injected into mentions');
  });

  // Self-mention filter: opus @claude → no invocation (can't invoke self)
  test('post-message self-mention does NOT trigger invocation', async () => {
    const app = await createApp();
    const { invocationId, callbackToken } = registry.create('user-1', 'opus', { threadId: 't1' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '@claude\n这是自我引用测试',
      },
    });

    assert.equal(response.statusCode, 200);
    // parseA2AMentions filters self-mentions, so no invocation
    assert.equal(invocationRecordStore.getRecords().length, 0, 'Self-mention must not trigger invocation');
  });
});

describe('F052: cross-thread A2A mention routing', () => {
  let registry;
  let messageStore;
  let threadStore;
  let socketManager;
  let invocationRecordStore;
  let mockRouter;

  beforeEach(async () => {
    const { InvocationRegistry } = await import(
      '../dist/domains/agents/services/agents/invocation/InvocationRegistry.js'
    );
    const { MessageStore } = await import('../dist/domains/agents/services/stores/ports/MessageStore.js');
    const { ThreadStore } = await import('../dist/domains/agents/services/stores/ports/ThreadStore.js');

    registry = new InvocationRegistry();
    messageStore = new MessageStore();
    threadStore = new ThreadStore();
    socketManager = createMockSocketManager();
    invocationRecordStore = createMockInvocationRecordStore();
    mockRouter = createMockRouter();
  });

  async function createAppWithThreadStore() {
    const { callbacksRoutes } = await import('../dist/routes/callbacks.js');
    const app = Fastify();
    await app.register(callbacksRoutes, {
      registry,
      messageStore,
      threadStore,
      socketManager,
      router: mockRouter,
      invocationRecordStore,
    });
    return app;
  }

  test('cross-thread @codex from codex is NOT filtered (includes codex in mentions)', async () => {
    const app = await createAppWithThreadStore();
    const sourceThread = await threadStore.create('user-1', 'A2A Source Thread');
    const targetThread = await threadStore.create('user-1', 'A2A Target Thread');

    const { invocationId, callbackToken } = registry.create('user-1', 'codex', sourceThread.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        allowCrossThread: true,
        content: '@codex 请处理这个跨线程任务',
        threadId: targetThread.id,
      },
    });

    assert.equal(res.statusCode, 200);
    const msgs = messageStore.getByThread(targetThread.id, 10, 'user-1');
    const crossMsg = msgs.find((m) => m.content.includes('跨线程任务'));
    assert.ok(crossMsg, 'cross-thread message should be stored');
    assert.ok(crossMsg.mentions.includes('codex'), 'cross-thread @codex should be in mentions');
  });

  test('same-thread @codex from codex still filtered (self-reference)', async () => {
    const app = await createAppWithThreadStore();
    const thread = await threadStore.create('user-1', 'Self Ref Thread');

    const { invocationId, callbackToken } = registry.create('user-1', 'codex', thread.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/post-message',
      payload: {
        invocationId,
        callbackToken,
        content: '@codex 请处理',
        threadId: thread.id,
      },
    });

    assert.equal(res.statusCode, 200);
    const msgs = messageStore.getByThread(thread.id, 10, 'user-1');
    const msg = msgs.find((m) => m.content.includes('请处理'));
    assert.ok(msg);
    assert.ok(!msg.mentions.includes('codex'), 'same-thread @codex from codex should be filtered');
  });
});
